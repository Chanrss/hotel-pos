import { collection, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db, sanitizeForFirestore } from './firebase';
import { getLocalBills, getLocalItemsMap } from './localBillStore';
import { getBusinessDate } from './billNumberEngine';
import {
  Bill,
  BillItem,
  BillingDraft,
  Kot,
  KotItem,
  BusinessDay,
  Category,
  MenuItem,
  RestaurantSettings,
  DailyBackupRecord,
  AutomatedDailyBackupConfig,
  CoreBillingBackupPayload,
  CoreBillingMetrics,
  DailyBackupTriggerType,
  DailyBackupScope
} from '../types';

export interface CollectionBackupSummary {
  name: string;
  count: number;
}

export interface DatabaseBackupResult {
  success: boolean;
  filename: string;
  totalCollections: number;
  totalDocuments: number;
  collectionCounts: Record<string, number>;
  exportedAt: string;
  error?: string;
  record?: DailyBackupRecord;
}

export interface CoreBillingBackupResult {
  success: boolean;
  filename: string;
  payload?: CoreBillingBackupPayload;
  record?: DailyBackupRecord;
  metrics?: CoreBillingMetrics;
  totalDocuments: number;
  billCount: number;
  totalRevenue: number;
  error?: string;
}

// Core collections essential for financial, receipt, and tax auditing
export const CORE_BILLING_COLLECTIONS = [
  'bills',
  'bill_items',
  'billing_drafts',
  'kots',
  'kot_items',
  'business_days',
  'bill_counters',
  'categories',
  'menu_items',
  'settings'
] as const;

// All known Firestore collections across the restaurant POS system
export const FIRESTORE_COLLECTIONS = [
  'settings',
  'categories',
  'menu_items',
  'bills',
  'bill_items',
  'billing_drafts',
  'kots',
  'kot_items',
  'inventory_items',
  'inventory_movements',
  'purchases',
  'purchase_items',
  'stock_adjustments',
  'wastage',
  'users',
  'roles',
  'permissions',
  'business_days',
  'bill_counters',
  'print_logs',
  'audit_logs',
  'sync_metadata',
  'daily_backups'
] as const;

export const DEFAULT_AUTOMATED_BACKUP_CONFIG: AutomatedDailyBackupConfig = {
  enabled: true,
  scheduledTime: '22:00', // 10:00 PM default daily archiving
  autoDownload: true,
  scope: 'CORE_BILLING',
  notifyOnComplete: true,
  retentionMaxRecords: 50
};

// Simple event bus for backup notifications across the app
export type BackupEvent = 
  | { type: 'STARTED'; triggerType: DailyBackupTriggerType; scope: DailyBackupScope }
  | { type: 'COMPLETED'; record: DailyBackupRecord; message: string; jsonContent?: string }
  | { type: 'FAILED'; error: string; triggerType: DailyBackupTriggerType };

type BackupEventListener = (event: BackupEvent) => void;
const backupListeners = new Set<BackupEventListener>();

export function subscribeBackupEvents(listener: BackupEventListener): () => void {
  backupListeners.add(listener);
  return () => {
    backupListeners.delete(listener);
  };
}

function notifySubscribers(event: BackupEvent): void {
  backupListeners.forEach((listener) => {
    try {
      listener(event);
    } catch (e) {
      console.warn('Backup event listener error:', e);
    }
  });
}

// In-memory cache for the most recent generated backup to allow instant re-downloads
let latestGeneratedBackup: { filename: string; jsonContent: string } | null = null;

export function getLatestGeneratedBackup(): { filename: string; jsonContent: string } | null {
  return latestGeneratedBackup;
}

/**
 * Calculates a fast 32-bit FNV-1a checksum for backup verification.
 */
export function calculateChecksum(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

/**
 * Fetches all documents from the specified Firestore collection.
 * Gracefully handles missing collections or read errors.
 */
async function fetchCollectionDocs<T = any>(collectionName: string): Promise<T[]> {
  try {
    const colRef = collection(db, collectionName);
    const snapshot = await getDocs(colRef);
    return snapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        _id: d.id,
        ...data
      } as unknown as T;
    });
  } catch (error) {
    console.warn(`Backup: Could not fetch collection "${collectionName}":`, error);
    return [];
  }
}

