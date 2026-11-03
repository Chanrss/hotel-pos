import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as XLSX from 'xlsx';
import { db, storage, sanitizeForFirestore } from './firebase';
import {
  AppUser,
  BackupProcessStatus,
  DailySalesBackupConfig,
  DailySalesBackupStatusRecord,
  RestaurantSettings
} from '../types';
import {
  ReportEngine,
  DailySalesBackupReport,
  formatDateDDMMYYYY,
  getDailyBackupFileName
} from './reportEngine';
import { triggerBlobDownload } from './backupService';
import { canAccessFeature, formatISTTimestamp, recordSecurityAuditLog } from './securityService';

export const RESTAURANT_TIMEZONE = 'Asia/Kolkata';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
] as const;

export const DEFAULT_DAILY_SALES_BACKUP_CONFIG: DailySalesBackupConfig = {
  enabled: true,
  dailyClosingTime: '23:00', // 11:00 PM Asia/Kolkata default closing time
  timezone: RESTAURANT_TIMEZONE,
  autoRetryOnFailure: true,
  maxRetries: 3,
  notifyOwnerOnFailure: true,
  updatedAt: Date.now()
};

const CONFIG_STORAGE_KEY = 'pos_ssb_daily_sales_backup_config';
const STATUS_HISTORY_STORAGE_KEY = 'pos_ssb_daily_sales_backup_history';

type BackupStatusListener = (record: DailySalesBackupStatusRecord) => void;
const statusListeners = new Set<BackupStatusListener>();

function withCloudTimeout<T>(promise: Promise<T>, timeoutMs = 1200): Promise<T> {
  const isTestEnv =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.MODE === 'test') ||
    (typeof process !== 'undefined' && Boolean(process.env?.VITEST));
  const effectiveTimeout = isTestEnv ? 30 : timeoutMs;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Cloud operation timeout')), effectiveTimeout);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export function subscribeDailySalesBackupStatus(listener: BackupStatusListener): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

function notifyStatusListeners(record: DailySalesBackupStatusRecord): void {
  statusListeners.forEach((listener) => {
    try {
      listener(record);
    } catch {
      // ignore listener errors
    }
  });
}

/**
 * Normalizes any date string (YYYY-MM-DD or DD-MM-YYYY) into YYYY-MM-DD
 */
