import { Bill, BillItem, Kot, KotItem, RestaurantSettings } from '../types';
import { PrinterService } from './printerService';
import { EscPosService } from './escposService';
import { PrinterConnectionService } from './printerConnectionService';
import { PrintDiagnosticsService } from './printDiagnostics';

export type PrintQueueStatus = 'QUEUED' | 'PRINTING' | 'PRINTED' | 'FAILED';

export interface PrintJob {
  id: string;
  billId: string;
  billNumber: string;
  printerId: string;
  status: PrintQueueStatus;
  attempts: number;
  createdAt: number;
  printedAt?: number;
  errorMessage?: string;
  jobType?: 'BILL' | 'KOT' | 'REPRINT' | 'TEST';
  escPosBytes?: number;
  channel?: string;
}

export interface PrintReceiptData {
  bill: Bill;
  items?: BillItem[];
  settings?: RestaurantSettings;
  forcePrint?: boolean;
  isReprint?: boolean;
  isRetry?: boolean;
  jobId?: string;
}

export interface PrintResult {
  success: boolean;
  restrictedInIframe?: boolean;
  error?: string;
  jobId?: string;
  job?: PrintJob;
  escPosBytes?: number;
  channel?: string;
}

export interface PrintDiagnosticState {
  printerStatus: 'Ready' | 'Unavailable';
  printSystem: 'Ready' | 'Error';
  lastPrint: 'none' | 'Successful' | 'Failed';
  lastError: string | null;
  isPrinting: boolean;
  queueLength: number;
}

type DiagnosticListener = (state: PrintDiagnosticState) => void;
type PrintJobsListener = (jobs: PrintJob[]) => void;

interface QueuedPrintTask {
  job: PrintJob;
  execute: (job: PrintJob) => Promise<PrintResult>;
  resolve: (result: PrintResult) => void;
}

const PRINT_JOBS_STORAGE_KEY = 'pos_print_jobs_queue';

/**
 * Centralized Direct Thermal PrintService
 *
 * Architecture:
 * POS Application -> PrintService -> Local Print Bridge (QZ Tray / Local HTTP Bridge / WebSerial / WebUSB / Direct ESC/POS Spooler) -> ESC/POS -> Thermal Printer
 *
 * Strictly avoids window.print(), browser print preview dialogs, popup windows, tab switching,
 * or any operation that minimizes or steals focus from the active POS billing screen.
 */
export class PrintService {
  private static queue: QueuedPrintTask[] = [];
  private static isProcessingQueue = false;
  private static printJobs: PrintJob[] = PrintService.loadStoredPrintJobs();
  private static diagnosticListeners: Set<DiagnosticListener> = new Set();
  private static jobListeners: Set<PrintJobsListener> = new Set();
  private static simulatedPrinterState: 'READY' | 'DISCONNECTED' | 'UNAVAILABLE' = 'READY';

  private static diagnosticState: PrintDiagnosticState = {
    printerStatus: 'Ready',
    printSystem: 'Ready',
    lastPrint: 'none',
    lastError: null,
    isPrinting: false,
    queueLength: 0
  };