/**
 * Computes comprehensive financial and operational metrics from raw billing data.
 */
export function calculateCoreBillingMetrics(
  bills: Bill[],
  billItems: BillItem[],
  kots: Kot[],
  drafts: BillingDraft[],
  categories: Category[],
  menuItems: MenuItem[]
): CoreBillingMetrics {
  let totalRevenue = 0;
  let cashRevenue = 0;
  let upiRevenue = 0;
  let cardRevenue = 0;
  let otherRevenue = 0;
  let totalDiscount = 0;
  let completedBills = 0;
  let cancelledBills = 0;
  let dineInBills = 0;
  let takeAwayBills = 0;
  let earliestBillTimestamp = Number.MAX_SAFE_INTEGER;
  let latestBillTimestamp = 0;

  bills.forEach((b) => {
    const isCompleted = b.status === 'COMPLETED';
    const isCancelled = b.status === 'CANCELLED';

    if (isCompleted) {
      completedBills++;
      const amount = Number(b.grandTotal) || 0;
      totalRevenue += amount;
      totalDiscount += Number(b.discount) || 0;

      const method = (b.paymentMethod || 'CASH').toUpperCase();
      if (method === 'CASH') {
        cashRevenue += amount;
      } else if (method === 'UPI' || method.includes('QR') || method.includes('GPAY') || method.includes('PAYTM')) {
        upiRevenue += amount;
      } else if (method === 'CARD') {
        cardRevenue += amount;
      } else {
        otherRevenue += amount;
      }

      if (b.orderType === 'DINE_IN') {
        dineInBills++;
      } else {
        takeAwayBills++;
      }
    } else if (isCancelled) {
      cancelledBills++;
    }

    const t = b.createdAt || 0;
    if (t > 0) {
      if (t < earliestBillTimestamp) earliestBillTimestamp = t;
      if (t > latestBillTimestamp) latestBillTimestamp = t;
    }
  });

  const averageBillValue = completedBills > 0 ? Math.round(totalRevenue / completedBills) : 0;

  return {
    totalBills: bills.length,
    completedBills,
    cancelledBills,
    totalRevenue,
    cashRevenue,
    upiRevenue,
    cardRevenue,
    otherRevenue,
    totalDiscount,
    dineInBills,
    takeAwayBills,
    averageBillValue,
    totalBillItems: billItems.length,
    totalKots: kots.length,
    totalDrafts: drafts.length,
    totalCategories: categories.length,
    totalMenuItems: menuItems.length,
    earliestBillTimestamp: earliestBillTimestamp === Number.MAX_SAFE_INTEGER ? undefined : earliestBillTimestamp,
    latestBillTimestamp: latestBillTimestamp === 0 ? undefined : latestBillTimestamp
  };
}

/**
 * Triggers a browser file download for a given text or binary payload.
 */
export function triggerBlobDownload(filename: string, content: BlobPart, mimeType = 'application/json;charset=utf-8'): void {
  try {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => {
      URL.revokeObjectURL(downloadUrl);
    }, 10000);
  } catch (err) {
    console.error('Trigger download failed:', err);
  }
}

/**
 * Exports Core Billing Data into a structured, validated JSON archive file.
 * This file is engineered specifically for manual archiving, accounting, and tax audits.
 */
