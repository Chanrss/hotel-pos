/**
 * Local Printing Log System
 *
 * A lightweight, local utility to record timestamps, transaction IDs,
 * print status, and execution details for each POS transaction (Bill, KOT, etc.).
 * Designed to aid cashiers and technicians in diagnosing intermittent printing issues
 * (e.g., spooler timeouts, disconnected USB ports, kiosk print drops, or browser cancels).
 */

import { safeStorage } from './safeStorage';

export type PrintStatus = 'SUCCESS' | 'FAILURE' | 'PENDING' | 'RETRY';

export type PrintTransactionType = 'BILL' | 'KOT' | 'REPRINT' | 'TEST' | string;

export interface LocalPrintTransactionRecord {
  id: string;
  timestamp: string; // ISO 8601 formatted timestamp
  timeEpoch: number; // Unix timestamp in milliseconds for sorting & time difference math
  transactionId: string; // Bill Number, KOT Number, or transaction reference
  transactionType: PrintTransactionType;
  status: PrintStatus;
  printMethod?: 'DIRECT_DOM' | 'ESC_POS' | 'MOCK' | string;
  durationMs?: number;
  totalAmount?: number;
  itemCount?: number;
  paperWidth?: string;
  errorMessage?: string;
  errorCode?: string;
  retryAttempt?: number;
  details?: Record<string, unknown>;
}

export interface PrintTroubleshootingReport {
  totalLogged: number;
  successCount: number;
  failureCount: number;
  pendingCount: number;
  successRate: number; // Percentage 0 - 100
  hasIntermittentIssues: boolean;
  recentFailures: LocalPrintTransactionRecord[];
  failureCodeBreakdown: Record<string, number>;
  timeSpan: {
    firstLoggedAt: string | null;
    lastLoggedAt: string | null;
  };
}

const STORAGE_KEY = 'pos_local_print_log_v1';
const MAX_LOG_ENTRIES = 200;
const UPDATE_EVENT_NAME = 'local-print-log-updated';

/**
 * Reads all stored print transaction logs from safe local storage.
 */
export function getLocalPrintLogs(): LocalPrintTransactionRecord[] {
  try {
    const raw = safeStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (error) {
    console.warn('[LocalPrintLog] Failed to read print logs from storage:', error);
    return [];
  }
}

/**
 * Saves logs back to safe local storage, enforcing a maximum cap.
 */
function persistLogs(logs: LocalPrintTransactionRecord[]): void {
  try {
    const trimmed = logs.slice(0, MAX_LOG_ENTRIES);
    safeStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.warn('[LocalPrintLog] Failed to persist print logs to storage:', error);
  }
}

/**
 * Dispatches an event to notify the application or UI components of a log change.
 */
function notifyUpdate(logs: LocalPrintTransactionRecord[]): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent(UPDATE_EVENT_NAME, { detail: logs }));
    } catch {
      // Ignore in non-DOM or restricted environments
    }
  }
}

/**
 * Records a print transaction with precise timestamp and status.
 */
export function recordPrintTransaction(params: {
  transactionId: string;
  transactionType?: PrintTransactionType;
  status: PrintStatus;
  printMethod?: 'DIRECT_DOM' | 'ESC_POS' | 'MOCK' | string;
  durationMs?: number;
  totalAmount?: number;
  itemCount?: number;
  paperWidth?: string;
  errorMessage?: string;
  errorCode?: string;
  retryAttempt?: number;
  details?: Record<string, unknown>;
  timestamp?: string;
  timeEpoch?: number;
}): LocalPrintTransactionRecord {
  const now = params.timeEpoch ?? Date.now();
  const timestamp = params.timestamp ?? new Date(now).toISOString();
  const id = `pt_${now}_${Math.random().toString(36).substring(2, 7)}`;

  const entry: LocalPrintTransactionRecord = {
    id,
    timestamp,
    timeEpoch: now,
    transactionId: params.transactionId || 'UNKNOWN',
    transactionType: params.transactionType || 'BILL',
    status: params.status,
    printMethod: params.printMethod,
    durationMs: params.durationMs,
    totalAmount: params.totalAmount,
    itemCount: params.itemCount,
    paperWidth: params.paperWidth,
    errorMessage: params.errorMessage,
    errorCode: params.errorCode,
    retryAttempt: params.retryAttempt,
    details: params.details
  };

  const currentLogs = getLocalPrintLogs();
  // Filter out identical log if existing, then prepend new log (newest first)
  const updatedLogs = [entry, ...currentLogs.filter((item) => item.id !== entry.id)].slice(0, MAX_LOG_ENTRIES);

  persistLogs(updatedLogs);
  notifyUpdate(updatedLogs);

  // Quick console trace for live developer and technician debugging
  const badge = params.status === 'SUCCESS' ? '✔' : params.status === 'FAILURE' ? '✘' : '⏱';
  console.info(`[PrintLog ${badge}] ${params.status} | Tx: ${entry.transactionId} (${entry.transactionType}) at ${timestamp}${params.errorMessage ? ` | Error: ${params.errorMessage}` : ''}`);

  return entry;
}

