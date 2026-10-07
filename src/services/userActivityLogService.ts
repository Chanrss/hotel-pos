import { collection, doc, setDoc, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase';
import { UserActivityLog, UserActivityAction, AppUser } from '../types';

export const USER_ACTIVITY_LOGS_COLLECTION = 'user_activity_logs';
const LOCAL_STORAGE_KEY = 'pos_user_activity_logs';

export function getLocalUserActivityLogs(): UserActivityLog[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      }
    }
  } catch (e) {}
  return [];
}

function saveLocalUserActivityLog(log: UserActivityLog): UserActivityLog[] {
  const existing = getLocalUserActivityLogs();
  const updated = [log, ...existing.filter((item) => item.id !== log.id)].slice(0, 250);
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {}
  return updated;
}

export interface RecordUserActivityParams {
  action: UserActivityAction | string;
  targetUser: {
    uid: string;
    name: string;
    username?: string;
    roleId?: string;
  };
  performedBy?: AppUser | null;
  details: string;
  previousValue?: string;
  newValue?: string;
}

export async function recordUserActivityLog(params: RecordUserActivityParams): Promise<UserActivityLog> {
  const now = Date.now();
  const id = `ual_${now}_${Math.random().toString(36).substring(2, 7)}`;

  const logEntry: UserActivityLog = {
    id,
    action: params.action,
    targetUserId: params.targetUser.uid || 'unknown',
    targetUserName: params.targetUser.name || 'Staff User',
    targetUsername: params.targetUser.username || params.targetUser.uid.replace('user_', ''),
    targetRole: (params.targetUser.roleId || 'waiter').toUpperCase(),
    performedByUid: params.performedBy?.uid || 'user_admin',
    performedByName: params.performedBy?.name || 'Admin',
    performedByUsername: params.performedBy?.username || 'admin',
    details: params.details,
    ...(params.previousValue !== undefined ? { previousValue: params.previousValue } : {}),
    ...(params.newValue !== undefined ? { newValue: params.newValue } : {}),
    timestamp: now,
    createdAt: new Date(now).toISOString()
  };

  saveLocalUserActivityLog(logEntry);

  try {
    await setDoc(doc(db, USER_ACTIVITY_LOGS_COLLECTION, id), logEntry);
  } catch (err) {
    console.warn('Firestore user_activity_logs write notice (cached locally):', err);
  }

  return logEntry;
}

export function subscribeToUserActivityLogs(
  onUpdate: (logs: UserActivityLog[]) => void,
  maxEntries = 100
): () => void {
  // Immediately emit local cached logs
  onUpdate(getLocalUserActivityLogs());

  try {
    const q = query(
      collection(db, USER_ACTIVITY_LOGS_COLLECTION),
      orderBy('timestamp', 'desc'),
      limit(maxEntries)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const remoteLogs: UserActivityLog[] = [];
        snap.forEach((d) => {
          remoteLogs.push({ id: d.id, ...(d.data() as any) } as UserActivityLog);
        });

        const localLogs = getLocalUserActivityLogs();
        const mergedMap = new Map<string, UserActivityLog>();
        [...localLogs, ...remoteLogs].forEach((item) => {
          mergedMap.set(item.id, item);
        });

        const merged = Array.from(mergedMap.values())
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
          .slice(0, maxEntries);

        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
        } catch (e) {}

        onUpdate(merged);
      },
      (err) => {
        console.warn('user_activity_logs listener notice:', err?.message || err);
        onUpdate(getLocalUserActivityLogs());
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn('user_activity_logs subscription error:', err);
    return () => {};
  }
}
