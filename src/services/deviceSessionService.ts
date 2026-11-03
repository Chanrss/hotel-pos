import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  getDoc
} from 'firebase/firestore';
import { db, getDeviceId, sanitizeForFirestore } from './firebase';
import { AppUser, UserDeviceSession } from '../types';
import { RemotePrintQueueService } from './remotePrintQueueService';

const CUSTOM_DEVICE_NAME_KEY = 'pos_custom_device_name';
const LOCAL_SESSIONS_CACHE_KEY = 'pos_local_user_sessions_v1';
const SESSION_LOGIN_TIME_KEY = 'pos_current_session_login_at';
const BROADCAST_CHANNEL_NAME = 'pos_device_sessions_sync';

export class DeviceSessionService {
  private static heartbeatTimer: number | null = null;
  private static currentActiveScreen: string = 'direct-billing';
  private static broadcastChannel: BroadcastChannel | null = null;

  private static getBroadcastChannel(): BroadcastChannel | null {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
    if (!this.broadcastChannel) {
      try {
        this.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      } catch (_) {
        this.broadcastChannel = null;
      }
    }
    return this.broadcastChannel;
  }

  /**
   * Detect whether this device is desktop, tablet, or mobile.
   */
  static getDeviceType(): 'desktop' | 'mobile' | 'tablet' {
    if (typeof window === 'undefined') return 'desktop';
    const ua = navigator.userAgent || '';
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
      return 'tablet';
    }
    if (
      /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
      window.innerWidth < 640
    ) {
      return 'mobile';
    }
    if (window.innerWidth >= 640 && window.innerWidth < 1024 && 'ontouchstart' in window) {
      return 'tablet';
    }
    return 'desktop';
  }

  /**
   * Friendly OS + Browser string (e.g., "Windows PC · Chrome", "Android Mobile · Chrome", "iPhone · Safari")
   */
  static getOsBrowserLabel(): string {
    if (typeof window === 'undefined') return 'POS Terminal · Browser';
    const ua = navigator.userAgent || '';

    let os = 'Desktop OS';
    if (/Windows/i.test(ua)) os = 'Windows PC';
    else if (/Android/i.test(ua)) os = 'Android Mobile';
    else if (/iPhone/i.test(ua)) os = 'iPhone iOS';
    else if (/iPad/i.test(ua)) os = 'iPadOS';
    else if (/Macintosh|Mac OS X/i.test(ua)) os = 'Mac';
    else if (/CrOS/i.test(ua)) os = 'ChromeOS';
    else if (/Linux/i.test(ua)) os = 'Linux PC';

    let browser = 'Browser';
    if (/Edg\//i.test(ua)) browser = 'Edge';
    else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
    else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
    else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
    else if (/Firefox\//i.test(ua)) browser = 'Firefox';

    return `${os} · ${browser}`;
  }

  /**
   * Get custom or default human-readable device name.
   */
  static getDeviceName(): string {
    if (typeof window === 'undefined') return 'Counter POS Terminal';
    try {
      const saved = localStorage.getItem(CUSTOM_DEVICE_NAME_KEY);
      if (saved && saved.trim()) return saved.trim();
    } catch (_) {}

    const type = this.getDeviceType();
    const isPrimary = RemotePrintQueueService.isPrimaryPrintServer();
    if (type === 'mobile') return 'Waiter Mobile POS';
    if (type === 'tablet') return 'Floor Tablet POS';
    return isPrimary ? 'Main Counter POS PC' : 'Secondary Billing PC';
  }

  static setCustomDeviceName(name: string): void {
    if (typeof window === 'undefined') return;
    const trimmed = name.trim();
    try {
      if (trimmed) {
        localStorage.setItem(CUSTOM_DEVICE_NAME_KEY, trimmed);
      } else {
        localStorage.removeItem(CUSTOM_DEVICE_NAME_KEY);
      }
    } catch (_) {}
  }

  static getSessionId(userId: string, deviceId: string = getDeviceId()): string {
    const safeUid = String(userId || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeDev = String(deviceId || 'dev').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${safeUid}_${safeDev}`;
  }

  static getLocalSessionsMap(): Record<string, UserDeviceSession> {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(LOCAL_SESSIONS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (_) {}
    return {};
  }

  private static saveLocalSession(session: UserDeviceSession): void {
    if (typeof window === 'undefined') return;
    try {
      const map = this.getLocalSessionsMap();
      map[session.id] = session;
      localStorage.setItem(LOCAL_SESSIONS_CACHE_KEY, JSON.stringify(map));
      window.dispatchEvent(new CustomEvent('pos_device_sessions_updated'));
      this.getBroadcastChannel()?.postMessage({ type: 'SESSION_UPSERT', session });
    } catch (_) {}
  }

  private static removeLocalSession(sessionId: string): void {
    if (typeof window === 'undefined') return;
    try {
      const map = this.getLocalSessionsMap();
      delete map[sessionId];
      localStorage.setItem(LOCAL_SESSIONS_CACHE_KEY, JSON.stringify(map));
      window.dispatchEvent(new CustomEvent('pos_device_sessions_updated'));
      this.getBroadcastChannel()?.postMessage({ type: 'SESSION_REMOVE', sessionId });
    } catch (_) {}
  }

  /**
   * Build the UserDeviceSession payload for the current device and logged-in user.
   */
  static buildCurrentSessionPayload(
    user: AppUser,
    overrides?: Partial<UserDeviceSession>
  ): UserDeviceSession {
    const now = Date.now();
    const deviceId = getDeviceId();
    const sessionId = this.getSessionId(user.uid, deviceId);

    let loginAt = now;
    try {
      const storedLogin = sessionStorage.getItem(SESSION_LOGIN_TIME_KEY);
      if (storedLogin && !Number.isNaN(Number(storedLogin))) {
        loginAt = Number(storedLogin);
      } else {
        sessionStorage.setItem(SESSION_LOGIN_TIME_KEY, String(now));
      }
    } catch (_) {}

    const viewportSize =
      typeof window !== 'undefined' ? `${window.innerWidth}×${window.innerHeight}` : '1280×800';

    return {
      id: sessionId,
      userId: user.uid,
      userName: user.name || 'Owner',
      userEmail: user.email || `${user.roleId || 'owner'}@hotelpos.local`,
      username: user.username || user.roleId || 'owner',
      userRole: (user.roleId || 'owner').toUpperCase(),
      deviceId,
      deviceName: this.getDeviceName(),
      osBrowserLabel: this.getOsBrowserLabel(),
      deviceType: this.getDeviceType(),
      isPrimaryPrintServer: RemotePrintQueueService.isPrimaryPrintServer(),
      status: 'ONLINE',
      activeScreen: this.currentActiveScreen,
      viewportSize,
      loginAt,
      lastActiveAt: now,
      updatedAt: now,
      ...overrides
    };
  }

  /**
   * Persist session to Firestore (`user_sessions/{sessionId}`) and also mirror inside
   * `settings/device_sessions` as a universal multi-device fallback in case `user_sessions`
   * rules haven't been re-deployed yet.
   */
  static async syncSessionToCloud(session: UserDeviceSession): Promise<void> {
    this.saveLocalSession(session);
    const clean = sanitizeForFirestore(session);

    try {
      await setDoc(doc(db, 'user_sessions', session.id), clean, { merge: true });
    } catch (_) {
      // Fallback: mirror inside settings/device_sessions document which is allowed under /settings/{docId}
      try {
        await setDoc(
          doc(db, 'settings', 'device_sessions'),
          {
            sessions: {
              [session.id]: clean
            },
            updatedAt: Date.now()
          },
          { merge: true }
        );
      } catch (_) {}
    }

    // Also mirror in settings/device_sessions so all devices logged into the restaurant see instant updates
    try {
      await setDoc(
        doc(db, 'settings', 'device_sessions'),
        {
          sessions: {
            [session.id]: clean
          },
          updatedAt: Date.now()
        },
        { merge: true }
      );
    } catch (_) {}
  }

  /**
   * Start real-time heartbeat for the currently logged-in user profile on this device.
   */
  static startSessionHeartbeat(
    user: AppUser,
    activeScreen: string,
    onRemoteRevoke?: () => void
  ): () => void {
    this.currentActiveScreen = activeScreen;
    const initialSession = this.buildCurrentSessionPayload(user, { activeScreen });
    void this.syncSessionToCloud(initialSession);

    // Periodic heartbeat every 25 seconds
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer);
    }
    this.heartbeatTimer = window.setInterval(() => {
      const updated = this.buildCurrentSessionPayload(user, {
        activeScreen: this.currentActiveScreen,
        status: document.visibilityState === 'hidden' ? 'IDLE' : 'ONLINE'
      });
      void this.syncSessionToCloud(updated);
    }, 25000);

    // Update when print server role changes
    const handleRoleChange = () => {
      const updated = this.buildCurrentSessionPayload(user, {
        activeScreen: this.currentActiveScreen
      });
      void this.syncSessionToCloud(updated);
    };

    const handleVisibilityChange = () => {
      const updated = this.buildCurrentSessionPayload(user, {
        activeScreen: this.currentActiveScreen,
        status: document.visibilityState === 'hidden' ? 'IDLE' : 'ONLINE'
      });
      void this.syncSessionToCloud(updated);
    };

    window.addEventListener('pos_print_server_role_changed', handleRoleChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Listen for remote session revocation on `user_sessions/{sessionId}` and `settings/device_sessions`
    const sessionId = initialSession.id;
    let unsubSessionDoc: (() => void) | null = null;
    let unsubFallbackDoc: (() => void) | null = null;

    try {
      unsubSessionDoc = onSnapshot(
        doc(db, 'user_sessions', sessionId),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as UserDeviceSession;
            if (data.status === 'REVOKED' && onRemoteRevoke) {
              onRemoteRevoke();
            }
          }
        },
        () => {}
      );
    } catch (_) {}

    try {
      unsubFallbackDoc = onSnapshot(
        doc(db, 'settings', 'device_sessions'),
        (snap) => {
          if (snap.exists()) {
            const raw = snap.data();
            const myRecord = raw?.sessions?.[sessionId] as UserDeviceSession | undefined;
            if (myRecord?.status === 'REVOKED' && onRemoteRevoke) {
              onRemoteRevoke();
            }
          }
        },
        () => {}
      );
    } catch (_) {}

    return () => {
      if (this.heartbeatTimer) {
        window.clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      window.removeEventListener('pos_print_server_role_changed', handleRoleChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (unsubSessionDoc) unsubSessionDoc();
      if (unsubFallbackDoc) unsubFallbackDoc();
    };
  }

  /**
   * Update active screen immediately when the user switches tabs.
   */
  static updateActiveScreen(user: AppUser | null, screen: string): void {
    this.currentActiveScreen = screen;
    if (!user) return;
    const updated = this.buildCurrentSessionPayload(user, { activeScreen: screen });
    void this.syncSessionToCloud(updated);
  }

  /**
   * Rename the current device and broadcast immediately to Firestore.
   */
  static async renameCurrentDevice(newName: string, user: AppUser): Promise<UserDeviceSession> {
    this.setCustomDeviceName(newName);
    const updated = this.buildCurrentSessionPayload(user, {
      deviceName: this.getDeviceName()
    });
    await this.syncSessionToCloud(updated);
    return updated;
  }

  /**
   * Mark current device session as OFFLINE when user logs out.
   */
  static async markCurrentSessionOffline(user: AppUser | null): Promise<void> {
    if (!user) return;
    const sessionId = this.getSessionId(user.uid, getDeviceId());
    const now = Date.now();
    const map = this.getLocalSessionsMap();
    if (map[sessionId]) {
      map[sessionId] = {
        ...map[sessionId],
        status: 'OFFLINE',
        lastActiveAt: now,
        updatedAt: now
      };
      this.saveLocalSession(map[sessionId]);
    }
    try {
      await updateDoc(doc(db, 'user_sessions', sessionId), {
        status: 'OFFLINE',
        lastActiveAt: now,
        updatedAt: now
      });
    } catch (_) {}
    try {
      await setDoc(
        doc(db, 'settings', 'device_sessions'),
        {
          sessions: {
            [sessionId]: {
              ...this.buildCurrentSessionPayload(user),
              status: 'OFFLINE',
              lastActiveAt: now,
              updatedAt: now
            }
          },
          updatedAt: now
        },
        { merge: true }
      );
    } catch (_) {}
  }

  /**
   * Revoke / sign out a connected device session remotely.
   */
  static async revokeSession(session: UserDeviceSession): Promise<void> {
    const now = Date.now();
    const revoked: UserDeviceSession = {
      ...session,
      status: 'REVOKED',
      updatedAt: now
    };
    this.saveLocalSession(revoked);

    try {
      await setDoc(doc(db, 'user_sessions', session.id), sanitizeForFirestore(revoked), {
        merge: true
      });
    } catch (_) {}

    try {
      await setDoc(
        doc(db, 'settings', 'device_sessions'),
        {
          sessions: {
            [session.id]: sanitizeForFirestore(revoked)
          },
          updatedAt: now
        },
        { merge: true }
      );
    } catch (_) {}
  }

  /**
   * Permanently remove a session entry from the list.
   */
  static async removeSessionRecord(sessionId: string): Promise<void> {
    this.removeLocalSession(sessionId);
    try {
      await deleteDoc(doc(db, 'user_sessions', sessionId));
    } catch (_) {}

    try {
      const snap = await getDoc(doc(db, 'settings', 'device_sessions'));
      if (snap.exists()) {
        const data = snap.data();
        const nextSessions = { ...(data?.sessions || {}) };
        delete nextSessions[sessionId];
        await setDoc(doc(db, 'settings', 'device_sessions'), {
          sessions: nextSessions,
          updatedAt: Date.now()
        });
      }
    } catch (_) {}
  }

  /**
   * Determine if a session matches the current Firestore user profile.
   */
  static isSameUserProfile(session: UserDeviceSession, user: AppUser): boolean {
    if (!session || !user) return false;
    if (session.userId === user.uid) return true;
    if (
      user.email &&
      session.userEmail &&
      session.userEmail.toLowerCase() === user.email.toLowerCase()
    ) {
      return true;
    }
    if (
      user.username &&
      session.username &&
      session.username.toLowerCase() === user.username.toLowerCase()
    ) {
      return true;
    }
    return false;
  }

  /**
   * Compute effective real-time status based on `lastActiveAt` timestamp.
   */
  static getComputedStatus(
    session: UserDeviceSession
  ): 'ONLINE' | 'IDLE' | 'OFFLINE' | 'REVOKED' {
    if (session.status === 'REVOKED') return 'REVOKED';
    if (session.status === 'OFFLINE') return 'OFFLINE';
    const elapsedMs = Date.now() - (session.lastActiveAt || 0);
    // Current device is always ONLINE while viewing
    if (session.deviceId === getDeviceId()) return 'ONLINE';
    if (elapsedMs <= 2.5 * 60 * 1000) return session.status === 'IDLE' ? 'IDLE' : 'ONLINE';
    if (elapsedMs <= 15 * 60 * 1000) return 'IDLE';
    return 'OFFLINE';
  }

  /**
   * Subscribe in real-time to all connected device sessions.
   * Combines `user_sessions` collection, `settings/device_sessions` mirror, and local cache.
   */
  static subscribeToSessions(
    user: AppUser,
    onUpdate: (sessions: UserDeviceSession[]) => void
  ): () => void {
    let collectionSessions: Record<string, UserDeviceSession> = {};
    let fallbackSessions: Record<string, UserDeviceSession> = {};

    const emitMerged = () => {
      const localMap = this.getLocalSessionsMap();
      const currentSelf = this.buildCurrentSessionPayload(user, {
        activeScreen: this.currentActiveScreen
      });

      const combined: Record<string, UserDeviceSession> = {
        ...localMap,
        ...fallbackSessions,
        ...collectionSessions,
        [currentSelf.id]: currentSelf
      };

      const list = Object.values(combined)
        .filter((s) => s && s.id && s.deviceId)
        .sort((a, b) => {
          // Put current device first, then ONLINE, then by lastActiveAt desc
          const aIsSelf = a.deviceId === getDeviceId() ? 1 : 0;
          const bIsSelf = b.deviceId === getDeviceId() ? 1 : 0;
          if (aIsSelf !== bIsSelf) return bIsSelf - aIsSelf;
          return (b.lastActiveAt || 0) - (a.lastActiveAt || 0);
        });

      onUpdate(list);
    };

    // Emit initial immediately
    emitMerged();

    let unsubCol: (() => void) | null = null;
    let unsubDoc: (() => void) | null = null;

    try {
      unsubCol = onSnapshot(
        collection(db, 'user_sessions'),
        (snap) => {
          const next: Record<string, UserDeviceSession> = {};
          snap.forEach((d) => {
            const data = d.data() as UserDeviceSession;
            if (data && data.id) {
              next[data.id] = data;
            }
          });
          collectionSessions = next;
          emitMerged();
        },
        () => {
          emitMerged();
        }
      );
    } catch (_) {}

    try {
      unsubDoc = onSnapshot(
        doc(db, 'settings', 'device_sessions'),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (data?.sessions && typeof data.sessions === 'object') {
              fallbackSessions = data.sessions as Record<string, UserDeviceSession>;
            } else {
              fallbackSessions = {};
            }
          } else {
            fallbackSessions = {};
          }
          emitMerged();
        },
        () => {
          emitMerged();
        }
      );
    } catch (_) {}

    const handleLocalUpdate = () => emitMerged();
    window.addEventListener('pos_device_sessions_updated', handleLocalUpdate);
    window.addEventListener('pos_print_server_role_changed', handleLocalUpdate);

    const bc = this.getBroadcastChannel();
    const handleBroadcast = () => emitMerged();
    bc?.addEventListener('message', handleBroadcast);

    return () => {
      if (unsubCol) unsubCol();
      if (unsubDoc) unsubDoc();
      window.removeEventListener('pos_device_sessions_updated', handleLocalUpdate);
      window.removeEventListener('pos_print_server_role_changed', handleLocalUpdate);
      bc?.removeEventListener('message', handleBroadcast);
    };
  }
}
