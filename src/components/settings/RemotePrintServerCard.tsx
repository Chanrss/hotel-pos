import React, { useState, useEffect } from 'react';
import { 
  Printer, 
  Radio, 
  Smartphone, 
  Laptop, 
  Volume2, 
  VolumeX, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Trash2, 
  Send,
  RefreshCw,
  Server,
  Info
} from 'lucide-react';
import { RemotePrintQueueService } from '../../services/remotePrintQueueService';
import { getDeviceId } from '../../services/firebase';
import { RemotePrintJob, RestaurantSettings } from '../../types';

interface RemotePrintServerCardProps {
  settings?: RestaurantSettings;
  onUpdateSettings?: (updater: (prev: RestaurantSettings) => RestaurantSettings) => void;
}

export const RemotePrintServerCard: React.FC<RemotePrintServerCardProps> = ({
  settings,
  onUpdateSettings
}) => {
  const [isPrimary, setIsPrimary] = useState<boolean>(() => RemotePrintQueueService.isPrimaryPrintServer());
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => RemotePrintQueueService.isSoundAlertEnabled());
  const [recentJobs, setRecentJobs] = useState<RemotePrintJob[]>([]);
  const [isTestingQueue, setIsTestingQueue] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const deviceId = getDeviceId();

  useEffect(() => {
    // Subscribe to recent remote print jobs in Firestore
    const unsub = RemotePrintQueueService.subscribeToRecentJobs((jobs) => {
      setRecentJobs(jobs);
    }, 15);

    const handleRoleChanged = (e: Event) => {
      const custom = e as CustomEvent<{ isPrimary: boolean }>;
      if (custom.detail) {
        setIsPrimary(custom.detail.isPrimary);
      }
    };

    window.addEventListener('pos_print_server_role_changed', handleRoleChanged);

    return () => {
      unsub();
      window.removeEventListener('pos_print_server_role_changed', handleRoleChanged);
    };
  }, []);

  const handleTogglePrimaryServer = (enabled: boolean) => {
    setIsPrimary(enabled);
    RemotePrintQueueService.setPrimaryPrintServer(enabled);
    if (onUpdateSettings) {
      onUpdateSettings((prev) => ({
        ...prev,
        isPrimaryPrintServer: enabled
      }));
    }
    setFeedback(enabled ? 'This device is now the Primary POS Print Server!' : 'Switched to Waiter / Remote client mode.');
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleToggleSound = (enabled: boolean) => {
    setSoundEnabled(enabled);
    RemotePrintQueueService.setSoundAlertEnabled(enabled);
    if (enabled) {
      RemotePrintQueueService.playNotificationChime();
    }
  };

  const handleSendTestRemoteJob = async () => {
    setIsTestingQueue(true);
    const testKot: any = {
      id: `test_kot_${Date.now()}`,
      kotNumber: `KOT-T${Math.floor(10 + Math.random() * 90)}`,
      businessDate: new Date().toISOString().split('T')[0],
      orderType: 'DINE_IN',
      tableNumber: 'Table 4',
      waiterId: 'waiter_demo',
      waiterName: 'Waiter (Android Mobile)',
      status: 'OPEN',
      printStatus: 'PENDING',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const testItems: any[] = [
      {
        id: `item_test_1`,
        kotId: testKot.id,
        itemId: 'item_1',
        itemCode: 'D01',
        itemName: 'Ghee Roast Dosa',
        quantity: 2,
        priceType: 'NON_AC',
        unitPrice: 85,
        status: 'PENDING',
        printStatus: 'PENDING',
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: `item_test_2`,
        kotId: testKot.id,
        itemId: 'item_2',
        itemCode: 'B01',
        itemName: 'Filter Coffee (Hot)',
        quantity: 2,
        priceType: 'NON_AC',
        unitPrice: 30,
        status: 'PENDING',
        printStatus: 'PENDING',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    const res = await RemotePrintQueueService.queueRemoteKotPrint(testKot, testItems, {
      sourceUserName: 'Waiter (Android Mobile)',
      settings
    });

    setIsTestingQueue(false);
    if (res.success) {
      setFeedback(`Test KOT queued in Firestore! Job: ${res.jobId}`);
      setTimeout(() => setFeedback(null), 4000);
    } else {
      setFeedback(`Failed to queue test job: ${res.error}`);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const handleClearCompleted = async () => {
    setClearing(true);
    const count = await RemotePrintQueueService.clearCompletedJobs();
    setClearing(false);
    setFeedback(`Cleared ${count} completed print queue job(s).`);
    setTimeout(() => setFeedback(null), 3000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              Multi-Device Remote Print Server
              <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/50">
                Firestore Queue
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Print thermal KOTs &amp; bills triggered from waiter smartphones &amp; tablets to this counter terminal
            </p>
          </div>
        </div>

        <div className="text-right">
          <div className="text-[10px] font-mono text-slate-400">Device Terminal ID:</div>
          <div className="text-xs font-mono font-bold text-amber-300">{deviceId}</div>
        </div>
      </div>

      {feedback && (
        <div className="px-3 py-2 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Role Selection Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Option 1: Primary Print Server */}
        <button
          type="button"
          onClick={() => handleTogglePrimaryServer(true)}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
            isPrimary
              ? 'bg-emerald-950/40 border-emerald-500 text-white shadow-md shadow-emerald-950/30'
              : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <div className={`p-2 rounded-lg mt-0.5 ${isPrimary ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
            <Server className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-xs flex items-center gap-1.5 text-white">
              Primary POS Terminal (Print Server)
              {isPrimary && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Receives &amp; automatically prints KOTs from all connected waiter tablets &amp; mobile phones.
            </div>
          </div>
        </button>

        {/* Option 2: Secondary / Waiter Terminal */}
        <button
          type="button"
          onClick={() => handleTogglePrimaryServer(false)}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
            !isPrimary
              ? 'bg-amber-950/40 border-amber-500 text-white shadow-md shadow-amber-950/30'
              : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <div className={`p-2 rounded-lg mt-0.5 ${!isPrimary ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-xs text-white">
              Secondary Waiter Terminal (Client Mode)
            </div>
            <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Takes table orders and pushes print requests to the Counter POS Terminal through Firestore queue.
            </div>
          </div>
        </button>
      </div>

      {/* Hardware vs Cloud Queue Clarification */}
      <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-300 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-amber-300">"Print Server" vs Physical Thermal Printer:</span>
          <p className="text-slate-400 mt-0.5 leading-relaxed">
            "Print Server ON" designates this device to listen for incoming wireless KOTs sent by waiter mobile phones via cloud queue. It does <em>not</em> detect whether your physical USB/Bluetooth thermal printer is plugged in or powered on. To test physical paper output or set margins, use the <strong>[TEST PRINT]</strong> in Thermal Receipt Settings.
          </p>
        </div>
      </div>

      {/* Additional Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800/80">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => handleToggleSound(e.target.checked)}
              className="w-3.5 h-3.5 accent-emerald-500 rounded cursor-pointer"
            />
            {soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-slate-500" />
            )}
            <span>Sound chime when remote KOT prints</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSendTestRemoteJob}
            disabled={isTestingQueue}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
            title="Queue a test KOT to verify the Firestore remote print queue"
          >
            <Send className="w-3 h-3 text-amber-400" />
            <span>{isTestingQueue ? 'Queueing...' : 'Test Remote KOT'}</span>
          </button>

          <button
            type="button"
            onClick={handleClearCompleted}
            disabled={clearing || recentJobs.length === 0}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-red-950 text-slate-300 hover:text-red-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-40"
            title="Clean completed and failed jobs from Firestore queue"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear Done</span>
          </button>
        </div>
      </div>

      {/* Live Recent Remote Jobs Table */}
      <div className="space-y-2 pt-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <span>Live Remote Queue Monitor</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-slate-800 text-slate-400">
              {recentJobs.length}
            </span>
          </div>
          <span className="text-[10px] text-slate-400">
            Real-time Firestore stream
          </span>
        </div>

        {recentJobs.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 text-center text-xs text-slate-500">
            No remote print jobs in queue yet. When a waiter places an order from a mobile/tablet, it will appear here instantly.
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden text-xs max-h-56 overflow-y-auto">
            <table className="w-full text-left divide-y divide-slate-800">
              <thead className="bg-slate-900/90 text-slate-400 font-semibold text-[10px] uppercase">
                <tr>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Ticket #</th>
                  <th className="py-2 px-3">Table</th>
                  <th className="py-2 px-3">Waiter / Source</th>
                  <th className="py-2 px-3 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {recentJobs.map((job) => {
                  const timeFormatted = new Date(job.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  });

                  return (
                    <tr key={job.id} className="hover:bg-slate-900/50">
                      <td className="py-2 px-3 font-sans">
                        {job.status === 'COMPLETED' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            PRINTED
                          </span>
                        ) : job.status === 'PRINTING' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 animate-pulse">
                            <Clock className="w-2.5 h-2.5" />
                            PRINTING
                          </span>
                        ) : job.status === 'PENDING' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800">
                            <Clock className="w-2.5 h-2.5" />
                            PENDING
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-800" title={job.errorMessage}>
                            <AlertTriangle className="w-2.5 h-2.5" />
                            FAILED
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-bold text-amber-300">
                        {job.referenceNumber}
                      </td>
                      <td className="py-2 px-3 text-slate-200 font-sans">
                        {job.tableNumber || '-'}
                      </td>
                      <td className="py-2 px-3 text-slate-400 font-sans truncate max-w-[120px]" title={job.sourceDeviceName}>
                        {job.sourceUserName || job.sourceDeviceId}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-400 text-[10px]">
                        {timeFormatted}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
