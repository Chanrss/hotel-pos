import React from 'react';
import { 
  Wifi, 
  WifiOff, 
  Cloud, 
  Database, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  HardDrive, 
  Activity, 
  X,
  Server,
  Zap,
  Clock,
  Laptop
} from 'lucide-react';
import { FirestoreConnectivityInfo } from '../../hooks/useFirestoreConnectivity';
import { getDeviceId } from '../../services/firebase';

export interface FirestoreConnectivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectivity: FirestoreConnectivityInfo;
}

export const FirestoreConnectivityModal: React.FC<FirestoreConnectivityModalProps> = ({
  isOpen,
  onClose,
  connectivity
}) => {
  if (!isOpen) return null;

  const {
    state,
    isOnline,
    isFromCache,
    hasPendingWrites,
    lastSyncTime,
    latencyMs,
    isSimulatedOffline,
    errorMessage,
    isTestingConnection,
    testConnection,
    reconnect,
    toggleSimulatedOffline
  } = connectivity;

  const deviceId = getDeviceId();

  const formattedLastSync = lastSyncTime
    ? lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Not yet synced this session';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="connectivity-modal-title"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col text-slate-100 max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 rounded-lg ${
              state === 'online-synced' 
                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/60'
                : state === 'syncing'
                ? 'bg-sky-950/80 text-sky-400 border border-sky-700/60'
                : 'bg-amber-950/80 text-amber-400 border border-amber-700/60'
            }`}>
              {state === 'online-synced' ? (
                <Cloud className="w-5 h-5" />
              ) : state === 'syncing' ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <HardDrive className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 id="connectivity-modal-title" className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                Firestore Database & Sync Monitor
              </h2>
              <p className="text-2xs text-slate-400 font-mono">
                Real-time connection & IndexedDB persistence state
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          
          {/* Main Status Hero Banner */}
          <div className={`p-3.5 rounded-lg border ${
            state === 'online-synced'
              ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-200'
              : state === 'syncing'
              ? 'bg-sky-950/40 border-sky-700/50 text-sky-200'
              : 'bg-amber-950/40 border-amber-700/50 text-amber-200'
          }`}>
            <div className="flex items-start gap-3">
              <span className={`w-3 h-3 rounded-full mt-0.5 shrink-0 ${
                state === 'online-synced'
                  ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                  : state === 'syncing'
                  ? 'bg-sky-400 animate-pulse shadow-[0_0_8px_#38bdf8]'
                  : 'bg-amber-400 animate-pulse shadow-[0_0_8px_#fbbf24]'
              }`} />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-sm tracking-wide uppercase">
                    {state === 'online-synced' && 'Cloud Firestore: Connected & Synced'}
                    {state === 'syncing' && 'Cloud Firestore: Synchronizing Local Writes'}
                    {state === 'offline-persistence' && 'Offline Persistence Mode Active'}
                    {state === 'connecting' && 'Checking Firestore Connection...'}
                  </span>
                  {isSimulatedOffline && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      SIMULATED OFFLINE
                    </span>
                  )}
                </div>
                <p className="mt-1 text-2xs text-slate-300 leading-relaxed">
                  {state === 'online-synced' && (
                    'Bidirectional synchronization with Cloud Firestore is active. All bills, orders, and inventory events are synced immediately across devices.'
                  )}
                  {state === 'syncing' && (
                    'Local offline transactions are currently being dispatched and synchronized with the Cloud Firestore server.'
                  )}
                  {state === 'offline-persistence' && (
                    'The POS is currently operating in offline persistence mode. All bills, KOT orders, and inventory changes are securely saved to local IndexedDB and localStorage. You can continue billing customers normally with zero interruption.'
                  )}
                  {state === 'connecting' && (
                    'Testing server handshake and verifying local database cache...'
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Telemetry Metric Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            
            {/* Network Connection */}
            <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/70">
              <div className="flex items-center gap-1.5 text-slate-400 text-2xs mb-1">
                {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5 text-rose-400" />}
                <span>Physical Network</span>
              </div>
              <div className="font-bold text-xs text-slate-100 flex items-center gap-1">
                {isOnline ? (
                  <span className="text-emerald-400">ONLINE</span>
                ) : (
                  <span className="text-rose-400">DISCONNECTED</span>
                )}
              </div>
            </div>

            {/* Firestore Cache Source */}
            <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/70">
              <div className="flex items-center gap-1.5 text-slate-400 text-2xs mb-1">
                <Database className="w-3.5 h-3.5 text-amber-400" />
                <span>Data Source</span>
              </div>
              <div className="font-bold text-xs text-slate-100">
                {isFromCache ? (
                  <span className="text-amber-400">IndexedDB Cache</span>
                ) : (
                  <span className="text-emerald-400">Cloud Server</span>
                )}
              </div>
            </div>

            {/* Pending Writes */}
            <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/70">
              <div className="flex items-center gap-1.5 text-slate-400 text-2xs mb-1">
                <Activity className="w-3.5 h-3.5 text-sky-400" />
                <span>Pending Writes</span>
              </div>
              <div className="font-bold text-xs text-slate-100">
                {hasPendingWrites ? (
                  <span className="text-sky-400 animate-pulse">Syncing Queue...</span>
                ) : (
                  <span className="text-slate-300">0 queued</span>
                )}
              </div>
            </div>

            {/* Cloud Ping Latency */}
            <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/70">
              <div className="flex items-center gap-1.5 text-slate-400 text-2xs mb-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Cloud Ping</span>
              </div>
              <div className="font-mono font-bold text-xs text-slate-100">
                {latencyMs !== null ? `${latencyMs} ms` : isOnline ? 'Ready' : 'Offline'}
              </div>
            </div>

            {/* Last Cloud Sync */}
            <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/70 col-span-2 sm:col-span-2">
              <div className="flex items-center gap-1.5 text-slate-400 text-2xs mb-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Last Cloud Sync</span>
              </div>
              <div className="font-mono text-2xs text-slate-200 truncate">
                {formattedLastSync}
              </div>
            </div>

          </div>

          {/* Offline Persistence Resilience Guarantees */}
          <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2">
            <h3 className="font-bold text-2xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Offline Persistence Architecture
            </h3>
            <ul className="space-y-1.5 text-2xs text-slate-300">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>IndexedDB Resilience:</strong> Firestore persistence is initialized with <code className="text-amber-300">forceOwnership: true</code> for dedicated tab cache ownership.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Zero Data Loss:</strong> All saved bills and KOT orders are cached locally and committed to Firestore automatically when connection is established.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Instant Thermal Printing:</strong> POS billing receipts and KOT slips print directly to hardware via Web Print / USB without requiring cloud round-trips.</span>
              </li>
            </ul>
          </div>

          {/* Terminal & Database Details */}
          <div className="px-3 py-2 rounded bg-slate-950 border border-slate-800 flex items-center justify-between text-2xs font-mono text-slate-400">
            <span className="flex items-center gap-1">
              <Laptop className="w-3 h-3 text-slate-500" />
              Terminal ID: <strong className="text-slate-200">{deviceId}</strong>
            </span>
            <span className="hidden sm:inline text-slate-500">
              DB: ai-studio-165bbbf2...
            </span>
          </div>

          {/* Error Message if present */}
          {errorMessage && (
            <div className="p-2.5 rounded bg-rose-950/50 border border-rose-800/60 text-rose-300 text-2xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span className="font-mono">{errorMessage}</span>
            </div>
          )}

        </div>

        {/* Modal Footer Controls */}
        <div className="px-4 py-3 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => testConnection()}
              disabled={isTestingConnection}
              className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-2xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="Ping Cloud Firestore server"
            >
              <RefreshCw className={`w-3 h-3 ${isTestingConnection ? 'animate-spin text-amber-400' : 'text-slate-400'}`} />
              <span>{isTestingConnection ? 'Pinging...' : 'Ping Cloud Server'}</span>
            </button>

            <button
              type="button"
              onClick={() => reconnect()}
              disabled={isTestingConnection}
              className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-2xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="Force reconnect to Firestore network"
            >
              <Server className="w-3 h-3 text-emerald-400" />
              <span>Reconnect</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleSimulatedOffline()}
              className={`px-2.5 py-1.5 rounded border text-2xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                isSimulatedOffline
                  ? 'bg-amber-500 text-slate-950 border-amber-400 hover:bg-amber-400 font-black'
                  : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700'
              }`}
              title="Simulate working completely offline"
            >
              {isSimulatedOffline ? (
                <>
                  <Wifi className="w-3 h-3 text-slate-950" />
                  <span>Exit Simulated Offline</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-amber-400" />
                  <span>Test Offline Mode</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-2xs font-bold transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