export async function exportCoreBillingArchive(options?: {
  restaurantSettings?: RestaurantSettings;
  restaurantName?: string;
  businessDate?: string;
  triggerType?: DailyBackupTriggerType;
  autoDownload?: boolean;
}): Promise<CoreBillingBackupResult> {
  const triggerType = options?.triggerType || 'MANUAL';
  notifySubscribers({ type: 'STARTED', triggerType, scope: 'CORE_BILLING' });

  try {
    const settings = options?.restaurantSettings;
    const restaurantName = options?.restaurantName || settings?.restaurantName || 'Sri Saravana Bhavan';
    const activeBusinessDate = options?.businessDate || getBusinessDate(settings?.businessDayStartHour || '04:00');

    // 1. Concurrently fetch all core billing collections
    const [
      rawBills,
      rawBillItems,
      rawDrafts,
      rawKots,
      rawKotItems,
      rawBusinessDays,
      rawCounters,
      rawCategories,
      rawMenuItems,
      rawSettingsDocs
    ] = await Promise.all([
      fetchCollectionDocs<Bill>('bills'),
      fetchCollectionDocs<BillItem>('bill_items'),
      fetchCollectionDocs<BillingDraft>('billing_drafts'),
      fetchCollectionDocs<Kot>('kots'),
      fetchCollectionDocs<KotItem>('kot_items'),
      fetchCollectionDocs<BusinessDay>('business_days'),
      fetchCollectionDocs<any>('bill_counters'),
      fetchCollectionDocs<Category>('categories'),
      fetchCollectionDocs<MenuItem>('menu_items'),
      fetchCollectionDocs<RestaurantSettings>('settings')
    ]);

    // 2. Incorporate local offline cache for true offline-first durability
    let localBills: Bill[] = [];
    let localItems: BillItem[] = [];
    try {
      localBills = getLocalBills();
      const localItemsMap = getLocalItemsMap();
      localItems = Object.values(localItemsMap).flat();
    } catch (e) {
      console.warn('Backup: could not read local storage cache:', e);
    }

    // Merge bills ensuring no offline-created bills are omitted
    const billMap = new Map<string, Bill>();
    rawBills.forEach((b) => billMap.set(b.id || (b as any)._id, b));
    localBills.forEach((lb) => {
      const id = lb.id || (lb as any)._id;
      if (id && !billMap.has(id)) {
        billMap.set(id, lb);
      }
    });
    const consolidatedBills = Array.from(billMap.values());

    // 3. Compute detailed metrics
    const metrics = calculateCoreBillingMetrics(
      consolidatedBills,
      rawBillItems,
      rawKots,
      rawDrafts,
      rawCategories,
      rawMenuItems
    );

    const now = new Date();
    const exportTimestamp = now.toISOString();
    const exportTimestampMs = now.getTime();
    const dateStr = activeBusinessDate;
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '');

    const sanitizedName = restaurantName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'restaurant';

    const filename = `${sanitizedName}_billing_backup_${dateStr}_${timeStr}.json`;

    // 4. Construct validated JSON archive payload
    const backupPayload: CoreBillingBackupPayload = {
      archiveType: 'CORE_BILLING_DAILY_ARCHIVE',
      version: '1.0',
      exportTimestamp,
      exportTimestampMs,
      businessDate: activeBusinessDate,
      restaurant: {
        name: restaurantName,
        nameTamil: settings?.restaurantNameTamil,
        address: settings?.address,
        phone: settings?.phone,
        gstNumber: settings?.gstNumber,
        fssaiNumber: settings?.fssaiNumber
      },
      metrics,
      collections: {
        bills: consolidatedBills,
        bill_items: rawBillItems,
        billing_drafts: rawDrafts,
        kots: rawKots,
        kot_items: rawKotItems,
        business_days: rawBusinessDays,
        bill_counters: rawCounters,
        categories: rawCategories,
        menu_items: rawMenuItems,
        settings: rawSettingsDocs,
        offline_cached_bills: localBills,
        offline_cached_items: localItems
      },
      checksum: '',
      instructions:
        'This file is an automated/manual Core Billing Data Archive for manual archiving, accounting, and tax audits. Store this JSON file in your secure archive drive or backup folder.'
    };

    // Calculate verification checksum
    const rawContentForChecksum = JSON.stringify(backupPayload.collections);
    const checksum = calculateChecksum(rawContentForChecksum);
    backupPayload.checksum = checksum;

    const jsonString = JSON.stringify(backupPayload, null, 2);
    const fileSizeBytes = new Blob([jsonString]).size;

    // Cache latest backup in memory
    latestGeneratedBackup = {
      filename,
      jsonContent: jsonString
    };

    // 5. Trigger download if requested (default is true)
    const shouldDownload = options?.autoDownload !== false;
    if (shouldDownload) {
      triggerBlobDownload(filename, jsonString);
    }

    const totalDocuments =
      consolidatedBills.length +
      rawBillItems.length +
      rawDrafts.length +
      rawKots.length +
      rawKotItems.length +
      rawBusinessDays.length +
      rawCounters.length +
      rawCategories.length +
      rawMenuItems.length +
      rawSettingsDocs.length;

    // 6. Create and save historical backup record
    const record: DailyBackupRecord = {
      id: `backup_${activeBusinessDate}_${exportTimestampMs}`,
      businessDate: activeBusinessDate,
      timestamp: exportTimestampMs,
      exportedAt: exportTimestamp,
      filename,
      triggerType,
      status: 'SUCCESS',
      scope: 'CORE_BILLING',
      billCount: metrics.totalBills,
      totalRevenue: metrics.totalRevenue,
      cashTotal: metrics.cashRevenue,
      upiTotal: metrics.upiRevenue,
      cardTotal: metrics.cardRevenue,
      cancelledBillCount: metrics.cancelledBills,
      kotCount: metrics.totalKots,
      totalDocuments,
      fileSizeBytes,
      checksum
    };

    await saveDailyBackupRecord(record);

    const resultMessage = `Core billing archive generated: ${metrics.totalBills} bills (₹${metrics.totalRevenue.toLocaleString('en-IN')}) exported to "${filename}"`;
    notifySubscribers({
      type: 'COMPLETED',
      record,
      message: resultMessage,
      jsonContent: jsonString
    });

    return {
      success: true,
      filename,
      payload: backupPayload,
      record,
      metrics,
      totalDocuments,
      billCount: metrics.totalBills,
      totalRevenue: metrics.totalRevenue
    };
  } catch (err: any) {
    const errMsg = err?.message || 'Failed to generate core billing archive';
    console.error('Export core billing archive error:', err);
    notifySubscribers({ type: 'FAILED', error: errMsg, triggerType });
    return {
      success: false,
      filename: '',
      totalDocuments: 0,
      billCount: 0,
      totalRevenue: 0,
      error: errMsg
    };
  }
}