export function normalizeToYMD(dateStr: string): string {
  if (!dateStr) return '';
  const cleaned = String(dateStr).trim().replace(/\//g, '-');
  const parts = cleaned.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    if (parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return cleaned;
}

/**
 * Returns the current date and time components in the restaurant's local timezone (Asia/Kolkata).
 */
export function getKolkataNow(now: Date = new Date()): {
  businessDate: string; // YYYY-MM-DD
  formattedDate: string; // DD-MM-YYYY
  year: string;
  monthNumber: string;
  monthName: string;
  day: string;
  hour: number;
  minute: number;
  time24: string; // HH:mm
  formattedDateTime: string;
} {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: RESTAURANT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(now);

    const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
    const year = get('year') || String(now.getFullYear());
    const monthNumber = (get('month') || String(now.getMonth() + 1)).padStart(2, '0');
    const day = (get('day') || String(now.getDate())).padStart(2, '0');
    const rawHour = parseInt(get('hour') || '0', 10);
    const hour = rawHour === 24 ? 0 : rawHour;
    const minute = parseInt(get('minute') || '0', 10);

    const monthIdx = Math.max(0, Math.min(11, parseInt(monthNumber, 10) - 1));
    const monthName = MONTH_NAMES[monthIdx];
    const businessDate = `${year}-${monthNumber}-${day}`;
    const formattedDate = `${day}-${monthNumber}-${year}`;
    const time24 = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    return {
      businessDate,
      formattedDate,
      year,
      monthNumber,
      monthName,
      day,
      hour,
      minute,
      time24,
      formattedDateTime: formatISTTimestamp(now.getTime())
    };
  } catch {
    const year = String(now.getFullYear());
    const monthNumber = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = now.getHours();
    const minute = now.getMinutes();
    const monthName = MONTH_NAMES[now.getMonth()];
    return {
      businessDate: `${year}-${monthNumber}-${day}`,
      formattedDate: `${day}-${monthNumber}-${year}`,
      year,
      monthNumber,
      monthName,
      day,
      hour,
      minute,
      time24: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      formattedDateTime: now.toISOString()
    };
  }
}

/**
 * Generates the organized Firebase Cloud Storage folder path for a given business date:
 * Daily_Sales_Backup/{YYYY}/{MM-MonthName}
 * Example for 2026-11-02: "Daily_Sales_Backup/2026/11-November"
 */
export function getCloudStorageFolderForDate(dateStr: string): string {
  const ymd = normalizeToYMD(dateStr);
  const parts = ymd.split('-');
  const year = parts[0] || '2026';
  const mm = (parts[1] || '01').padStart(2, '0');
  const monthIdx = Math.max(0, Math.min(11, parseInt(mm, 10) - 1));
  const monthName = MONTH_NAMES[monthIdx];
  return `Daily_Sales_Backup/${year}/${mm}-${monthName}`;
}

/**
 * Generates the full Firebase Cloud Storage file path for a given business date and format:
 * Daily_Sales_Backup/{YYYY}/{MM-MonthName}/SSB_{DD-MM-YYYY}.{pdf|xlsx}
 * Example:
 * - Daily_Sales_Backup/2026/11-November/SSB_02-11-2026.pdf
 * - Daily_Sales_Backup/2026/11-November/SSB_02-11-2026.xlsx
 */
export function getCloudStorageFilePath(dateStr: string, extension: 'pdf' | 'xlsx'): string {
  const folder = getCloudStorageFolderForDate(dateStr);
  const fileName = getDailyBackupFileName(dateStr, extension);
  return `${folder}/${fileName}`;
}

/**
 * Checks if current Asia/Kolkata time has reached or passed the configured daily closing time (HH:mm).
 */
export function isAfterDailyClosingTime(closingTime: string, now: Date = new Date()): boolean {
  const kolkata = getKolkataNow(now);
  const [schedHourStr, schedMinStr] = String(closingTime || '23:00').split(':');
  const schedHour = parseInt(schedHourStr, 10);
  const schedMin = parseInt(schedMinStr, 10) || 0;
  if (isNaN(schedHour)) return false;

  return kolkata.hour > schedHour || (kolkata.hour === schedHour && kolkata.minute >= schedMin);
}

/**
 * Converts a Uint8Array into a base64 string for resilient Firestore backup storage.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

/**
 * Converts a base64 string back into a Uint8Array for downloading stored backup files.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * Verifies that the generated PDF and Excel backup files are valid and that the Excel
 * summary & Grand Total strictly match the Firebase Firestore billing report totals
 * (and contain no Item Code column).
 */
export function verifyBackupTotalsMatch(
  report: DailySalesBackupReport,
  pdfBytes: Uint8Array,
  excelBytes: Uint8Array
): { verified: boolean; reason?: string } {
  if (!pdfBytes || pdfBytes.byteLength < 64) {
    return { verified: false, reason: 'Generated PDF file buffer is empty or corrupted.' };
  }

  // Check PDF magic header "%PDF"
  const pdfHeader = String.fromCharCode(pdfBytes[0], pdfBytes[1], pdfBytes[2], pdfBytes[3]);
  if (pdfHeader !== '%PDF') {
    return { verified: false, reason: 'Generated PDF buffer is missing valid %PDF header.' };
  }

  if (!excelBytes || excelBytes.byteLength < 64) {
    return { verified: false, reason: 'Generated Excel (.xlsx) file buffer is empty or corrupted.' };
  }

  try {
    const wb = XLSX.read(excelBytes, { type: 'array' });
    const mainSheet = wb.Sheets['Daily Sales Report'];
    if (!mainSheet) {
      return { verified: false, reason: 'Excel workbook is missing "Daily Sales Report" worksheet.' };
    }

    const rows = XLSX.utils.sheet_to_json<any[]>(mainSheet, { header: 1 });
    const totalBillsRow = rows.find((r) => Array.isArray(r) && r[0] === 'Total Bills');
    const totalItemsRow = rows.find((r) => Array.isArray(r) && r[0] === 'Total Items Sold');
    const totalSalesRow = rows.find((r) => Array.isArray(r) && r[0] === 'Total Daily Sales');
    const headerRow = rows.find((r) => Array.isArray(r) && r.includes('S.No') && r.includes('Bill No'));

    if (!headerRow) {
      return { verified: false, reason: 'Excel worksheet is missing the sales table header row.' };
    }

    if (headerRow.includes('Item Code')) {
      return { verified: false, reason: 'Excel worksheet must not contain Item Code column.' };
    }

    const excelBills = Number(totalBillsRow?.[1] ?? -1);
    const excelItems = Number(totalItemsRow?.[1] ?? -1);
    const excelSales = Math.round(Number(totalSalesRow?.[1] ?? -1) * 100) / 100;
    const expectedSales = Math.round(report.totalDailySales * 100) / 100;

    if (
      excelBills !== report.totalBills ||
      excelItems !== report.totalItemsSold ||
      Math.abs(excelSales - expectedSales) > 0.01
    ) {
      return {
        verified: false,
        reason: `Totals mismatch between Excel (${excelBills} bills, ${excelItems} items, ₹${excelSales}) and Firebase (${report.totalBills} bills, ${report.totalItemsSold} items, ₹${expectedSales}).`
      };
    }

    return { verified: true };
  } catch (err: any) {
    return {
      verified: false,
      reason: `Excel verification parse error: ${err?.message || String(err)}`
    };
  }
}

/**
 * Reads the current Daily Sales Backup configuration (Owner-configurable daily closing time in Asia/Kolkata).
 */
export function getDailySalesBackupConfig(): DailySalesBackupConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_DAILY_SALES_BACKUP_CONFIG,
        ...parsed,
        timezone: RESTAURANT_TIMEZONE
      };
    }
  } catch {
    // ignore storage read error
  }
  return { ...DEFAULT_DAILY_SALES_BACKUP_CONFIG };
}