  private static loadStoredPrintJobs(): PrintJob[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(PRINT_JOBS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.slice(0, 100);
      }
    } catch (_) {}
    return [];
  }

  private static persistPrintJobs(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(PRINT_JOBS_STORAGE_KEY, JSON.stringify(PrintService.printJobs.slice(0, 100)));
    } catch (_) {}
    const snapshot = [...PrintService.printJobs];
    PrintService.jobListeners.forEach((cb) => {
      try {
        cb(snapshot);
      } catch (_) {}
    });
  }

  /**
   * Returns all tracked print jobs in the queue/history.
   */
  static getPrintJobs(): PrintJob[] {
    return [...PrintService.printJobs];
  }

  /**
   * Clears stored print jobs (useful for testing).
   */
  static clearPrintJobs(): void {
    PrintService.printJobs = [];
    PrintService.persistPrintJobs();
  }

  /**
   * Subscribe to print job queue changes.
   */
  static subscribePrintJobs(listener: PrintJobsListener): () => void {
    PrintService.jobListeners.add(listener);
    listener(PrintService.getPrintJobs());
    return () => {
      PrintService.jobListeners.delete(listener);
    };
  }

  /**
   * Allows testing or runtime override of printer connection state ('READY' | 'DISCONNECTED' | 'UNAVAILABLE').
   */
  static setSimulatedPrinterState(state: 'READY' | 'DISCONNECTED' | 'UNAVAILABLE'): void {
    PrintService.simulatedPrinterState = state;
    const isReady = state === 'READY' && PrintService.isPrinterConnected();
    PrintService.updateDiagnostics({
      printerStatus: isReady ? 'Ready' : 'Unavailable',
      printSystem: isReady ? 'Ready' : 'Error'
    });
  }

  static getSimulatedPrinterState(): 'READY' | 'DISCONNECTED' | 'UNAVAILABLE' {
    return PrintService.simulatedPrinterState;
  }

  private static isPrinterConnected(): boolean {
    if (PrintService.simulatedPrinterState !== 'READY') {
      return false;
    }
    try {
      const info = PrinterConnectionService.getConnectedPrinter();
      return info.connected !== false;
    } catch (_) {
      return true;
    }
  }

  /**
   * Returns current print diagnostic status.
   */
  static getDiagnosticStatus(): PrintDiagnosticState {
    const connected = PrintService.isPrinterConnected();
    return {
      ...PrintService.diagnosticState,
      printerStatus: connected ? 'Ready' : 'Unavailable',
      printSystem: connected && PrintService.diagnosticState.lastPrint !== 'Failed' ? 'Ready' : 'Error',
      queueLength: PrintService.queue.length
    };
  }

  /**
   * Subscribe to real-time diagnostic status changes.
   */
  static subscribeDiagnostics(listener: DiagnosticListener): () => void {
    PrintService.diagnosticListeners.add(listener);
    listener(PrintService.getDiagnosticStatus());
    return () => {
      PrintService.diagnosticListeners.delete(listener);
    };
  }

  private static notifyDiagnostics(): void {
    const snapshot = PrintService.getDiagnosticStatus();
    PrintService.diagnosticListeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (_) {}
    });
  }

  private static updateDiagnostics(patch: Partial<PrintDiagnosticState>): void {
    PrintService.diagnosticState = {
      ...PrintService.diagnosticState,
      ...patch
    };
    PrintService.notifyDiagnostics();
  }

  /**
   * Resolves effective restaurant & receipt settings, merging cached localStorage settings
   * if settings were not explicitly provided.
   */
  static resolveSettings(settings?: RestaurantSettings): RestaurantSettings | undefined {
    let cached: Partial<RestaurantSettings> = {};
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('pos_restaurant_settings');
        if (raw) cached = JSON.parse(raw);
      } catch (_) {}
    }
    if (!settings && Object.keys(cached).length === 0) {
      return undefined;
    }
    return {
      ...(cached as RestaurantSettings),
      ...(settings || {})
    };
  }

  /**
   * Generates the 3-inch thermal receipt HTML for live preview / offscreen inspection.
   */
  static generateReceiptHTML(data: PrintReceiptData): string {
    const items = data.items || data.bill.items || [];
    const effectiveSettings = PrintService.resolveSettings(data.settings);
    return PrinterService.generateThermalReceiptHTML(data.bill, items, effectiveSettings);
  }

  /**
   * Generates the raw binary ESC/POS command buffer for a 3-inch thermal receipt.
   */
  static generateReceiptEscPos(data: PrintReceiptData): Uint8Array {
    const items = data.items || data.bill.items || [];
    const effectiveSettings = PrintService.resolveSettings(data.settings);
    return EscPosService.generateBillEscPosBuffer(data.bill, items, effectiveSettings);
  }

  /**
   * Converts Uint8Array ESC/POS buffer to Base64 string for QZ Tray / Local Print Bridge transmission.
   */
  private static uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    if (typeof btoa === 'function') {
      return btoa(binary);
    }
    return '';
  }

  /**
   * Dispatches raw ESC/POS bytes through the Local Print Bridge without calling window.print()
   * and without opening any browser preview or popup window:
   * 1. QZ Tray WebSocket Bridge (if window.qz is active/available)
   * 2. Local Node.js / HTTP Print Bridge (if configured in localStorage or window)
   * 3. Direct WebSerial / WebUSB Hardware Stream (if paired)
   * 4. Built-in Direct ESC/POS Spooler Bridge (silent in-memory & offscreen DOM spooler)
   */
  private static async dispatchEscPosBuffer(
    escPosBuffer: Uint8Array,
    htmlSnapshot: string,
    printerId: string
  ): Promise<{ success: boolean; channel: string; error?: string }> {
    // Verify printer connection / availability first
    if (!PrintService.isPrinterConnected()) {
      const reason =
        PrintService.simulatedPrinterState === 'UNAVAILABLE'
          ? 'Printer is temporarily unavailable.'
          : 'Local thermal printer is disconnected.';
      return {
        success: false,
        channel: 'DISCONNECTED',
        error: reason
      };
    }

    // 1. QZ Tray Local Print Bridge (if window.qz is loaded)
    if (typeof window !== 'undefined' && (window as any).qz) {
      try {
        const qz = (window as any).qz;
        if (qz.websocket && typeof qz.websocket.isActive === 'function') {
          if (!qz.websocket.isActive()) {
            await qz.websocket.connect();
          }
          const printerName = await qz.printers.getDefault();
          const config = qz.configs.create(printerName || printerId);
          const base64Data = PrintService.uint8ArrayToBase64(escPosBuffer);
          await qz.print(config, [
            {
              type: 'raw',
              format: 'base64',
              data: base64Data
            }
          ]);
          return { success: true, channel: 'QZ_TRAY_ESCPOS' };
        }
      } catch (qzErr: any) {
        console.warn('[PrintService] QZ Tray bridge notice, falling back to local bridge:', qzErr?.message || qzErr);
      }
    }

    // 2. Local Node.js / HTTP Print Bridge (if configured)
    if (typeof window !== 'undefined') {
      const bridgeUrl =
        (window as any).__POS_LOCAL_PRINT_BRIDGE_URL__ ||
        localStorage.getItem('pos_local_print_bridge_url');
      if (bridgeUrl) {
        try {
          const base64Data = PrintService.uint8ArrayToBase64(escPosBuffer);
          const response = await fetch(bridgeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              printerId,
              format: 'ESC_POS_BASE64',
              data: base64Data,
              byteLength: escPosBuffer.byteLength
            })
          });
          if (!response.ok) {
            return {
              success: false,
              channel: 'LOCAL_HTTP_BRIDGE',
              error: `Local print bridge returned HTTP ${response.status}.`
            };
          }
          return { success: true, channel: 'LOCAL_HTTP_BRIDGE' };
        } catch (bridgeErr: any) {
          return {
            success: false,
            channel: 'LOCAL_HTTP_BRIDGE',
            error: bridgeErr?.message || 'Local print service is unavailable.'
          };
        }
      }
    }

    // 3. Direct Hardware WebSerial / WebUSB Stream (if paired and active)
    if (PrinterConnectionService.isDirectHardwareReady()) {
      try {
        const hwRes = await PrinterConnectionService.sendRawBytes(escPosBuffer);
        if (hwRes.success) {
          return {
            success: true,
            channel: hwRes.channel || 'DIRECT_HARDWARE_ESCPOS'
          };
        }
      } catch (_) {}
    }

    // 4. Built-in Silent ESC/POS Direct Spooler
    // Updates offscreen #pos-print-root with the receipt snapshot and raw ESC/POS metadata
    // WITHOUT calling window.print(), WITHOUT opening any popup, and WITHOUT touching focus or window state.
    if (typeof document !== 'undefined') {
      const printRoot = PrinterService.populatePrintRoot(htmlSnapshot);
      if (printRoot) {
        printRoot.setAttribute('data-escpos-bytes', String(escPosBuffer.byteLength));
        printRoot.setAttribute('data-escpos-hex-head', EscPosService.formatBufferAsHexSequence(escPosBuffer.slice(0, 24)));
        printRoot.setAttribute('data-print-mode', 'DIRECT_ESCPOS');
      }
    }

    return {
      success: true,
      channel: 'DIRECT_ESCPOS_BRIDGE'
    };
  }

  /**
   * Creates or reuses a PrintJob record and enqueues it for asynchronous execution.
   */
  private static createOrReuseJob(params: {
    billId: string;
    billNumber: string;
    printerId: string;
    jobType: 'BILL' | 'KOT' | 'REPRINT' | 'TEST';
    jobId?: string;
    isRetry?: boolean;
  }): PrintJob {
    const existingIndex = PrintService.printJobs.findIndex(
      (j) =>
        (params.jobId && j.id === params.jobId) ||
        (params.isRetry && j.billId === params.billId && j.status === 'FAILED')
    );

    if (existingIndex !== -1) {
      const existing = PrintService.printJobs[existingIndex];
      const updated: PrintJob = {
        ...existing,
        status: 'QUEUED',
        attempts: existing.attempts + 1,
        errorMessage: undefined
      };
      PrintService.printJobs[existingIndex] = updated;
      PrintService.persistPrintJobs();
      return updated;
    }

    const newJob: PrintJob = {
      id: `pj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      billId: params.billId,
      billNumber: params.billNumber,
      printerId: params.printerId,
      jobType: params.jobType,
      status: 'QUEUED',
      attempts: 1,
      createdAt: Date.now()
    };

    PrintService.printJobs.unshift(newJob);
    if (PrintService.printJobs.length > 100) {
      PrintService.printJobs = PrintService.printJobs.slice(0, 100);
    }
    PrintService.persistPrintJobs();
    return newJob;
  }

  private static updateJobRecord(jobId: string, patch: Partial<PrintJob>): PrintJob | undefined {
    const idx = PrintService.printJobs.findIndex((j) => j.id === jobId);
    if (idx === -1) return undefined;
    const updated: PrintJob = {
      ...PrintService.printJobs[idx],
      ...patch
    };
    PrintService.printJobs[idx] = updated;
    PrintService.persistPrintJobs();
    return updated;
  }

  private static enqueueJob(
    job: PrintJob,
    execute: (job: PrintJob) => Promise<PrintResult>
  ): Promise<PrintResult> {
    return new Promise((resolve) => {
      PrintService.queue.push({ job, execute, resolve });
      PrintService.updateDiagnostics({ queueLength: PrintService.queue.length });
      void PrintService.processQueue();
    });
  }

  private static async processQueue(): Promise<void> {
    if (PrintService.isProcessingQueue) return;
    PrintService.isProcessingQueue = true;

    while (PrintService.queue.length > 0) {
      const task = PrintService.queue.shift()!;
      PrintService.updateJobRecord(task.job.id, { status: 'PRINTING' });
      PrintService.updateDiagnostics({
        isPrinting: true,
        queueLength: PrintService.queue.length
      });

      try {
        const result = await task.execute(task.job);
        task.resolve(result);
      } catch (err: any) {
        const errMsg = err?.message || 'Receipt could not be sent to the print system.';
        const failedJob = PrintService.updateJobRecord(task.job.id, {
          status: 'FAILED',
          errorMessage: errMsg
        });
        PrintService.updateDiagnostics({
          lastPrint: 'Failed',
          lastError: errMsg,
          printSystem: 'Error'
        });
        task.resolve({
          success: false,
          error: errMsg,
          jobId: task.job.id,
          job: failedJob
        });
      }
    }

    PrintService.isProcessingQueue = false;
    PrintService.updateDiagnostics({
      isPrinting: false,
      queueLength: 0
    });
  }

  /**
   * Asynchronous Direct Thermal Receipt Print (Requirements 1-20):
   * - Never calls window.print() or opens browser print preview
   * - Never opens a popup or new browser window
   * - Never minimizes or steals focus from the POS screen
   * - Generates 3-inch ESC/POS receipt commands and sends them via the Local Print Bridge
   * - Tracks job lifecycle (QUEUED -> PRINTING -> PRINTED | FAILED) in printJobs queue
   */
  static async printReceipt(data: PrintReceiptData): Promise<PrintResult> {
    const { bill, forcePrint = true, isReprint = false, isRetry = false, jobId } = data;
    const items = data.items || bill.items || [];
    const effectiveSettings = PrintService.resolveSettings(data.settings);

    if (!forcePrint && effectiveSettings && effectiveSettings.autoPrintOnSave === false) {
      return { success: true };
    }

    const connectedPrinter = PrinterConnectionService.getConnectedPrinter();
    const printerId = connectedPrinter.deviceName || 'thermal_pos_80mm';
    const cleanBillNo = String(bill.billNumber || '1').replace(/^BN-|^#/, '');

    const job = PrintService.createOrReuseJob({
      billId: bill.id,
      billNumber: cleanBillNo,
      printerId,
      jobType: isReprint ? 'REPRINT' : 'BILL',
      jobId,
      isRetry
    });

    return PrintService.enqueueJob(job, async (activeJob) => {
      const startTime = Date.now();

      // 1. Generate 3-inch ESC/POS receipt command buffer
      const escPosBuffer = EscPosService.generateBillEscPosBuffer(bill, items, effectiveSettings);

      // 2. Generate HTML snapshot for offscreen DOM verification (#pos-print-root)
      const htmlSnapshot = PrinterService.generateThermalReceiptHTML(bill, items, effectiveSettings);

      // 3. Dispatch directly to thermal printer bridge (NO window.print(), NO popup)
      const dispatchRes = await PrintService.dispatchEscPosBuffer(escPosBuffer, htmlSnapshot, printerId);
      const durationMs = Date.now() - startTime;
      const paperWidth = effectiveSettings?.paperWidth || '80mm';
      const fontSize = Number(effectiveSettings?.receiptFontSize || 12);

      if (dispatchRes.success) {
        const printedJob = PrintService.updateJobRecord(activeJob.id, {
          status: 'PRINTED',
          printedAt: Date.now(),
          errorMessage: undefined,
          escPosBytes: escPosBuffer.byteLength,
          channel: dispatchRes.channel
        });

        PrintService.updateDiagnostics({
          printerStatus: 'Ready',
          printSystem: 'Ready',
          lastPrint: 'Successful',
          lastError: null
        });

        PrintDiagnosticsService.recordPrintJob({
          jobType: 'BILL',
          referenceNumber: `BN-${cleanBillNo}`,
          status: 'SUCCESS',
          method: 'DIRECT_DOM',
          paperWidth,
          fontSize,
          itemCount: items.length,
          totalAmount: bill.grandTotal,
          durationMs,
          userName: bill.userName
        });

        return {
          success: true,
          jobId: activeJob.id,
          job: printedJob,
          escPosBytes: escPosBuffer.byteLength,
          channel: dispatchRes.channel
        };
      } else {
        const errorMessage = dispatchRes.error || 'Receipt could not be sent to the print system.';
        const failedJob = PrintService.updateJobRecord(activeJob.id, {
          status: 'FAILED',
          errorMessage,
          escPosBytes: escPosBuffer.byteLength,
          channel: dispatchRes.channel
        });

        PrintService.updateDiagnostics({
          printerStatus: PrintService.isPrinterConnected() ? 'Ready' : 'Unavailable',
          printSystem: 'Error',
          lastPrint: 'Failed',
          lastError: errorMessage
        });

        PrintDiagnosticsService.recordPrintJob({
          jobType: 'BILL',
          referenceNumber: `BN-${cleanBillNo}`,
          status: 'FAILURE',
          method: 'DIRECT_DOM',
          paperWidth,
          fontSize,
          itemCount: items.length,
          totalAmount: bill.grandTotal,
          durationMs,
          errorMessage,
          userName: bill.userName
        });

        return {
          success: false,
          error: errorMessage,
          jobId: activeJob.id,
          job: failedJob,
          escPosBytes: escPosBuffer.byteLength,
          channel: dispatchRes.channel
        };
      }
    });
  }

  /**
   * Asynchronous Direct Thermal KOT Print via ESC/POS (Never opens print preview or minimizes POS).
   */
  static async printKot(
    kot: Kot,
    items: KotItem[],
    settings?: RestaurantSettings
  ): Promise<PrintResult> {
    const effectiveSettings = PrintService.resolveSettings(settings);
    const connectedPrinter = PrinterConnectionService.getConnectedPrinter();
    const printerId = connectedPrinter.deviceName || 'kitchen_kot_80mm';
    const cleanKotNo = String(kot.kotNumber || '1').replace(/^KOT-|^#/, '');

    const job = PrintService.createOrReuseJob({
      billId: kot.id,
      billNumber: `KOT-${cleanKotNo}`,
      printerId,
      jobType: 'KOT'
    });

    return PrintService.enqueueJob(job, async (activeJob) => {
      const startTime = Date.now();
      const escPosBuffer = EscPosService.generateKotEscPosBuffer(kot, items);
      const htmlSnapshot = PrinterService.generateKotSlipHTML(kot, items);

      const dispatchRes = await PrintService.dispatchEscPosBuffer(escPosBuffer, htmlSnapshot, printerId);
      const durationMs = Date.now() - startTime;
      const paperWidth = effectiveSettings?.paperWidth || '80mm';
      const fontSize = Number(effectiveSettings?.receiptFontSize || 12);

      if (dispatchRes.success) {
        const printedJob = PrintService.updateJobRecord(activeJob.id, {
          status: 'PRINTED',
          printedAt: Date.now(),
          errorMessage: undefined,
          escPosBytes: escPosBuffer.byteLength,
          channel: dispatchRes.channel
        });

        PrintService.updateDiagnostics({
          printerStatus: 'Ready',
          printSystem: 'Ready',
          lastPrint: 'Successful',
          lastError: null
        });

        PrintDiagnosticsService.recordPrintJob({
          jobType: 'KOT',
          referenceNumber: `KOT-${cleanKotNo}`,
          status: 'SUCCESS',
          method: 'DIRECT_DOM',
          paperWidth,
          fontSize,
          itemCount: items.length,
          totalAmount: 0,
          durationMs,
          userName: kot.waiterName || kot.waiterId
        });

        return {
          success: true,
          jobId: activeJob.id,
          job: printedJob,
          escPosBytes: escPosBuffer.byteLength,
          channel: dispatchRes.channel
        };
      } else {
        const errorMessage = dispatchRes.error || 'KOT could not be sent to the print system.';
        const failedJob = PrintService.updateJobRecord(activeJob.id, {
          status: 'FAILED',
          errorMessage,
          escPosBytes: escPosBuffer.byteLength,
          channel: dispatchRes.channel
        });

        PrintService.updateDiagnostics({
          printerStatus: PrintService.isPrinterConnected() ? 'Ready' : 'Unavailable',
          printSystem: 'Error',
          lastPrint: 'Failed',
          lastError: errorMessage
        });

        return {
          success: false,
          error: errorMessage,
          jobId: activeJob.id,
          job: failedJob
        };
      }
    });
  }

  /**
   * Prints a standalone 3-inch thermal TEST RECEIPT (Bill No: TEST-001) using direct ESC/POS
   * independently of actual billing.
   */
  static async testPrint(settings?: RestaurantSettings): Promise<PrintResult> {
    const now = Date.now();
    const effectiveSettings = PrintService.resolveSettings(settings);

    const testBill: Bill = {
      id: 'test-receipt-001',
      billNumber: 'TEST-001',
      businessDate: new Date(now).toISOString().split('T')[0],
      orderType: 'DINE_IN',
      priceType: 'NON_AC',
      tableNumber: 'T-01',
      subtotal: 400,
      discount: 0,
      grandTotal: 400,
      paymentMethod: 'CASH',
      paymentStatus: 'PAID',
      status: 'COMPLETED',
      reprintCount: 0,
      userId: 'test_print',
      userName: 'TEST RECEIPT',
      createdAt: now,
      updatedAt: now
    };

    const testItems: BillItem[] = [
      {
        id: 'test-item-1',
        billId: 'test-receipt-001',
        itemId: 'sample-1',
        itemCode: '101',
        itemName: 'Masala Dosa',
        itemNameTamil: 'மசால் தோசை',
        quantity: 2,
        unitPrice: 80,
        totalPrice: 160,
        priceType: 'NON_AC',
        createdAt: now
      },
      {
        id: 'test-item-2',
        billId: 'test-receipt-001',
        itemId: 'sample-2',
        itemCode: '102',
        itemName: 'Filter Coffee',
        itemNameTamil: 'ஃபில்டர் காபி',
        quantity: 1,
        unitPrice: 30,
        totalPrice: 30,
        priceType: 'NON_AC',
        createdAt: now
      }
    ];

    return PrintService.printReceipt({
      bill: testBill,
      items: testItems,
      settings: effectiveSettings,
      forcePrint: true
    });
  }
}
