import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { db, getDeviceId, sanitizeForFirestore } from './firebase';
import { Kot, KotItem, Bill, BillItem, RestaurantSettings, RemotePrintJob, RemotePrintJobStatus } from '../types';
import { PrintService } from './PrintService';

const PRIMARY_SERVER_KEY = 'pos_is_primary_print_server';
const SOUND_ALERT_KEY = 'pos_remote_print_sound_enabled';

// In-flight guard to prevent duplicate executions across tabs or rapid snapshot triggers
const inFlightJobIds = new Set<string>();

/**
 * Service to orchestrate multi-device thermal printing:
 * Secondary waiter devices (Android/iOS/tablets) queue print jobs in Firestore,
 * and the primary counter POS terminal automatically picks up and prints them to its physical thermal printer.
 */
export class RemotePrintQueueService {
  /**
   * Determine device role:
   * Defaults to PRIMARY on desktop/counter PC screens, and SECONDARY on mobile/waiter devices.
   * Can be overridden by staff at any time in Settings or the Header bar.
   */
  static isPrimaryPrintServer(): boolean {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(PRIMARY_SERVER_KEY);
    if (stored !== null) {
      return stored === 'true';
    }
    // Auto-detect: if mobile user agent or small viewport, default to secondary waiter terminal
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent || ''
    ) || (window.innerWidth < 768);
    return !isMobileDevice;
  }

  static setPrimaryPrintServer(enabled: boolean): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(PRIMARY_SERVER_KEY, String(enabled));
    window.dispatchEvent(new CustomEvent('pos_print_server_role_changed', { detail: { isPrimary: enabled } }));
  }

  static isSoundAlertEnabled(): boolean {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(SOUND_ALERT_KEY);
    return stored === null ? true : stored === 'true';
  }

  static setSoundAlertEnabled(enabled: boolean): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SOUND_ALERT_KEY, String(enabled));
  }

  static getDeviceLabel(): string {
    const isPrimary = this.isPrimaryPrintServer();
    const id = getDeviceId();
    return `${isPrimary ? 'Counter POS' : 'Waiter Mobile'} (${id})`;
  }

  /**
   * Synthesize a clean, pleasant notification chime when an incoming waiter KOT prints.
   * Pure Web Audio API — works in all modern browsers without loading external audio assets.
   */
  static playNotificationChime(): void {
    if (!this.isSoundAlertEnabled()) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const now = ctx.currentTime;
      // High chime tone
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
      gain1.gain.setValueAtTime(0.18, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.4);

      // Harmonizing second ping
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1174.66, now + 0.14); // D6
      gain2.gain.setValueAtTime(0.2, now + 0.14);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.14);
      osc2.stop(now + 0.55);
    } catch (_) {}
  }

  /**
   * Queue a KOT thermal print job into Firestore from a waiter or secondary device.
   */
  static async queueRemoteKotPrint(
    kot: Kot,
    items: KotItem[],
    options?: {
      sourceUserName?: string;
      settings?: RestaurantSettings;
      tableNumber?: string;
    }
  ): Promise<{ success: boolean; jobId: string; error?: string }> {
    const now = Date.now();
    const jobId = `pjob_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const sourceDeviceId = getDeviceId();
    const cleanKotNo = String(kot.kotNumber || 'KOT').replace(/^#/, '');

    const job: RemotePrintJob = {
      id: jobId,
      jobType: 'KOT',
      status: 'PENDING',
      sourceDeviceId,
      sourceDeviceName: this.getDeviceLabel(),
      sourceUserName: options?.sourceUserName || kot.waiterName || 'Waiter',
      tableNumber: options?.tableNumber || kot.tableNumber || 'Take Away',
      referenceNumber: cleanKotNo.startsWith('KOT-') ? cleanKotNo : `KOT-${cleanKotNo}`,
      createdAt: now,
      updatedAt: now,
      kotData: {
        kot,
        items
      }
    };

    try {
      const docRef = doc(db, 'print_queue', jobId);
      await setDoc(docRef, sanitizeForFirestore(job));
      return { success: true, jobId };
    } catch (err: any) {
      console.error('Failed to enqueue remote KOT print job:', err);
      return { success: false, jobId, error: err?.message || 'Failed to submit remote print job' };
    }
  }

  /**
   * Queue a Bill / Receipt thermal print job into Firestore.
   */
  static async queueRemoteBillPrint(
    bill: Bill,
    items: BillItem[] = [],
    options?: {
      sourceUserName?: string;
      settings?: RestaurantSettings;
      isReprint?: boolean;
    }
  ): Promise<{ success: boolean; jobId: string; error?: string }> {
    const now = Date.now();
    const jobId = `pjob_bill_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const sourceDeviceId = getDeviceId();
    const cleanBillNo = String(bill.billNumber || '1').replace(/^BN-|^#/, '');

    const job: RemotePrintJob = {
      id: jobId,
      jobType: options?.isReprint ? 'REPRINT' : 'BILL',
      status: 'PENDING',
      sourceDeviceId,
      sourceDeviceName: this.getDeviceLabel(),
      sourceUserName: options?.sourceUserName || 'Counter Staff',
      tableNumber: bill.tableNumber || 'Counter',
      referenceNumber: `BN-${cleanBillNo}`,
      createdAt: now,
      updatedAt: now,
      billData: {
        bill,
        items
      }
    };

    try {
      const docRef = doc(db, 'print_queue', jobId);
      await setDoc(docRef, sanitizeForFirestore(job));
      return { success: true, jobId };
    } catch (err: any) {
      console.error('Failed to enqueue remote Bill print job:', err);
      return { success: false, jobId, error: err?.message || 'Failed to submit remote print job' };
    }
  }

  /**
   * Starts the real-time print queue listener on the PRIMARY POS terminal.
   * Scans Firestore for pending print jobs, triggers the physical printer, and marks completion.
   */
  static startPrimaryPrintQueueListener(
    getSettings: () => RestaurantSettings | undefined,
    onJobEvent?: (job: RemotePrintJob, status: RemotePrintJobStatus) => void
  ): () => void {
    // If this device is not currently designated as the Primary Print Server, skip processing
    if (!this.isPrimaryPrintServer()) {
      return () => {};
    }

    // Only query jobs created in the last 2 hours to avoid printing stale historical records
    const recentCutoff = Date.now() - 2 * 60 * 60 * 1000;
    
    // Single-field equality filter avoids requiring a composite index in Firestore
    const q = query(
      collection(db, 'print_queue'),
      where('status', '==', 'PENDING'),
      limit(10)
    );

    let isProcessing = false;

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        if (!this.isPrimaryPrintServer()) {
          return;
        }

        if (snapshot.empty || isProcessing) {
          return;
        }

        isProcessing = true;

        // Sort pending jobs chronologically in-memory
        const relevantChanges = snapshot.docChanges()
          .filter((ch) => ch.type === 'added' || ch.type === 'modified')
          .sort((a, b) => {
            const timeA = (a.doc.data() as RemotePrintJob)?.createdAt || 0;
            const timeB = (b.doc.data() as RemotePrintJob)?.createdAt || 0;
            return timeA - timeB;
          });

        for (const docChange of relevantChanges) {
          const rawData = docChange.doc.data() as RemotePrintJob;
          const jobId = docChange.doc.id;

          // Ignore stale jobs or already in-flight jobs
          if (rawData.createdAt < recentCutoff || inFlightJobIds.has(jobId) || rawData.status !== 'PENDING') {
            continue;
          }

          inFlightJobIds.add(jobId);
          const thisDeviceId = getDeviceId();

          try {
            // Step 1: Claim the job atomically in Firestore
            await updateDoc(doc(db, 'print_queue', jobId), {
              status: 'PRINTING',
              executedByDeviceId: thisDeviceId,
              updatedAt: Date.now()
            });

            if (onJobEvent) {
              onJobEvent({ ...rawData, status: 'PRINTING', executedByDeviceId: thisDeviceId }, 'PRINTING');
            }

            // Step 2: Execute the thermal print
            const currentSettings = getSettings();
            let printSuccess = false;
            let printError: string | undefined;

            if (rawData.jobType === 'KOT' && rawData.kotData) {
              const res = await PrintService.printKot(
                rawData.kotData.kot,
                rawData.kotData.items || [],
                currentSettings
              );
              printSuccess = res.success;
              printError = res.error;
            } else if ((rawData.jobType === 'BILL' || rawData.jobType === 'REPRINT') && rawData.billData) {
              const res = await PrintService.printReceipt({
                bill: rawData.billData.bill,
                items: rawData.billData.items || [],
                settings: currentSettings,
                isReprint: rawData.jobType === 'REPRINT'
              });
              printSuccess = res.success;
              printError = res.error;
            } else if (rawData.jobType === 'TEST') {
              const res = await PrintService.testPrint(currentSettings);
              printSuccess = res.success;
              printError = res.error;
            } else {
              printSuccess = true; // Fallback
            }

            // Step 3: Update final status
            const finishTime = Date.now();
            const finalStatus: RemotePrintJobStatus = printSuccess ? 'COMPLETED' : 'FAILED';

            await updateDoc(doc(db, 'print_queue', jobId), {
              status: finalStatus,
              executedAt: finishTime,
              updatedAt: finishTime,
              ...(printError ? { errorMessage: printError } : {})
            });

            if (printSuccess) {
              this.playNotificationChime();
              window.dispatchEvent(
                new CustomEvent('pos_remote_kot_printed', {
                  detail: {
                    jobId,
                    referenceNumber: rawData.referenceNumber,
                    sourceUserName: rawData.sourceUserName,
                    tableNumber: rawData.tableNumber
                  }
                })
              );
            }

            if (onJobEvent) {
              onJobEvent(
                {
                  ...rawData,
                  status: finalStatus,
                  executedAt: finishTime,
                  errorMessage: printError
                },
                finalStatus
              );
            }
          } catch (err: any) {
            console.error(`Error executing remote print job ${jobId}:`, err);
            try {
              await updateDoc(doc(db, 'print_queue', jobId), {
                status: 'FAILED',
                errorMessage: err?.message || 'Execution error on primary POS',
                updatedAt: Date.now()
              });
            } catch (_) {}
          } finally {
            inFlightJobIds.delete(jobId);
          }
        }

        isProcessing = false;
      },
      (err: any) => {
        if (err?.code === 'permission-denied') {
          console.debug('Firestore print_queue: subscription waiting for authentication or remote permissions.');
        } else {
          console.warn('Firestore print_queue snapshot notice:', err?.message || err);
        }
        isProcessing = false;
      }
    );

    return unsubscribe;
  }

  /**
   * Watch an individual print job's lifecycle on the waiter/secondary device.
   */
  static watchJob(jobId: string, onUpdate: (job: RemotePrintJob) => void): () => void {
    const docRef = doc(db, 'print_queue', jobId);
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        onUpdate(snap.data() as RemotePrintJob);
      }
    });
  }

  /**
   * Listen to the stream of recent print jobs for queue inspection in Settings or KOT Management.
   */
  static subscribeToRecentJobs(
    callback: (jobs: RemotePrintJob[]) => void,
    maxJobs = 20
  ): () => void {
    const q = query(
      collection(db, 'print_queue'),
      orderBy('createdAt', 'desc'),
      limit(maxJobs)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const jobs = snapshot.docs.map((d) => d.data() as RemotePrintJob);
        callback(jobs);
      },
      (err: any) => {
        if (err?.code === 'permission-denied') {
          console.debug('Recent print jobs subscription: permission denied or waiting for auth.');
        } else {
          console.warn('Recent print jobs subscription notice:', err?.message || err);
        }
      }
    );
  }

  /**
   * Clear older completed or failed jobs to maintain a trim collection.
   */
  static async clearCompletedJobs(): Promise<number> {
    try {
      const q = query(
        collection(db, 'print_queue'),
        where('status', 'in', ['COMPLETED', 'FAILED']),
        limit(50)
      );
      const snap = await getDocs(q);
      if (snap.empty) return 0;

      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      return snap.size;
    } catch (err) {
      console.warn('Failed to clear completed print queue jobs:', err);
      return 0;
    }
  }
}
