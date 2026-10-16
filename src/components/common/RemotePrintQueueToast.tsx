import React, { useEffect, useState } from 'react';
import { Printer, CheckCircle2, AlertTriangle, X, Radio } from 'lucide-react';
import { RemotePrintQueueService } from '../../services/remotePrintQueueService';
import { RestaurantSettings, RemotePrintJob } from '../../types';

interface RemotePrintQueueToastProps {
  settings?: RestaurantSettings;
  onNavigateKot?: () => void;
}

interface ToastMessage {
  id: string;
  referenceNumber: string;
  sourceUserName?: string;
  tableNumber?: string;
  status: 'COMPLETED' | 'FAILED' | 'PRINTING';
  errorMessage?: string;
}

export const RemotePrintQueueToast: React.FC<RemotePrintQueueToastProps> = ({
  settings,
  onNavigateKot
}) => {
  const [activeToast, setActiveToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    // Start listening on Firestore print_queue if this device is the primary print server
    const unsubscribe = RemotePrintQueueService.startPrimaryPrintQueueListener(
      () => settings,
      (job: RemotePrintJob, status) => {
        if (status === 'COMPLETED') {
          setActiveToast({
            id: job.id,
            referenceNumber: job.referenceNumber,
            sourceUserName: job.sourceUserName,
            tableNumber: job.tableNumber,
            status: 'COMPLETED'
          });
        } else if (status === 'FAILED') {
          setActiveToast({
            id: job.id,
            referenceNumber: job.referenceNumber,
            sourceUserName: job.sourceUserName,
            tableNumber: job.tableNumber,
            status: 'FAILED',
            errorMessage: job.errorMessage
          });
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [settings]);

  // Auto-dismiss toast after 6 seconds
  useEffect(() => {
    if (!activeToast) return;
    const timer = setTimeout(() => {
      setActiveToast(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [activeToast]);

  if (!activeToast) return null;

  const isSuccess = activeToast.status === 'COMPLETED';

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full animate-in slide-in-from-bottom-3 duration-200">
      <div 
        className={`p-3.5 rounded-xl shadow-2xl border flex items-start gap-3 backdrop-blur-md ${
          isSuccess 
            ? 'bg-slate-900/95 border-emerald-500/50 text-slate-100 shadow-emerald-950/40' 
            : 'bg-red-950/95 border-red-500/50 text-red-50 shadow-red-950/40'
        }`}
        role="alert"
      >
        <div className={`p-2 rounded-lg shrink-0 ${isSuccess ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
          {isSuccess ? <Printer className="w-5 h-5 animate-pulse" /> : <AlertTriangle className="w-5 h-5" />}
        </div>

        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-950 text-emerald-400 border border-emerald-800">
              <Radio className="w-2.5 h-2.5 animate-ping" />
              Remote KOT Printed
            </span>
            <span className="text-xs font-mono font-bold text-amber-300">
              {activeToast.referenceNumber}
            </span>
          </div>

          <p className="text-xs font-medium text-slate-200 mt-1">
            {isSuccess ? (
              <>Auto-printed for <strong>{activeToast.tableNumber || 'Table'}</strong> from waiter <strong>{activeToast.sourceUserName || 'Staff'}</strong>.</>
            ) : (
              <>Print failed: {activeToast.errorMessage || 'Printer unavailable'}</>
            )}
          </p>

          {onNavigateKot && (
            <button
              type="button"
              onClick={() => {
                setActiveToast(null);
                onNavigateKot();
              }}
              className="mt-1.5 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
            >
              View in Kitchen / KOT &rarr;
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setActiveToast(null)}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 shrink-0 cursor-pointer"
          aria-label="Dismiss toast"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
