import React, { useState, useEffect, useMemo } from 'react';
import {
  Monitor,
  Smartphone,
  Tablet,
  Wifi,
  Printer,
  RefreshCw,
  LogOut,
  Trash2,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  Edit3,
  Check,
  X,
  UserCheck,
  Radio,
  Layers,
  Laptop
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getDeviceId } from '../../services/firebase';
import { DeviceSessionService } from '../../services/deviceSessionService';
import { RemotePrintQueueService } from '../../services/remotePrintQueueService';
import { UserDeviceSession } from '../../types';

const SCREEN_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  'direct-billing': 'Direct Counter Billing',
  pos: 'Touch POS',
  kot: 'New KOT',
  'running-kot': 'Running KOTs',
  reprint: 'Bills & Reprint',
  menu: 'Menu Catalog',
  inventory: 'Inventory',
  reports: 'Reports & Backup',
  users: 'Staff & Roles',
  settings: 'Settings',
  'receipt-settings': 'Receipt Settings'
};

export const ConnectedDevicesSubView: React.FC = () => {
  const { currentUser } = useAuth();
  const currentDeviceId = getDeviceId();

  const [allSessions, setAllSessions] = useState<UserDeviceSession[]>([]);
  const [scopeFilter, setScopeFilter] = useState<'same-profile' | 'all-profiles'>('same-profile');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ONLINE' | 'OFFLINE'>('ALL');
  const [isSyncing, setIsSyncing] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [customNameInput, setCustomNameInput] = useState(() => DeviceSessionService.getDeviceName());
  const [isPrimaryPrintServer, setIsPrimaryPrintServer] = useState(() =>
    RemotePrintQueueService.isPrimaryPrintServer()
  );
  const [bannerNotice, setBannerNotice] = useState<{
    type: 'success' | 'info';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    const unsub = DeviceSessionService.subscribeToSessions(currentUser, (sessions) => {
      setAllSessions(sessions);
    });

    const handleRoleChange = () => {
      setIsPrimaryPrintServer(RemotePrintQueueService.isPrimaryPrintServer());
    };
    window.addEventListener('pos_print_server_role_changed', handleRoleChange);

    return () => {
      unsub();
      window.removeEventListener('pos_print_server_role_changed', handleRoleChange);
    };
  }, [currentUser]);

  const showToast = (text: string, type: 'success' | 'info' = 'success') => {
    setBannerNotice({ type, text });
    window.setTimeout(() => {
      setBannerNotice((prev) => (prev?.text === text ? null : prev));
    }, 3200);
  };

  // Sessions belonging to the same Firestore user profile
  const profileSessions = useMemo(() => {
    if (!currentUser) return [];
    return allSessions.filter((s) => DeviceSessionService.isSameUserProfile(s, currentUser));
  }, [allSessions, currentUser]);

  const displayedSessions = useMemo(() => {
    const base = scopeFilter === 'same-profile' ? profileSessions : allSessions;
    return base.filter((session) => {
      const effectiveStatus = DeviceSessionService.getComputedStatus(session);
      if (statusFilter === 'ONLINE') {
        return effectiveStatus === 'ONLINE' || effectiveStatus === 'IDLE';
      }
      if (statusFilter === 'OFFLINE') {
        return effectiveStatus === 'OFFLINE' || effectiveStatus === 'REVOKED';
      }
      return true;
    });
  }, [scopeFilter, profileSessions, allSessions, statusFilter]);

  const thisDeviceSession = useMemo(() => {
    if (!currentUser) return null;
    return (
      profileSessions.find((s) => s.deviceId === currentDeviceId) ||
      DeviceSessionService.buildCurrentSessionPayload(currentUser, { activeScreen: 'settings' })
    );
  }, [profileSessions, currentUser, currentDeviceId]);

  const activeCountOnProfile = useMemo(() => {
    return profileSessions.filter((s) => {
      const st = DeviceSessionService.getComputedStatus(s);
      return st === 'ONLINE' || st === 'IDLE';
    }).length;
  }, [profileSessions]);

  const primaryPrintServersCount = useMemo(() => {
    return profileSessions.filter((s) => {
      const st = DeviceSessionService.getComputedStatus(s);
      return (st === 'ONLINE' || st === 'IDLE') && s.isPrimaryPrintServer;
    }).length;
  }, [profileSessions]);

  const handleManualSync = async () => {
    if (!currentUser) return;
    setIsSyncing(true);
    try {
      const payload = DeviceSessionService.buildCurrentSessionPayload(currentUser, {
        activeScreen: 'settings',
        status: 'ONLINE'
      });
      await DeviceSessionService.syncSessionToCloud(payload);
      showToast('Connected devices & active session heartbeat synced with Firestore.');
    } finally {
      window.setTimeout(() => setIsSyncing(false), 350);
    }
  };

  const handleSaveDeviceName = async () => {
    if (!currentUser) return;
    const cleaned = customNameInput.trim() || 'Counter POS Terminal';
    setCustomNameInput(cleaned);
    await DeviceSessionService.renameCurrentDevice(cleaned, currentUser);
    setEditingName(false);
    showToast(`This device renamed to "${cleaned}".`);
  };

  const handleToggleThisDevicePrintRole = async (makePrimary: boolean) => {
    if (!currentUser) return;
    RemotePrintQueueService.setPrimaryPrintServer(makePrimary);
    setIsPrimaryPrintServer(makePrimary);
    const updated = DeviceSessionService.buildCurrentSessionPayload(currentUser, {
      isPrimaryPrintServer: makePrimary,
      activeScreen: 'settings'
    });
    await DeviceSessionService.syncSessionToCloud(updated);
    showToast(
      makePrimary
        ? 'This device is now set as Primary Counter Print Server (Print Server ON).'
        : 'This device is now set to Remote Mode (sends print jobs to Counter POS).'
    );
  };

  const handleRevokeSession = async (session: UserDeviceSession) => {
    await DeviceSessionService.revokeSession(session);
    showToast(`Signed out session on "${session.deviceName}" (${session.deviceId}).`, 'info');
  };

  const handleRemoveSession = async (session: UserDeviceSession) => {
    await DeviceSessionService.removeSessionRecord(session.id);
    showToast(`Removed device record "${session.deviceName}" (${session.deviceId}).`, 'info');
  };

  const handleRevokeAllOtherSessions = async () => {
    const others = profileSessions.filter(
      (s) => s.deviceId !== currentDeviceId && DeviceSessionService.getComputedStatus(s) !== 'REVOKED'
    );
    if (others.length === 0) {
      showToast('No other active device sessions to sign out.', 'info');
      return;
    }
    await Promise.all(others.map((s) => DeviceSessionService.revokeSession(s)));
    showToast(`Signed out ${others.length} other connected device session(s).`);
  };

  const formatRelativeTime = (timestamp?: number): string => {
    if (!timestamp) return 'Just now';
    const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (diffSec < 15) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    return `${diffDays}d ago`;
  };

  const formatDateTime = (timestamp?: number): string => {
    if (!timestamp) return '—';
    try {
      return new Date(timestamp).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (_) {
      return '—';
    }
  };

  const renderDeviceIcon = (type: UserDeviceSession['deviceType'], isSelf: boolean) => {
    const baseClass = `w-5 h-5 ${isSelf ? 'text-emerald-400' : 'text-amber-400'}`;
    if (type === 'mobile') return <Smartphone className={baseClass} />;
    if (type === 'tablet') return <Tablet className={baseClass} />;
    return <Monitor className={baseClass} />;
  };

  if (!currentUser) return null;

  return (
    <div className="flex flex-col gap-4 pb-8 md:h-full md:overflow-y-auto md:pr-1">
      {/* Toast Notice */}
      {bannerNotice && (
        <div
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between gap-2 border shadow-md ${
            bannerNotice.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
              : 'bg-slate-900 border-amber-500/40 text-amber-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{bannerNotice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerNotice(null)}
            className="text-slate-400 hover:text-white p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. FIRESTORE USER PROFILE & ACTIVE SESSIONS SUMMARY */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-extrabold text-sm sm:text-base text-white">
                  Firestore Profile: {currentUser.name}
                </h3>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {(currentUser.roleId || 'owner').toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-mono break-all">
                {currentUser.email || `${currentUser.username || 'owner'}@hotelpos.local`} • Profile ID:{' '}
                <span className="text-slate-300">{currentUser.uid}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isSyncing}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Refresh Sessions'}</span>
            </button>

            {profileSessions.length > 1 && (
              <button
                type="button"
                onClick={handleRevokeAllOtherSessions}
                className="px-3 py-2 bg-rose-950/70 hover:bg-rose-900/80 text-rose-200 border border-rose-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                <span>Sign Out Other Devices</span>
              </button>
            )}
          </div>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Active Devices on Profile
              </div>
              <div className="text-xl sm:text-2xl font-black text-emerald-400 mt-0.5">
                {activeCountOnProfile} {activeCountOnProfile === 1 ? 'Device' : 'Devices'}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Real-time Firestore sync active
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Wifi className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Primary Print Server
              </div>
              <div className="text-xl sm:text-2xl font-black text-amber-400 mt-0.5">
                {primaryPrintServersCount} {primaryPrintServersCount === 1 ? 'Terminal' : 'Terminals'}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {isPrimaryPrintServer ? 'This device prints receipts' : 'Remote queue forwarding'}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Printer className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Total Known Sessions
              </div>
              <div className="text-xl sm:text-2xl font-black text-white mt-0.5">
                {profileSessions.length} {profileSessions.length === 1 ? 'Session' : 'Sessions'}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Linked to {currentUser.name}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
              <Layers className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* 2. THIS DEVICE HIGHLIGHT CARD */}
      {thisDeviceSession && (
        <div className="bg-slate-900 border-2 border-emerald-500/50 rounded-2xl p-4 sm:p-5 shadow-lg space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-400">
                This Device • Active Session
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] text-slate-300 font-bold">
                {thisDeviceSession.deviceId}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 font-mono">
                {thisDeviceSession.osBrowserLabel} ({thisDeviceSession.viewportSize})
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
            {/* Device Name & Editor */}
            <div className="lg:col-span-6 space-y-2">
              <div className="text-xs font-semibold text-slate-400">
                Terminal / Device Label (shown on bills, KOTs &amp; session list):
              </div>
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customNameInput}
                    onChange={(e) => setCustomNameInput(e.target.value)}
                    placeholder="e.g. Main Counter PC or Waiter Phone 1"
                    className="flex-1 bg-slate-950 border border-emerald-500 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSaveDeviceName}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomNameInput(DeviceSessionService.getDeviceName());
                      setEditingName(false);
                    }}
                    className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                    {renderDeviceIcon(thisDeviceSession.deviceType, true)}
                  </div>
                  <div>
                    <div className="font-extrabold text-sm sm:text-base text-white flex items-center gap-2">
                      <span>{thisDeviceSession.deviceName}</span>
                      <button
                        type="button"
                        onClick={() => setEditingName(true)}
                        className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Rename</span>
                      </button>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Logged in: {formatDateTime(thisDeviceSession.loginAt)} • Active on{' '}
                      <span className="text-emerald-300 font-semibold">
                        {SCREEN_LABELS[thisDeviceSession.activeScreen || 'settings'] || 'Settings'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Print Role Switcher for This Device */}
            <div className="lg:col-span-6 bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-amber-400" />
                  <span>This Device&apos;s Thermal Printer Role</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isPrimaryPrintServer
                    ? 'Connected to USB/LAN printer — prints bills & remote mobile KOTs'
                    : 'Mobile / Secondary POS — sends print jobs to Counter Print Server'}
                </p>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => handleToggleThisDevicePrintRole(true)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                    isPrimaryPrintServer
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Print Server ON
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleThisDevicePrintRole(false)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                    !isPrimaryPrintServer
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Remote Mode
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. CONNECTED DEVICES LIST (SAME FIRESTORE USER PROFILE) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
              <Laptop className="w-4 h-4 text-amber-400" />
              <span>Connected Devices &amp; Active Sessions</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              All PCs, laptops, tablets, and mobile phones signed into the same Firestore user profile
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Scope Filter */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setScopeFilter('same-profile')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  scopeFilter === 'same-profile'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                My Profile ({profileSessions.length})
              </button>
              <button
                type="button"
                onClick={() => setScopeFilter('all-profiles')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  scopeFilter === 'all-profiles'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All Staff ({allSessions.length})
              </button>
            </div>

            {/* Status Filter */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              {(['ALL', 'ONLINE', 'OFFLINE'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                    statusFilter === st
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {st === 'ALL' ? 'All' : st === 'ONLINE' ? 'Active' : 'Offline'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sessions List */}
        {displayedSessions.length === 0 ? (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-8 text-center space-y-2">
            <AlertCircle className="w-7 h-7 text-slate-500 mx-auto" />
            <div className="text-sm font-bold text-slate-300">
              No matching device sessions found
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Open this POS software on another laptop, PC, or mobile phone and log in with the same user profile to see it listed here in real time.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {displayedSessions.map((session) => {
              const isSelf = session.deviceId === currentDeviceId;
              const effectiveStatus = DeviceSessionService.getComputedStatus(session);
              const screenLabel =
                SCREEN_LABELS[session.activeScreen || 'direct-billing'] ||
                session.activeScreen ||
                'Direct Billing';

              return (
                <div
                  key={session.id}
                  className={`rounded-xl p-4 border transition-all flex flex-col justify-between gap-3 ${
                    isSelf
                      ? 'bg-emerald-950/20 border-emerald-500/50'
                      : effectiveStatus === 'ONLINE'
                      ? 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      : 'bg-slate-950/60 border-slate-800/70 opacity-85'
                  }`}
                >
                  <div className="space-y-2.5">
                    {/* Top Row: Icon, Name, Status Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`p-2.5 rounded-xl border shrink-0 ${
                            isSelf
                              ? 'bg-emerald-500/15 border-emerald-500/30'
                              : 'bg-slate-900 border-slate-800'
                          }`}
                        >
                          {renderDeviceIcon(session.deviceType, isSelf)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-extrabold text-sm text-white truncate">
                              {session.deviceName}
                            </span>
                            {isSelf && (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-extrabold uppercase">
                                This Device
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono truncate">
                            ID: {session.deviceId} • {session.osBrowserLabel}
                          </div>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 shrink-0 border ${
                          effectiveStatus === 'ONLINE'
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : effectiveStatus === 'IDLE'
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            : effectiveStatus === 'REVOKED'
                            ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            effectiveStatus === 'ONLINE'
                              ? 'bg-emerald-400 animate-pulse'
                              : effectiveStatus === 'IDLE'
                              ? 'bg-amber-400'
                              : effectiveStatus === 'REVOKED'
                              ? 'bg-rose-400'
                              : 'bg-slate-500'
                          }`}
                        />
                        {effectiveStatus === 'ONLINE'
                          ? 'Active Now'
                          : effectiveStatus === 'IDLE'
                          ? 'Idle'
                          : effectiveStatus === 'REVOKED'
                          ? 'Signed Out'
                          : 'Offline'}
                      </span>
                    </div>

                    {/* Metadata Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                          session.isPrimaryPrintServer
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            : 'bg-slate-900 text-slate-300 border-slate-800'
                        }`}
                      >
                        {session.isPrimaryPrintServer ? '🖨️ Print Server ON' : '📲 Remote Print Mode'}
                      </span>

                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-900 text-emerald-300 border border-slate-800">
                        Screen: {screenLabel}
                      </span>

                      <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-slate-900 text-slate-400 border border-slate-800">
                        {session.userName} ({session.userRole})
                      </span>
                    </div>

                    {/* Timestamps */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>Last seen: </span>
                        <strong className="text-slate-200">
                          {isSelf ? 'Right now' : formatRelativeTime(session.lastActiveAt)}
                        </strong>
                      </div>
                      <div className="text-right truncate font-mono text-[10px] text-slate-400">
                        Login: {formatDateTime(session.loginAt)}
                      </div>
                    </div>
                  </div>

                  {/* Remote Session Actions (for other devices) */}
                  {!isSelf && (
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
                      {effectiveStatus !== 'REVOKED' && effectiveStatus !== 'OFFLINE' && (
                        <button
                          type="button"
                          onClick={() => handleRevokeSession(session)}
                          className="px-3 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-200 border border-rose-500/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <LogOut className="w-3.5 h-3.5 text-rose-400" />
                          <span>End Session</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveSession(session)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>Remove</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. MULTI-DEVICE SYNC & SECURITY INFO */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5 mb-3">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <h4 className="font-bold text-xs sm:text-sm text-white uppercase tracking-wider">
            How Multi-Device POS Sessions Work
          </h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-300">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1">
            <div className="font-bold text-white">1. Shared User Profile Sync</div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Every laptop, desktop, or phone logged into the same Firestore user profile syncs bills, KOTs, menu rates, and inventory in real time.
            </p>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1">
            <div className="font-bold text-white">2. Atomic Bill &amp; KOT Sequence</div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              When two devices bill simultaneously, Firestore transactions assign sequential Bill (#01, #02) and KOT numbers without duplicates.
            </p>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1">
            <div className="font-bold text-white">3. Remote Session Control</div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Click <strong>End Session</strong> on any other device card above to remotely sign out that device from your profile immediately.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