/**
 * Helper to download core billing backup directly
 */
export async function downloadCoreBillingBackup(
  restaurantSettings?: RestaurantSettings,
  businessDate?: string
): Promise<CoreBillingBackupResult> {
  return exportCoreBillingArchive({
    restaurantSettings,
    businessDate,
    triggerType: 'MANUAL',
    autoDownload: true
  });
}

// Re-export Excel (.xlsx) backup service for Daily Snapshot and reporting
export { downloadDailyBillingExcel, exportDailyBillingExcelBackup } from './excelBackupService';
export type { ExcelBackupOptions, ExcelBackupResult } from './excelBackupService';

/**
 * Gathers all Firestore collections, formats them into a structured JSON backup,
 * and triggers a browser file download. Preserved for full database export.
 */
export async function downloadDatabaseBackup(restaurantName: string = 'Restaurant'): Promise<DatabaseBackupResult> {
  const exportedAt = new Date().toISOString();
  const exportedAtMs = Date.now();
  const collectionsData: Record<string, any> = {};
  const collectionCounts: Record<string, number> = {};
  let totalDocuments = 0;

  try {
    notifySubscribers({ type: 'STARTED', triggerType: 'MANUAL', scope: 'FULL_DATABASE' });

    // 1. Export each Firestore collection
    for (const colName of FIRESTORE_COLLECTIONS) {
      const docs = await fetchCollectionDocs(colName);
      collectionsData[colName] = docs;
      collectionCounts[colName] = docs.length;
      totalDocuments += docs.length;
    }

    // 2. Also capture local offline cache snapshot
    try {
      const localBills = getLocalBills();
      const localItemsMap = getLocalItemsMap();
      const flattenedLocalItems = Object.values(localItemsMap).flat();
      if (localBills.length > 0) {
        collectionsData['_local_cached_bills'] = localBills;
        collectionsData['_local_cached_items'] = flattenedLocalItems;
        collectionCounts['_local_cached_bills'] = localBills.length;
        collectionCounts['_local_cached_items'] = flattenedLocalItems.length;
      }
    } catch (e) {
      console.warn('Backup: Could not attach local storage snapshot:', e);
    }

    // 3. Prepare full backup payload with comprehensive metadata
    const sanitizedName = restaurantName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'restaurant';

    const dateStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '');
    const filename = `${sanitizedName}_database_backup_${dateStr}_${timeStr}.json`;

    const backupPayload = {
      metadata: {
        appName: 'POS Restaurant Billing System',
        restaurantName,
        exportedAt,
        exportedAtTimestamp: exportedAtMs,
        totalCollections: Object.keys(collectionsData).length,
        totalDocuments,
        collectionCounts,
        description: 'Full database backup containing Firestore collections and offline POS cache'
      },
      collections: collectionsData
    };

    // 4. Serialize to formatted JSON & trigger download
    const jsonContent = JSON.stringify(backupPayload, null, 2);
    triggerBlobDownload(filename, jsonContent);

    // 5. Record last backup in history
    const billsList = collectionsData['bills'] || [];
    let totalRevenue = 0;
    billsList.forEach((b: any) => {
      if (b.status === 'COMPLETED') totalRevenue += Number(b.grandTotal) || 0;
    });

    const record: DailyBackupRecord = {
      id: `backup_full_${dateStr}_${exportedAtMs}`,
      businessDate: dateStr,
      timestamp: exportedAtMs,
      exportedAt,
      filename,
      triggerType: 'MANUAL',
      status: 'SUCCESS',
      scope: 'FULL_DATABASE',
      billCount: billsList.length,
      totalRevenue,
      cashTotal: 0,
      upiTotal: 0,
      kotCount: (collectionsData['kots'] || []).length,
      totalDocuments,
      fileSizeBytes: new Blob([jsonContent]).size
    };
    await saveDailyBackupRecord(record);

    latestGeneratedBackup = { filename, jsonContent };

    notifySubscribers({
      type: 'COMPLETED',
      record,
      message: `Full database backup completed: ${totalDocuments} records exported to "${filename}"`,
      jsonContent
    });

    return {
      success: true,
      filename,
      totalCollections: Object.keys(collectionsData).length,
      totalDocuments,
      collectionCounts,
      exportedAt,
      record
    };
  } catch (err: any) {
    const errMsg = err?.message || 'Database backup failed';
    notifySubscribers({ type: 'FAILED', error: errMsg, triggerType: 'MANUAL' });
    return {
      success: false,
      filename: '',
      totalCollections: 0,
      totalDocuments: 0,
      collectionCounts: {},
      exportedAt,
      error: errMsg
    };
  }
}