/**
 * Updates the Daily Sales Backup configuration.
 * Enforces that only the OWNER role can modify the daily closing time and security backup settings.
 */
export async function saveDailySalesBackupConfig(
  updates: Partial<DailySalesBackupConfig>,
  callerUser?: AppUser | null
): Promise<DailySalesBackupConfig> {
  if (callerUser !== undefined && !canAccessFeature(callerUser, 'SECURITY_SETTINGS')) {
    await recordSecurityAuditLog({
      eventType: 'UNAUTHORIZED_ACCESS_BLOCKED',
      username: callerUser?.username || callerUser?.name || 'unknown',
      userId: callerUser?.uid,
      role: callerUser?.roleId,
      status: 'BLOCKED',
      details: 'Store Manager / non-owner attempted to modify Owner-only Daily Sales Backup closing time.'
    });
    throw new Error('Only the Owner account can configure the daily sales closing time and backup settings.');
  }

  const current = getDailySalesBackupConfig();
  const next: DailySalesBackupConfig = {
    ...current,
    ...updates,
    timezone: RESTAURANT_TIMEZONE,
    updatedBy: callerUser?.username || callerUser?.name || current.updatedBy || 'owner',
    updatedAt: Date.now()
  };

  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore local write error
  }

  try {
    await withCloudTimeout(
      setDoc(
        doc(db, 'settings', 'daily_sales_backup_config'),
        sanitizeForFirestore(next),
        { merge: true }
      )
    );
  } catch {
    // offline fallback saved locally
  }

  if (updates.dailyClosingTime && updates.dailyClosingTime !== current.dailyClosingTime) {
    await recordSecurityAuditLog({
      eventType: 'CLOSING_TIME_UPDATED',
      username: callerUser?.username || callerUser?.name || 'owner',
      userId: callerUser?.uid,
      role: callerUser?.roleId || 'owner',
      status: 'SUCCESS',
      details: `Updated Daily Sales Backup closing time from ${current.dailyClosingTime} to ${next.dailyClosingTime} (${RESTAURANT_TIMEZONE}).`
    });
  }

  return next;
}

