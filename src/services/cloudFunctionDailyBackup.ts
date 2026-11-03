/**
 * Server-Side Scheduled Daily Sales Backup Worker (Firebase Cloud Functions / Scheduled Process)
 * Timezone: Asia/Kolkata
 *
 * Runs automatically after the Owner-configured daily closing time without depending
 * on a browser tab remaining open. Generates both:
 *   1. PDF:   Daily_Sales_Backup/{YYYY}/{MM-MonthName}/SSB_{DD-MM-YYYY}.pdf
 *   2. Excel: Daily_Sales_Backup/{YYYY}/{MM-MonthName}/SSB_{DD-MM-YYYY}.xlsx
 * from completed Firebase Firestore bills, verifies totals, retries on failure,
 * and records backup status (Pending, Processing, Completed, Failed).
 */

import {
  RESTAURANT_TIMEZONE,
  checkAndRunScheduledDailySalesBackup,
  getDailySalesBackupConfig,
  getKolkataNow,
  runDailySalesBackupForDate
} from './autoDailyBackupService';
import { DailySalesBackupStatusRecord, RestaurantSettings } from '../types';

export interface CloudScheduledBackupJobConfig {
  scheduleCron: string;
  timeZone: string;
  retryCount: number;
  region: string;
}

/**
 * Returns the Firebase Cloud Function schedule configuration in Asia/Kolkata timezone
 * aligned with the Owner's configured daily closing time.
 */
export function getCloudFunctionScheduleSpec(closingTime?: string): CloudScheduledBackupJobConfig {
  const cfg = getDailySalesBackupConfig();
  const timeStr = closingTime || cfg.dailyClosingTime || '23:00';
  const [hourStr, minStr] = timeStr.split(':');
  const hour = Math.max(0, Math.min(23, parseInt(hourStr, 10) || 23));
  const min = Math.max(0, Math.min(59, parseInt(minStr, 10) || 0));

  return {
    scheduleCron: `${min} ${hour} * * *`,
    timeZone: RESTAURANT_TIMEZONE,
    retryCount: cfg.maxRetries || 3,
    region: 'asia-south1'
  };
}

/**
 * Handler invoked by the scheduled Cloud Function or server cron job in Asia/Kolkata timezone.
 * Guarantees idempotent execution (once per business date) with automatic retry & failure logging.
 */
export async function executeScheduledServerDailyBackup(options?: {
  businessDate?: string;
  settings?: RestaurantSettings;
  now?: Date;
}): Promise<DailySalesBackupStatusRecord | null> {
  const targetNow = options?.now || new Date();
  if (options?.businessDate) {
    return runDailySalesBackupForDate(options.businessDate, {
      triggerType: 'AUTO_SCHEDULED',
      initiatedBy: 'cloud_function_asia_kolkata',
      force: false,
      settings: options?.settings
    });
  }

  // Otherwise run scheduled check for Asia/Kolkata business date & any missed previous date
  const result = await checkAndRunScheduledDailySalesBackup(options?.settings, targetNow);
  if (result) return result;

  // If invoked directly by cron at closing time, run for current Asia/Kolkata business date
  const kolkata = getKolkataNow(targetNow);
  return runDailySalesBackupForDate(kolkata.businessDate, {
    triggerType: 'AUTO_SCHEDULED',
    initiatedBy: 'cloud_function_asia_kolkata',
    force: false,
    settings: options?.settings
  });
}