/**
 * Gets the current Automated Daily Backup configuration from local storage.
 */
export function getAutomatedDailyBackupConfig(): AutomatedDailyBackupConfig {
  try {
    const stored = localStorage.getItem('pos_auto_backup_config');
    if (stored) {
      return { ...DEFAULT_AUTOMATED_BACKUP_CONFIG, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn('Could not read automated backup config from local storage:', e);
  }
  return { ...DEFAULT_AUTOMATED_BACKUP_CONFIG };
}

/**
 * Saves updated Automated Daily Backup configuration to local storage and Firestore.
 */
export async function saveAutomatedDailyBackupConfig(
  config: Partial<AutomatedDailyBackupConfig>
): Promise<AutomatedDailyBackupConfig> {
  const current = getAutomatedDailyBackupConfig();
  const updated: AutomatedDailyBackupConfig = { ...current, ...config };

  try {
    localStorage.setItem('pos_auto_backup_config', JSON.stringify(updated));
  } catch (e) {}

  // Sync to sync_metadata doc in Firestore in background
  try {
    const metaRef = doc(db, 'sync_metadata', 'backup_configuration');
    await setDoc(metaRef, sanitizeForFirestore({
      ...updated,
      updatedAt: Date.now()
    }), { merge: true });
  } catch (e) {
    console.debug('Could not sync backup config to firestore:', e);
  }

  return updated;
}

/**
 * Retrieves the history of recent backups from local storage.
 */
export function getDailyBackupHistory(): DailyBackupRecord[] {
  try {
    const stored = localStorage.getItem('pos_daily_backups_history');
    if (stored) {
      const records: DailyBackupRecord[] = JSON.parse(stored);
      if (Array.isArray(records)) {
        return records.sort((a, b) => b.timestamp - a.timestamp);
      }
    }
  } catch (e) {
    console.warn('Could not read backup history:', e);
  }
  return [];
}

/**
 * Saves a backup record to local history and to Firestore 'daily_backups' collection.
 */
export async function saveDailyBackupRecord(record: DailyBackupRecord): Promise<void> {
  try {
    // 1. Save to local storage history
    const history = getDailyBackupHistory();
    const filtered = history.filter((r) => r.id !== record.id);
    filtered.unshift(record);

    // Limit to max 50 records
    const trimmed = filtered.slice(0, 50);
    localStorage.setItem('pos_daily_backups_history', JSON.stringify(trimmed));
    localStorage.setItem('pos_last_daily_backup_date', record.businessDate);
    localStorage.setItem('pos_last_daily_backup_timestamp', String(record.timestamp));
    localStorage.setItem('pos_last_daily_backup_filename', record.filename);
    localStorage.setItem('pos_last_daily_backup_count', String(record.billCount));
    localStorage.setItem('pos_last_daily_backup_doc_count', String(record.totalDocuments));
  } catch (e) {
    console.warn('Could not save backup record locally:', e);
  }

  // 2. Persist record to Firestore daily_backups collection
  try {
    const docRef = doc(db, 'daily_backups', record.id);
    await setDoc(docRef, sanitizeForFirestore({
      ...record,
      createdAt: Date.now()
    }), { merge: true });
  } catch (e) {
    console.warn('Could not sync daily_backup record to Firestore:', e);
  }
}

/**
 * Checks if the automated daily backup should execute now, and executes it if due.
 * Prevents multiple automated executions for the same business day.
 */
export async function checkAndExecuteAutomatedDailyBackup(
  restaurantSettings?: RestaurantSettings,
  force = false
): Promise<DailyBackupRecord | null> {
  const config = getAutomatedDailyBackupConfig();

  // If automated backup is explicitly disabled and not forced, exit
  if (!config.enabled && !force) {
    return null;
  }

  const activeBusinessDate = getBusinessDate(restaurantSettings?.businessDayStartHour || '04:00');
  const lastBackupDate = localStorage.getItem('pos_last_daily_backup_date');

  // If already backed up for this business day and not forced, exit
  if (lastBackupDate === activeBusinessDate && !force) {
    return null;
  }

  // Check scheduled time criteria (e.g. 22:00)
  if (!force) {
    const now = new Date();
    const [schedHourStr, schedMinStr] = (config.scheduledTime || '22:00').split(':');
    const schedHour = parseInt(schedHourStr, 10) || 22;
    const schedMin = parseInt(schedMinStr, 10) || 0;

    const currentHour = now.getHours();
    const currentMin = now.getMinutes();

    const isTimeReached =
      currentHour > schedHour || (currentHour === schedHour && currentMin >= schedMin);

    if (!isTimeReached) {
      return null;
    }
  }

  console.log(`[Automated Daily Backup] Executing scheduled billing backup for business date ${activeBusinessDate}...`);

  // Execute backup according to scope
  if (config.scope === 'FULL_DATABASE') {
    const result = await downloadDatabaseBackup(restaurantSettings?.restaurantName);
    return result.record || null;
  } else {
    const result = await exportCoreBillingArchive({
      restaurantSettings,
      businessDate: activeBusinessDate,
      triggerType: 'AUTOMATED',
      autoDownload: config.autoDownload
    });
    return result.record || null;
  }
}