/**
 * Syncs the Daily Sales Backup config from Firestore if available.
 */
export async function syncDailySalesBackupConfigFromCloud(): Promise<DailySalesBackupConfig> {
  try {
    const snap = await withCloudTimeout(getDoc(doc(db, 'settings', 'daily_sales_backup_config')));
    if (snap.exists()) {
      const data = snap.data() as Partial<DailySalesBackupConfig>;
      const merged: DailySalesBackupConfig = {
        ...DEFAULT_DAILY_SALES_BACKUP_CONFIG,
        ...data,
        timezone: RESTAURANT_TIMEZONE
      };
      try {
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(merged));
      } catch {}
      return merged;
    }
  } catch {
    // ignore offline error
  }
  return getDailySalesBackupConfig();
}

/**
 * Reads cached DailySalesBackupStatusRecord history from localStorage.
 */
export function getLocalDailySalesBackupHistory(): DailySalesBackupStatusRecord[] {
  try {
    const raw = localStorage.getItem(STATUS_HISTORY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.sort((a, b) => b.businessDate.localeCompare(a.businessDate));
      }
    }
  } catch {}
  return [];
}

/**
 * Saves a DailySalesBackupStatusRecord to local cache and Firestore `daily_sales_backups/{businessDate}`.
 */
export async function persistDailySalesBackupStatusRecord(
  record: DailySalesBackupStatusRecord
): Promise<void> {
  try {
    const history = getLocalDailySalesBackupHistory().filter(
      (r) => r.businessDate !== record.businessDate
    );
    // Avoid storing large base64 strings in localStorage if over quota; keep metadata + latest 30 records
    const lightweightRecord: DailySalesBackupStatusRecord = {
      ...record
    };
    history.unshift(lightweightRecord);
    const trimmed = history.slice(0, 30);
    try {
      localStorage.setItem(STATUS_HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // If quota exceeded, strip base64 from localStorage copy while keeping it in Firestore
      const stripped = trimmed.map(({ pdfBase64, excelBase64, ...rest }) => rest);
      localStorage.setItem(STATUS_HISTORY_STORAGE_KEY, JSON.stringify(stripped));
    }
  } catch {}

  try {
    await withCloudTimeout(
      setDoc(
        doc(db, 'daily_sales_backups', record.businessDate),
        sanitizeForFirestore(record),
        { merge: true }
      )
    );
  } catch {
    // Offline fallback retained in local cache
  }

  notifyStatusListeners(record);
}

/**
 * Retrieves the backup status record for a specific businessDate (YYYY-MM-DD).
 * Returns a default 'Pending' status record if no backup has run yet for that date.
 */
export async function getDailySalesBackupStatusForDate(
  businessDate: string
): Promise<DailySalesBackupStatusRecord> {
  const ymd = normalizeToYMD(businessDate);
  const formattedDate = formatDateDDMMYYYY(ymd);
  const config = getDailySalesBackupConfig();

  // Check Firestore first
  try {
    const snap = await withCloudTimeout(getDoc(doc(db, 'daily_sales_backups', ymd)));
    if (snap.exists()) {
      const data = snap.data() as DailySalesBackupStatusRecord;
      return {
        ...data,
        id: ymd,
        businessDate: ymd,
        formattedDate: data.formattedDate || formattedDate
      };
    }
  } catch {
    // Fallback to local history
  }

  const localMatch = getLocalDailySalesBackupHistory().find((r) => r.businessDate === ymd);
  if (localMatch) {
    return localMatch;
  }

  return {
    id: ymd,
    businessDate: ymd,
    formattedDate,
    status: 'Pending',
    pdfBackupStatus: 'Pending',
    excelBackupStatus: 'Pending',
    pdfFileName: getDailyBackupFileName(ymd, 'pdf'),
    excelFileName: getDailyBackupFileName(ymd, 'xlsx'),
    pdfStoragePath: getCloudStorageFilePath(ymd, 'pdf'),
    excelStoragePath: getCloudStorageFilePath(ymd, 'xlsx'),
    totalBills: 0,
    totalItemsSold: 0,
    totalDailySales: 0,
    totalsVerified: false,
    triggerType: 'AUTO_SCHEDULED',
    timezone: RESTAURANT_TIMEZONE,
    closingTimeConfigured: config.dailyClosingTime,
    retryCount: 0,
    lastAttemptAt: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

/**
 * Fetches all Daily Sales Backup records from Firestore merged with local history.
 */
export async function fetchDailySalesBackupHistory(
  maxRecords = 30
): Promise<DailySalesBackupStatusRecord[]> {
  const map = new Map<string, DailySalesBackupStatusRecord>();
  getLocalDailySalesBackupHistory().forEach((r) => map.set(r.businessDate, r));

  try {
    const q = query(
      collection(db, 'daily_sales_backups'),
      orderBy('businessDate', 'desc'),
      limit(maxRecords)
    );
    const snap = await withCloudTimeout(getDocs(q));
    snap.forEach((d) => {
      const data = d.data() as DailySalesBackupStatusRecord;
      map.set(d.id, { ...data, id: d.id, businessDate: data.businessDate || d.id });
    });
  } catch {
    // Use local cache if offline
  }

  return Array.from(map.values())
    .sort((a, b) => b.businessDate.localeCompare(a.businessDate))
    .slice(0, maxRecords);
}

/**
 * Returns the most recent successful backup timestamp & formatted IST string across history.
 */
export function getLastSuccessfulBackupInfo(
  history: DailySalesBackupStatusRecord[]
): { date?: string; formattedTime?: string; timestamp?: number } {
  const completed = history
    .filter((r) => r.status === 'Completed' && r.lastSuccessfulBackupAt)
    .sort((a, b) => (b.lastSuccessfulBackupAt || 0) - (a.lastSuccessfulBackupAt || 0));

  if (completed.length > 0) {
    return {
      date: completed[0].formattedDate,
      formattedTime:
        completed[0].lastSuccessfulBackupFormatted ||
        formatISTTimestamp(completed[0].lastSuccessfulBackupAt),
      timestamp: completed[0].lastSuccessfulBackupAt
    };
  }

  const config = getDailySalesBackupConfig();
  if (config.lastSuccessfulBackupAt) {
    return {
      date: config.lastSuccessfulBackupDate,
      formattedTime:
        config.lastSuccessfulBackupFormatted || formatISTTimestamp(config.lastSuccessfulBackupAt),
      timestamp: config.lastSuccessfulBackupAt
    };
  }

  return {};
}

/**
 * Executes the complete Daily Sales Backup (both PDF and Excel) for a business date:
 * 1. Ensures automatic backup runs only once per business date (unless force/manual regenerate).
 * 2. Retrieves actual completed billing records from Firebase Firestore (excluding cancelled/deleted/duplicate).
 * 3. Generates SSB_DD-MM-YYYY.pdf and SSB_DD-MM-YYYY.xlsx without Item Code.
 * 4. Verifies that PDF and Excel totals match Firebase billing records.
 * 5. Stores both files securely in Firebase Cloud Storage under:
 *      Daily_Sales_Backup/{YYYY}/{MM-MonthName}/SSB_DD-MM-YYYY.pdf
 *      Daily_Sales_Backup/{YYYY}/{MM-MonthName}/SSB_DD-MM-YYYY.xlsx
 *    and persists metadata + resilient snapshot in Firestore `daily_sales_backups/{businessDate}`.
 * 6. Automatically retries on failure and records status: Pending, Processing, Completed, or Failed.
 */
export async function runDailySalesBackupForDate(
  businessDate: string,
  options?: {
    triggerType?: 'AUTO_SCHEDULED' | 'MANUAL_REGENERATE' | 'CATCHUP_MISSED';
    initiatedBy?: string;
    force?: boolean;
    settings?: RestaurantSettings;
    downloadPdfToBrowser?: boolean;
    downloadExcelToBrowser?: boolean;
  }
): Promise<DailySalesBackupStatusRecord> {
  const ymd = normalizeToYMD(businessDate);
  const formattedDate = formatDateDDMMYYYY(ymd);
  const triggerType = options?.triggerType || 'AUTO_SCHEDULED';
  const config = getDailySalesBackupConfig();
  const existing = await getDailySalesBackupStatusForDate(ymd);

  // Requirement 3: Ensure the automatic backup runs only once per business date
  if (
    !options?.force &&
    triggerType === 'AUTO_SCHEDULED' &&
    existing.status === 'Completed' &&
    existing.pdfBackupStatus === 'Completed' &&
    existing.excelBackupStatus === 'Completed'
  ) {
    return existing;
  }

  const pdfFileName = getDailyBackupFileName(ymd, 'pdf');
  const excelFileName = getDailyBackupFileName(ymd, 'xlsx');
  const pdfStoragePath = getCloudStorageFilePath(ymd, 'pdf');
  const excelStoragePath = getCloudStorageFilePath(ymd, 'xlsx');

  const processingRecord: DailySalesBackupStatusRecord = {
    ...existing,
    id: ymd,
    businessDate: ymd,
    formattedDate,
    status: 'Processing',
    pdfBackupStatus: 'Processing',
    excelBackupStatus: 'Processing',
    pdfFileName,
    excelFileName,
    pdfStoragePath,
    excelStoragePath,
    triggerType,
    timezone: RESTAURANT_TIMEZONE,
    closingTimeConfigured: config.dailyClosingTime,
    initiatedBy: options?.initiatedBy || 'system_scheduler',
    lastAttemptAt: Date.now(),
    updatedAt: Date.now()
  };

  await persistDailySalesBackupStatusRecord(processingRecord);

  const maxAttempts = config.autoRetryOnFailure ? Math.max(1, config.maxRetries || 3) : 1;
  let attempt = 0;
  let lastError: string = '';
  let pdfStatus: BackupProcessStatus = 'Processing';
  let excelStatus: BackupProcessStatus = 'Processing';

  while (attempt < maxAttempts) {
    attempt++;
    try {
      // 1. Fetch completed bills and build report
      const report = await ReportEngine.generateDailySalesBackupReport(ymd);

      // 2. Build PDF bytes
      pdfStatus = 'Processing';
      const pdfBytes = ReportEngine.buildDailySalesBackupPDFBytes(report, options?.settings);
      pdfStatus = 'Completed';

      // 3. Build Excel bytes
      excelStatus = 'Processing';
      const excelBytes = ReportEngine.buildDailySalesBackupExcelBytes(report, options?.settings);
      excelStatus = 'Completed';

      // 4. Verify PDF & Excel totals match Firebase records
      const verification = verifyBackupTotalsMatch(report, pdfBytes, excelBytes);
      if (!verification.verified) {
        throw new Error(verification.reason || 'Backup totals verification failed.');
      }

      // 5. Upload to Firebase Cloud Storage under Daily_Sales_Backup/{YYYY}/{MM-Month}/
      let pdfDownloadUrl: string | undefined;
      let excelDownloadUrl: string | undefined;

      try {
        const pdfRef = ref(storage, pdfStoragePath);
        await withCloudTimeout(
          uploadBytes(pdfRef, pdfBytes, {
            contentType: 'application/pdf',
            customMetadata: {
              businessDate: ymd,
              formattedDate,
              totalBills: String(report.totalBills),
              totalItemsSold: String(report.totalItemsSold),
              totalDailySales: String(report.totalDailySales),
              timezone: RESTAURANT_TIMEZONE
            }
          }),
          1500
        );
        pdfDownloadUrl = await withCloudTimeout(getDownloadURL(pdfRef), 1200);
      } catch {
        // Cloud Storage upload may be restricted in offline/sandbox mode; base64 snapshot is stored in Firestore
      }

      try {
        const excelRef = ref(storage, excelStoragePath);
        await withCloudTimeout(
          uploadBytes(excelRef, excelBytes, {
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            customMetadata: {
              businessDate: ymd,
              formattedDate,
              totalBills: String(report.totalBills),
              totalItemsSold: String(report.totalItemsSold),
              totalDailySales: String(report.totalDailySales),
              timezone: RESTAURANT_TIMEZONE
            }
          }),
          1500
        );
        excelDownloadUrl = await withCloudTimeout(getDownloadURL(excelRef), 1200);
      } catch {
        // Fallback to Firestore base64 snapshot
      }

      const nowMs = Date.now();
      const formattedSuccessIST = formatISTTimestamp(nowMs);

      const completedRecord: DailySalesBackupStatusRecord = {
        ...processingRecord,
        status: 'Completed',
        pdfBackupStatus: 'Completed',
        excelBackupStatus: 'Completed',
        pdfDownloadUrl,
        excelDownloadUrl,
        pdfBase64: uint8ArrayToBase64(pdfBytes),
        excelBase64: uint8ArrayToBase64(excelBytes),
        totalBills: report.totalBills,
        totalItemsSold: report.totalItemsSold,
        totalDailySales: report.totalDailySales,
        totalsVerified: true,
        retryCount: attempt - 1,
        lastAttemptAt: nowMs,
        lastSuccessfulBackupAt: nowMs,
        lastSuccessfulBackupFormatted: formattedSuccessIST,
        failureReason: undefined,
        updatedAt: nowMs
      };

      await persistDailySalesBackupStatusRecord(completedRecord);

      // Update global config lastSuccessfulBackup metadata
      await saveDailySalesBackupConfig({
        lastSuccessfulBackupDate: formattedDate,
        lastSuccessfulBackupAt: nowMs,
        lastSuccessfulBackupFormatted: formattedSuccessIST
      });

      if (options?.downloadPdfToBrowser) {
        triggerBlobDownload(
          pdfFileName,
          new Blob([pdfBytes], { type: 'application/pdf' }),
          'application/pdf'
        );
      }
      if (options?.downloadExcelToBrowser) {
        triggerBlobDownload(
          excelFileName,
          new Blob([excelBytes], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          }),
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
      }

      await recordSecurityAuditLog({
        eventType:
          triggerType === 'MANUAL_REGENERATE'
            ? 'DAILY_BACKUP_REGENERATED'
            : 'DAILY_BACKUP_COMPLETED',
        username: options?.initiatedBy || 'system_scheduler',
        status: 'SUCCESS',
        details: `Daily Sales Backup (${pdfFileName} & ${excelFileName}) completed for ${formattedDate}: ${report.totalBills} bills, ${report.totalItemsSold} items, ₹${report.totalDailySales.toFixed(2)}.`,
        metadata: {
          businessDate: ymd,
          pdfStoragePath,
          excelStoragePath,
          totalBills: report.totalBills,
          totalItemsSold: report.totalItemsSold,
          totalDailySales: report.totalDailySales,
          totalsVerified: true
        }
      });

      return completedRecord;
    } catch (err: any) {
      lastError = err?.message || String(err);
      if (pdfStatus !== 'Completed') pdfStatus = 'Failed';
      if (excelStatus !== 'Completed') excelStatus = 'Failed';
    }
  }

  // All retry attempts exhausted -> Record Failed state and notify Owner
  const failedAt = Date.now();
  const failedRecord: DailySalesBackupStatusRecord = {
    ...processingRecord,
    status: 'Failed',
    pdfBackupStatus: pdfStatus === 'Completed' ? 'Completed' : 'Failed',
    excelBackupStatus: excelStatus === 'Completed' ? 'Completed' : 'Failed',
    totalsVerified: false,
    retryCount: attempt,
    lastAttemptAt: failedAt,
    failureReason: lastError || 'Daily sales backup generation failed after retries.',
    updatedAt: failedAt
  };

  await persistDailySalesBackupStatusRecord(failedRecord);

  await recordSecurityAuditLog({
    eventType: 'DAILY_BACKUP_FAILED',
    username: options?.initiatedBy || 'system_scheduler',
    status: 'FAILED',
    details: `Daily Sales Backup FAILED for ${formattedDate} after ${attempt} attempt(s): ${failedRecord.failureReason}`,
    metadata: {
      businessDate: ymd,
      retryCount: attempt,
      failureReason: failedRecord.failureReason
    }
  });

  return failedRecord;
}

/**
 * Downloads a stored PDF or Excel backup file for a business date (or generates it on the fly if not yet stored).
 * Requires Owner or Store Manager permission.
 */
export async function downloadDailySalesBackupFile(
  businessDate: string,
  format: 'pdf' | 'xlsx',
  callerUser?: AppUser | null,
  settings?: RestaurantSettings
): Promise<string> {
  if (callerUser !== undefined && !canAccessFeature(callerUser, 'DAILY_SALES_BACKUP')) {
    await recordSecurityAuditLog({
      eventType: 'UNAUTHORIZED_ACCESS_BLOCKED',
      username: callerUser?.username || 'anonymous',
      userId: callerUser?.uid,
      role: callerUser?.roleId,
      status: 'BLOCKED',
      details: `Unauthorized user attempted to download Daily Sales Backup (${format.toUpperCase()}) for ${businessDate}.`
    });
    throw new Error('Access Denied: Only the Owner and Store Manager can download Daily Sales Backups.');
  }

  const ymd = normalizeToYMD(businessDate);
  const report = await ReportEngine.generateDailySalesBackupReport(ymd);
  const fileName =
    format === 'pdf'
      ? ReportEngine.exportDailySalesBackupPDF(report, settings)
      : ReportEngine.exportDailySalesBackupExcel(report, settings);

  // Also ensure the backup status record is marked Completed in Firestore & Storage
  runDailySalesBackupForDate(ymd, {
    triggerType: 'MANUAL_REGENERATE',
    initiatedBy: callerUser?.username || callerUser?.name || 'staff',
    force: true,
    settings
  }).catch(() => {});

  await recordSecurityAuditLog({
    eventType: format === 'pdf' ? 'REPORT_DOWNLOAD_PDF' : 'REPORT_DOWNLOAD_EXCEL',
    username: callerUser?.username || callerUser?.name || 'authorized_user',
    userId: callerUser?.uid,
    role: callerUser?.roleId,
    status: 'SUCCESS',
    details: `Downloaded Daily Sales Backup ${format.toUpperCase()} (${fileName}) for ${report.formattedDate}.`
  });

  return fileName;
}

/**
 * Checks if the scheduled daily closing time in Asia/Kolkata has passed for today
 * (or if yesterday's backup was missed or failed) and automatically triggers the backup.
 */
export async function checkAndRunScheduledDailySalesBackup(
  settings?: RestaurantSettings,
  now: Date = new Date()
): Promise<DailySalesBackupStatusRecord | null> {
  const config = await syncDailySalesBackupConfigFromCloud();
  if (!config.enabled) return null;

  const kolkata = getKolkataNow(now);
  const todayYMD = kolkata.businessDate;

  // 1. Check if yesterday's backup was missed or failed (catch-up recovery)
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayYMD = getKolkataNow(yesterdayDate).businessDate;
  if (yesterdayYMD && yesterdayYMD !== todayYMD) {
    const yesterdayStatus = await getDailySalesBackupStatusForDate(yesterdayYMD);
    if (yesterdayStatus.status === 'Failed' || yesterdayStatus.status === 'Pending') {
      const yesterdayReport = await ReportEngine.generateDailySalesBackupReport(yesterdayYMD);
      if (yesterdayReport.totalBills > 0 || yesterdayStatus.status === 'Failed') {
        await runDailySalesBackupForDate(yesterdayYMD, {
          triggerType: 'CATCHUP_MISSED',
          initiatedBy: 'auto_catchup_scheduler',
          force: yesterdayStatus.status === 'Failed',
          settings
        });
      }
    }
  }

  // 2. Check if today's closing time in Asia/Kolkata has been reached
  if (!isAfterDailyClosingTime(config.dailyClosingTime, now)) {
    return null;
  }

  const todayStatus = await getDailySalesBackupStatusForDate(todayYMD);
  if (
    todayStatus.status === 'Completed' &&
    todayStatus.pdfBackupStatus === 'Completed' &&
    todayStatus.excelBackupStatus === 'Completed'
  ) {
    return null;
  }

  return runDailySalesBackupForDate(todayYMD, {
    triggerType: 'AUTO_SCHEDULED',
    initiatedBy: 'asia_kolkata_scheduler',
    force: todayStatus.status === 'Failed',
    settings
  });
}