/**
 * Retrieves all print logs associated with a specific transaction reference (e.g. BN-1001 or KOT-5).
 */
export function getLogsForTransaction(transactionId: string): LocalPrintTransactionRecord[] {
  if (!transactionId) return [];
  const normalizedId = transactionId.trim().toLowerCase();
  return getLocalPrintLogs().filter((log) => log.transactionId.toLowerCase() === normalizedId);
}

/**
 * Returns the most recent print status for a given transaction.
 */
export function getLatestPrintStatus(transactionId: string): PrintStatus | null {
  const matches = getLogsForTransaction(transactionId);
  return matches.length > 0 ? matches[0].status : null;
}

/**
 * Clears all locally stored print transaction logs.
 */
export function clearLocalPrintLogs(): void {
  try {
    safeStorage.removeItem(STORAGE_KEY);
    notifyUpdate([]);
  } catch (error) {
    console.warn('[LocalPrintLog] Failed to clear logs:', error);
  }
}

/**
 * Generates an intermittent failure analysis report for troubleshooting print drops,
 * repeated attempts, or device timeouts.
 */
export function getPrintTroubleshootingReport(): PrintTroubleshootingReport {
  const logs = getLocalPrintLogs();
  const totalLogged = logs.length;

  if (totalLogged === 0) {
    return {
      totalLogged: 0,
      successCount: 0,
      failureCount: 0,
      pendingCount: 0,
      successRate: 100,
      hasIntermittentIssues: false,
      recentFailures: [],
      failureCodeBreakdown: {},
      timeSpan: {
        firstLoggedAt: null,
        lastLoggedAt: null
      }
    };
  }

  let successCount = 0;
  let failureCount = 0;
  let pendingCount = 0;
  const recentFailures: LocalPrintTransactionRecord[] = [];
  const failureCodeBreakdown: Record<string, number> = {};

  // Track transactions that experienced retries or initial failures followed by success
  const txStatusMap = new Map<string, PrintStatus[]>();

  for (const log of logs) {
    if (log.status === 'SUCCESS') {
      successCount++;
    } else if (log.status === 'FAILURE') {
      failureCount++;
      if (recentFailures.length < 15) {
        recentFailures.push(log);
      }
      const code = log.errorCode || 'UNKNOWN_ERROR';
      failureCodeBreakdown[code] = (failureCodeBreakdown[code] || 0) + 1;
    } else if (log.status === 'PENDING') {
      pendingCount++;
    }

    const statuses = txStatusMap.get(log.transactionId) || [];
    statuses.push(log.status);
    txStatusMap.set(log.transactionId, statuses);
  }

  // Intermittent issues exist if there are failures, or if any transaction required retry
  let hasIntermittentFlakes = false;
  txStatusMap.forEach((statuses) => {
    if (statuses.includes('FAILURE') && statuses.includes('SUCCESS')) {
      hasIntermittentFlakes = true;
    }
  });

  const successRate = totalLogged > 0 ? Math.round((successCount / totalLogged) * 100) : 100;
  const hasIntermittentIssues = failureCount > 0 || hasIntermittentFlakes;

  const sortedEpochs = [...logs].sort((a, b) => a.timeEpoch - b.timeEpoch);
  const firstLoggedAt = sortedEpochs[0]?.timestamp || null;
  const lastLoggedAt = sortedEpochs[sortedEpochs.length - 1]?.timestamp || null;

  return {
    totalLogged,
    successCount,
    failureCount,
    pendingCount,
    successRate,
    hasIntermittentIssues,
    recentFailures,
    failureCodeBreakdown,
    timeSpan: {
      firstLoggedAt,
      lastLoggedAt
    }
  };
}

/**
 * Exports all local print transaction logs as a formatted JSON string
 * for easy technician extraction and offline debugging.
 */
export function exportPrintLogsAsJSON(): string {
  const logs = getLocalPrintLogs();
  const report = getPrintTroubleshootingReport();

  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      report,
      logs
    },
    null,
    2
  );
}

/**
 * Subscribes to live print log changes via the window event.
 * Returns an unsubscribe callback function.
 */
export function subscribeToLocalPrintLogs(
  callback: (logs: LocalPrintTransactionRecord[]) => void
): () => void {
  // Call immediately with existing logs
  callback(getLocalPrintLogs());

  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<LocalPrintTransactionRecord[]>;
    if (customEvent.detail) {
      callback(customEvent.detail);
    } else {
      callback(getLocalPrintLogs());
    }
  };

  window.addEventListener(UPDATE_EVENT_NAME, handler);
  return () => {
    window.removeEventListener(UPDATE_EVENT_NAME, handler);
  };
}
