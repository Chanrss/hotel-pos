import { useState, useEffect, useCallback, useRef } from 'react';
import { RestaurantSettings, DailyBackupRecord, AutomatedDailyBackupConfig } from '../types';
import {
  getAutomatedDailyBackupConfig,
  saveAutomatedDailyBackupConfig,
  getDailyBackupHistory,
  checkAndExecuteAutomatedDailyBackup,
  exportCoreBillingArchive,
  subscribeBackupEvents,
  getLatestGeneratedBackup,
  triggerBlobDownload
} from '../services/backupService';
import { checkAndRunScheduledDailySalesBackup } from '../services/autoDailyBackupService';
import { getBusinessDate } from '../services/billNumberEngine';

export interface UseAutomatedDailyBackupReturn {
  config: AutomatedDailyBackupConfig;
  updateConfig: (newConfig: Partial<AutomatedDailyBackupConfig>) => Promise<void>;
  isBackingUp: boolean;
  lastBackupRecord: DailyBackupRecord | null;
  history: DailyBackupRecord[];
  refreshHistory: () => void;
  runDailyBackupNow: () => Promise<DailyBackupRecord | null>;
  reDownloadBackup: (filename: string, content?: string) => void;
  backupToast: {
    visible: boolean;
    record?: DailyBackupRecord;
    message: string;
    filename?: string;
    type: 'success' | 'error' | 'info';
  } | null;
  dismissToast: () => void;
  isTodayBackedUp: boolean;
}

export function useAutomatedDailyBackup(settings?: RestaurantSettings): UseAutomatedDailyBackupReturn {
  const [config, setConfig] = useState<AutomatedDailyBackupConfig>(getAutomatedDailyBackupConfig);
  const [history, setHistory] = useState<DailyBackupRecord[]>(getDailyBackupHistory);
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [backupToast, setBackupToast] = useState<{
    visible: boolean;
    record?: DailyBackupRecord;
    message: string;
    filename?: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const refreshHistory = useCallback(() => {
    const list = getDailyBackupHistory();
    setHistory(list);
  }, []);

  // Subscribe to backup system events
  useEffect(() => {
    const unsubscribe = subscribeBackupEvents((event) => {
      if (event.type === 'STARTED') {
        setIsBackingUp(true);
      } else if (event.type === 'COMPLETED') {
        setIsBackingUp(false);
        refreshHistory();
        setBackupToast({
          visible: true,
          record: event.record,
          message: event.message,
          filename: event.record.filename,
          type: 'success'
        });
      } else if (event.type === 'FAILED') {
        setIsBackingUp(false);
        setBackupToast({
          visible: true,
          message: event.error,
          type: 'error'
        });
      }
    });

    return unsubscribe;
  }, [refreshHistory]);

  // Automated background schedule check (runs JSON archive + Automatic Daily Sales PDF & Excel Backup in Asia/Kolkata)
  useEffect(() => {
    if (!config.enabled) return;

    const runScheduledChecks = async () => {
      try {
        await checkAndExecuteAutomatedDailyBackup(settingsRef.current);
      } catch (err) {
        console.warn('Automated JSON backup check error:', err);
      }
      try {
        await checkAndRunScheduledDailySalesBackup(settingsRef.current);
      } catch (err) {
        console.warn('Automatic Daily Sales PDF/Excel backup check error:', err);
      }
    };

    // Initial check after 4 seconds of startup
    const initialTimer = setTimeout(() => {
      runScheduledChecks();
    }, 4000);

    // Periodic check every 45 seconds
    const interval = setInterval(() => {
      runScheduledChecks();
    }, 45000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [config.enabled, config.scheduledTime, config.scope]);

  const updateConfig = async (newConfig: Partial<AutomatedDailyBackupConfig>) => {
    const updated = await saveAutomatedDailyBackupConfig(newConfig);
    setConfig(updated);
  };

  const runDailyBackupNow = async (): Promise<DailyBackupRecord | null> => {
    setIsBackingUp(true);
    try {
      const activeBusinessDate = getBusinessDate(settingsRef.current?.businessDayStartHour || '04:00');
      const result = await exportCoreBillingArchive({
        restaurantSettings: settingsRef.current,
        businessDate: activeBusinessDate,
        triggerType: 'MANUAL',
        autoDownload: true
      });
      setIsBackingUp(false);
      refreshHistory();
      return result.record || null;
    } catch (err: any) {
      setIsBackingUp(false);
      setBackupToast({
        visible: true,
        message: err?.message || 'Manual backup execution failed',
        type: 'error'
      });
      return null;
    }
  };

  const reDownloadBackup = (filename: string, content?: string) => {
    if (content) {
      triggerBlobDownload(filename, content);
      return;
    }
    const cached = getLatestGeneratedBackup();
    if (cached && cached.filename === filename) {
      triggerBlobDownload(filename, cached.jsonContent);
      return;
    }
    // Fallback: re-export
    runDailyBackupNow();
  };

  const dismissToast = () => {
    setBackupToast(null);
  };

  const activeBusinessDate = getBusinessDate(settings?.businessDayStartHour || '04:00');
  const isTodayBackedUp = history.some(
    (h) => h.businessDate === activeBusinessDate && h.status === 'SUCCESS'
  );

  const lastBackupRecord = history.length > 0 ? history[0] : null;

  return {
    config,
    updateConfig,
    isBackingUp,
    lastBackupRecord,
    history,
    refreshHistory,
    runDailyBackupNow,
    reDownloadBackup,
    backupToast,
    dismissToast,
    isTodayBackedUp
  };
}
