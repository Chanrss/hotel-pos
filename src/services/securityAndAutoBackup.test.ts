import { describe, it, expect, beforeEach } from 'vitest';
import {
  hashPin,
  verifyUserPin,
  sanitizeUserForStorage,
  purgePersistedLoginSession,
  checkAccountLockout,
  recordFailedPinAttempt,
  clearFailedPinAttempts,
  getRoleClassification,
  canAccessFeature,
  assertAuthorizedForFeature
} from './securityService';
import {
  getCloudStorageFolderForDate,
  getCloudStorageFilePath,
  verifyBackupTotalsMatch,
  getDailySalesBackupConfig,
  saveDailySalesBackupConfig,
  runDailySalesBackupForDate,
  getDailySalesBackupStatusForDate
} from './autoDailyBackupService';
import {
  getDailyBackupFileName,
  formatDateDDMMYYYY,
  ReportEngine,
  DailySalesBackupReport
} from './reportEngine';
import { User } from '../types';

describe('Mandatory Login Security, RBAC & Automatic Daily Sales Backup', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('1. PIN Hashing & Zero Plain-Text PIN Storage', () => {
    it('hashes PINs deterministically using salted SHA-256 and never stores plain-text PINs', () => {
      const hash1 = hashPin('1234', 'admin');
      const hash2 = hashPin('1234', 'admin');
      const diffUserHash = hashPin('1234', 'manager');

      expect(hash1).toContain('sha256$');
      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe('1234');
      expect(hash1).not.toBe(diffUserHash);
    });

    it('sanitizeUserForStorage strips plain-text pin and retains pinHash', () => {
      const rawUser: User = {
        uid: 'user_admin',
        username: 'admin',
        pin: '1234',
        name: 'Owner / Admin',
        email: 'admin@hotelpos.local',
        roleId: 'admin',
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const sanitized = sanitizeUserForStorage(rawUser);
      expect(sanitized.pin).toBeUndefined();
      expect(sanitized.pinHash).toBe(hashPin('1234', 'admin'));
      expect(verifyUserPin('1234', sanitized)).toBe(true);
      expect(verifyUserPin('9999', sanitized)).toBe(false);
    });

    it('purgePersistedLoginSession clears any remembered session and strips plain-text PINs from storage', () => {
      localStorage.setItem('pos_logged_in_user', JSON.stringify({ uid: 'user_admin', username: 'admin' }));
      sessionStorage.setItem('pos_auth_session', 'true');
      localStorage.setItem(
        'pos_local_users',
        JSON.stringify([
          {
            uid: 'user_manager',
            username: 'manager',
            pin: '2222',
            name: 'Store Manager',
            email: 'manager@hotelpos.local',
            roleId: 'manager',
            active: true,
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ])
      );

      purgePersistedLoginSession();

      expect(localStorage.getItem('pos_logged_in_user')).toBeNull();
      expect(sessionStorage.getItem('pos_auth_session')).toBeNull();

      const storedUsers = JSON.parse(localStorage.getItem('pos_local_users') || '[]');
      expect(storedUsers).toHaveLength(1);
      expect(storedUsers[0].pin).toBeUndefined();
      expect(storedUsers[0].pinHash).toBe(hashPin('2222', 'manager'));
    });
  });

  describe('2. Rate Limiting & Account Lockout Protection', () => {
    it('locks account temporarily after 5 consecutive incorrect PIN attempts', async () => {
      const username = 'manager';
      await clearFailedPinAttempts(username);
      expect(checkAccountLockout(username).isLocked).toBe(false);

      for (let i = 1; i <= 4; i++) {
        const res = await recordFailedPinAttempt(username);
        expect(res.isLocked).toBe(false);
        expect(res.remainingAttempts).toBe(5 - i);
      }

      const fifthAttempt = await recordFailedPinAttempt(username);
      expect(fifthAttempt.isLocked).toBe(true);
      expect(fifthAttempt.remainingAttempts).toBe(0);
      expect(fifthAttempt.remainingSeconds).toBeGreaterThan(0);

      const lockStatus = checkAccountLockout(username);
      expect(lockStatus.isLocked).toBe(true);

      await clearFailedPinAttempts(username);
      expect(checkAccountLockout(username).isLocked).toBe(false);
    });
  });

  describe('3. User Role and Access Control (Owner vs Store Manager)', () => {
    const ownerUser: User = {
      uid: 'user_admin',
      username: 'admin',
      pinHash: hashPin('1234', 'admin'),
      name: 'Owner / Admin',
      email: 'admin@hotelpos.local',
      roleId: 'admin',
      fullAccess: true,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const storeManagerUser: User = {
      uid: 'user_manager',
      username: 'manager',
      pinHash: hashPin('2222', 'manager'),
      name: 'Store Manager',
      email: 'manager@hotelpos.local',
      roleId: 'manager',
      fullAccess: false,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    it('grants Owner full access including user management and security settings', () => {
      expect(getRoleClassification(ownerUser)).toBe('OWNER');
      expect(canAccessFeature(ownerUser, 'BILLING')).toBe(true);
      expect(canAccessFeature(ownerUser, 'MENU_MANAGEMENT')).toBe(true);
      expect(canAccessFeature(ownerUser, 'REPORTS')).toBe(true);
      expect(canAccessFeature(ownerUser, 'RUNNING_KOTS')).toBe(true);
      expect(canAccessFeature(ownerUser, 'DAILY_SALES_BACKUP')).toBe(true);
      expect(canAccessFeature(ownerUser, 'USER_MANAGEMENT')).toBe(true);
      expect(canAccessFeature(ownerUser, 'SECURITY_SETTINGS')).toBe(true);
    });

    it('grants Store Manager access to KOT, Billing, Menu, Reports, and Daily Sales Backup, but denies Owner-only User Management & Security Settings', async () => {
      expect(getRoleClassification(storeManagerUser)).toBe('STORE_MANAGER');
      expect(canAccessFeature(storeManagerUser, 'BILLING')).toBe(true);
      expect(canAccessFeature(storeManagerUser, 'KOT')).toBe(true);
      expect(canAccessFeature(storeManagerUser, 'RUNNING_KOTS')).toBe(true);
      expect(canAccessFeature(storeManagerUser, 'MENU_MANAGEMENT')).toBe(true);
      expect(canAccessFeature(storeManagerUser, 'PRICE_MODIFICATION')).toBe(true);
      expect(canAccessFeature(storeManagerUser, 'REPORTS')).toBe(true);
      expect(canAccessFeature(storeManagerUser, 'DAILY_SALES_BACKUP')).toBe(true);

      // Owner-only features denied to Store Manager
      expect(canAccessFeature(storeManagerUser, 'USER_MANAGEMENT')).toBe(false);
      expect(canAccessFeature(storeManagerUser, 'SECURITY_SETTINGS')).toBe(false);
      await expect(
        assertAuthorizedForFeature(storeManagerUser, 'USER_MANAGEMENT', 'Register New User')
      ).rejects.toThrow();

      // Store Manager cannot modify daily closing time
      await expect(
        saveDailySalesBackupConfig({ dailyClosingTime: '22:30' }, storeManagerUser)
      ).rejects.toThrow(/Only the Owner/i);

      // Owner can modify daily closing time
      const updatedCfg = await saveDailySalesBackupConfig({ dailyClosingTime: '22:30' }, ownerUser);
      expect(updatedCfg.dailyClosingTime).toBe('22:30');
      expect(getDailySalesBackupConfig().dailyClosingTime).toBe('22:30');
    });
  });

  describe('4. Automatic Daily Sales Backup File Naming, Cloud Storage Structure & Totals Verification', () => {
    it('formats filenames as SSB_DD-MM-YYYY.pdf and SSB_DD-MM-YYYY.xlsx using hyphens', () => {
      const dateYMD = '2026-11-02';
      expect(formatDateDDMMYYYY(dateYMD)).toBe('02-11-2026');
      expect(getDailyBackupFileName(dateYMD, 'pdf')).toBe('SSB_02-11-2026.pdf');
      expect(getDailyBackupFileName(dateYMD, 'xlsx')).toBe('SSB_02-11-2026.xlsx');
      expect(getDailyBackupFileName(dateYMD, 'pdf')).not.toContain('/');
    });

    it('builds the required Firebase Cloud Storage path Daily_Sales_Backup/{YYYY}/{MM-MonthName}/SSB_{DD-MM-YYYY}.{pdf|xlsx}', () => {
      const dateYMD = '2026-11-02';
      expect(getCloudStorageFolderForDate(dateYMD)).toBe('Daily_Sales_Backup/2026/11-November');
      expect(getCloudStorageFilePath(dateYMD, 'pdf')).toBe(
        'Daily_Sales_Backup/2026/11-November/SSB_02-11-2026.pdf'
      );
      expect(getCloudStorageFilePath(dateYMD, 'xlsx')).toBe(
        'Daily_Sales_Backup/2026/11-November/SSB_02-11-2026.xlsx'
      );
    });

    it('generates valid PDF and Excel byte arrays and verifies totals match without item codes', () => {
      const sampleReport: DailySalesBackupReport = {
        businessDate: '2026-11-02',
        formattedDate: '02-11-2026',
        pdfFileName: 'SSB_02-11-2026.pdf',
        excelFileName: 'SSB_02-11-2026.xlsx',
        totalBills: 2,
        totalItemsSold: 5,
        totalDailySales: 310,
        rows: [
          {
            sno: 1,
            billId: 'bill_1',
            billNo: '01',
            date: '02-11-2026',
            businessDate: '2026-11-02',
            time: '09:15 AM',
            itemName: 'Masala Dosa',
            quantity: 2,
            unitPrice: 70,
            total: 140
          },
          {
            sno: 2,
            billId: 'bill_2',
            billNo: '02',
            date: '02-11-2026',
            businessDate: '2026-11-02',
            time: '10:05 AM',
            itemName: 'Mini Tiffin',
            quantity: 3,
            unitPrice: 56.67,
            total: 170
          }
        ],
        bills: []
      };

      const pdfBytes = ReportEngine.buildDailySalesBackupPDFBytes(sampleReport);
      const excelBytes = ReportEngine.buildDailySalesBackupExcelBytes(sampleReport);

      expect(pdfBytes.byteLength).toBeGreaterThan(500);
      expect(excelBytes.byteLength).toBeGreaterThan(500);

      const verification = verifyBackupTotalsMatch(sampleReport, pdfBytes, excelBytes);
      expect(verification.verified).toBe(true);
    });

    it('runs automatic daily backup once per business date and supports manual regeneration', async () => {
      const targetDate = '2026-11-02';
      const firstRun = await runDailySalesBackupForDate(targetDate, {
        triggerType: 'AUTO_SCHEDULED'
      });

      expect(firstRun.businessDate).toBe(targetDate);
      expect(firstRun.formattedDate).toBe('02-11-2026');
      expect(firstRun.pdfFileName).toBe('SSB_02-11-2026.pdf');
      expect(firstRun.excelFileName).toBe('SSB_02-11-2026.xlsx');
      expect(firstRun.status).toBe('Completed');
      expect(firstRun.pdfBackupStatus).toBe('Completed');
      expect(firstRun.excelBackupStatus).toBe('Completed');
      expect(firstRun.totalsVerified).toBe(true);

      const storedStatus = await getDailySalesBackupStatusForDate(targetDate);
      expect(storedStatus?.status).toBe('Completed');

      // Manual regeneration updates the backup cleanly
      const regenerated = await runDailySalesBackupForDate(targetDate, {
        triggerType: 'MANUAL_REGENERATE',
        force: true
      });
      expect(regenerated.status).toBe('Completed');
      expect(regenerated.triggerType).toBe('MANUAL_REGENERATE');
    });
  });
});
