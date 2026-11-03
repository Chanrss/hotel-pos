import { collection, doc, getDocs, limit, orderBy, query, setDoc } from 'firebase/firestore';
import { db, getDeviceId, sanitizeForFirestore } from './firebase';
import { AppUser, SecurityAuditEventType, SecurityAuditLogEntry } from '../types';

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const ACCOUNT_LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes lockout
const PIN_HASH_SALT_PREFIX = 'SSB_KALLAKURICHI_POS_V1_SALT';

export type PosSecurityFeature =
  | 'BILLING'
  | 'KOT'
  | 'RUNNING_KOTS'
  | 'MENU_MANAGEMENT'
  | 'PRICE_MODIFICATION'
  | 'REPORTS'
  | 'DAILY_SALES_BACKUP'
  | 'USER_MANAGEMENT'
  | 'SECURITY_SETTINGS';

interface RateLimitState {
  username: string;
  failedAttempts: number;
  lastFailedAt: number;
  lockedUntil: number;
}

const inMemoryRateLimits = new Map<string, RateLimitState>();
const inMemoryAuditLogs: SecurityAuditLogEntry[] = [];

function withCloudTimeout<T>(promise: Promise<T>, timeoutMs = 800): Promise<T> {
  const isTestEnv =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.MODE === 'test') ||
    (typeof process !== 'undefined' && Boolean(process.env?.VITEST));
  const effectiveTimeout = isTestEnv ? 30 : timeoutMs;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Cloud operation timeout')), effectiveTimeout);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Pure TypeScript SHA-256 implementation (FIPS 180-4) so PIN hashing is
 * deterministic, synchronous, and works identically in Browser, Node, and Vitest.
 */
function sha256Hex(ascii: string): string {
  const rightRotate = (value: number, amount: number) =>
    (value >>> amount) | (value << (32 - amount));

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  let hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, number> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    if (j >> 8) continue;
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];

      const a = hash[0];
      const e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
      hash.pop();
    }

    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? 0 : '') + b.toString(16);
    }
  }
  return result;
}

/**
 * Formats a timestamp in Asia/Kolkata timezone (DD-MM-YYYY hh:mm:ss AM/PM IST)
 */
export function formatISTTimestamp(timestampMs: number = Date.now()): string {
  try {
    const d = new Date(timestampMs);
    const parts = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).formatToParts(d);

    const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
    const dd = get('day').padStart(2, '0');
    const mm = get('month').padStart(2, '0');
    const yyyy = get('year');
    const hh = get('hour').padStart(2, '0');
    const min = get('minute').padStart(2, '0');
    const sec = get('second').padStart(2, '0');
    const dayPeriod = get('dayPeriod').toUpperCase();
    return `${dd}-${mm}-${yyyy} ${hh}:${min}:${sec} ${dayPeriod} IST`;
  } catch {
    return new Date(timestampMs).toISOString();
  }
}

/**
 * Deterministically hashes a staff PIN using salted SHA-256 so plain-text PINs
 * are never stored in browser storage, state, or database documents.
 */
export function hashPin(pin: string, username?: string): string {
  const cleanPin = String(pin || '').trim();
  const normalizedUser = String(username || 'staff').trim().toLowerCase();
  const payload = `${PIN_HASH_SALT_PREFIX}:${normalizedUser}:${cleanPin}`;
  return `sha256$${sha256Hex(payload)}`;
}

/**
 * Verifies a candidate PIN against a user's stored pinHash (or legacy plain pin during migration).
 */
export function verifyUserPin(
  candidatePin: string,
  user: { pinHash?: string; pin?: string; username?: string; uid?: string }
): boolean {
  const cleanCandidate = String(candidatePin || '').trim();
  if (!cleanCandidate) return false;

  const username = (user.username || user.uid?.replace(/^user_/, '') || 'staff').toLowerCase();
  const expectedSaltedHash = hashPin(cleanCandidate, username);
  const genericSaltedHash = hashPin(cleanCandidate, 'staff');

  if (user.pinHash) {
    if (user.pinHash === expectedSaltedHash || user.pinHash === genericSaltedHash) {
      return true;
    }
  }

  // Legacy migration support if an existing Firestore record still had a plain pin field
  if (user.pin && typeof user.pin === 'string') {
    if (user.pin.startsWith('sha256$')) {
      return user.pin === expectedSaltedHash || user.pin === genericSaltedHash;
    }
    return user.pin.trim() === cleanCandidate;
  }

  return false;
}

/**
 * Strips plain-text `pin` from an AppUser object and ensures `pinHash` is populated.
 * Guarantees PINs are never persisted in localStorage, sessionStorage, or plain text.
 */
export function sanitizeUserForStorage(user: AppUser, plainPinIfUpdating?: string): AppUser {
  const username = (user.username || user.uid?.replace(/^user_/, '') || 'staff').toLowerCase();
  const rawPinToHash = plainPinIfUpdating || (user.pin && !user.pin.startsWith('sha256$') ? user.pin : undefined);
  const resolvedHash = rawPinToHash
    ? hashPin(rawPinToHash, username)
    : user.pinHash || (user.pin?.startsWith('sha256$') ? user.pin : undefined);

  const clone: AppUser = {
    ...user,
    pinHash: resolvedHash
  };
  delete clone.pin;
  return clone;
}

/**
 * Purges any previously saved login session or plain-text PINs from localStorage and sessionStorage.
 * Enforces Requirement 1:
 * - Every time the POS application is opened or restarted, the user must log in.
 * - Do not automatically log in using previously saved credentials.
 * - Do not remember the previous login session after the application is closed or restarted.
 * - Do not store PINs in local storage, browser storage or plain text.
 */
export function purgePersistedLoginSession(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('pos_logged_in_user');
      localStorage.removeItem('pos_demo_role');
      localStorage.removeItem('pos_auth_session');
      localStorage.removeItem('pos_remembered_pin');
      localStorage.setItem('pos_logged_out', 'true');

      // Sanitize pos_local_users so no plain-text PIN ever remains in localStorage
      const rawLocalUsers = localStorage.getItem('pos_local_users');
      if (rawLocalUsers) {
        try {
          const parsed = JSON.parse(rawLocalUsers);
          if (Array.isArray(parsed)) {
            const sanitized = parsed.map((u: AppUser) => sanitizeUserForStorage(u));
            localStorage.setItem('pos_local_users', JSON.stringify(sanitized));
          }
        } catch {
          localStorage.removeItem('pos_local_users');
        }
      }
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('pos_logged_in_user');
      sessionStorage.removeItem('pos_auth_session');
      sessionStorage.removeItem('pos_remembered_pin');
    }
  } catch {
    // Ignore storage access errors in restricted environments
  }
}

/**
 * Checks whether a username is currently locked out due to repeated failed PIN attempts.
 */
export function checkAccountLockout(
  username: string,
  nowMs: number = Date.now()
): {
  isLocked: boolean;
  failedAttempts: number;
  remainingAttempts: number;
  remainingMs: number;
  remainingSeconds: number;
  lockedUntil?: number;
} {
  const key = String(username || '').trim().toLowerCase();
  if (!key) {
    return {
      isLocked: false,
      failedAttempts: 0,
      remainingAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
      remainingMs: 0,
      remainingSeconds: 0
    };
  }

  const state = inMemoryRateLimits.get(key);
  if (!state) {
    return {
      isLocked: false,
      failedAttempts: 0,
      remainingAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
      remainingMs: 0,
      remainingSeconds: 0
    };
  }

  if (state.lockedUntil > nowMs) {
    const remainingMs = state.lockedUntil - nowMs;
    return {
      isLocked: true,
      failedAttempts: state.failedAttempts,
      remainingAttempts: 0,
      remainingMs,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      lockedUntil: state.lockedUntil
    };
  }

  // If previous lockout window has expired, reset counter
  if (state.lockedUntil > 0 && state.lockedUntil <= nowMs) {
    inMemoryRateLimits.delete(key);
    return {
      isLocked: false,
      failedAttempts: 0,
      remainingAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
      remainingMs: 0,
      remainingSeconds: 0
    };
  }

  return {
    isLocked: false,
    failedAttempts: state.failedAttempts,
    remainingAttempts: Math.max(0, MAX_FAILED_LOGIN_ATTEMPTS - state.failedAttempts),
    remainingMs: 0,
    remainingSeconds: 0
  };
}

/**
 * Records a failed PIN verification attempt and enforces temporary account lockout
 * after MAX_FAILED_LOGIN_ATTEMPTS consecutive failures.
 */
export async function recordFailedPinAttempt(
  username: string,
  nowMs: number = Date.now()
): Promise<{
  isLocked: boolean;
  failedAttempts: number;
  remainingAttempts: number;
  remainingSeconds: number;
  lockedUntil?: number;
}> {
  const key = String(username || '').trim().toLowerCase();
  const current = inMemoryRateLimits.get(key);

  const nextAttempts =
    current && (current.lockedUntil === 0 || current.lockedUntil <= nowMs)
      ? current.failedAttempts + 1
      : 1;

  const isLocked = nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
  const lockedUntil = isLocked ? nowMs + ACCOUNT_LOCKOUT_DURATION_MS : 0;

  const updated: RateLimitState = {
    username: key,
    failedAttempts: nextAttempts,
    lastFailedAt: nowMs,
    lockedUntil
  };
  inMemoryRateLimits.set(key, updated);

  // Sync rate limit state to Firestore for multi-terminal lockout enforcement
  try {
    await withCloudTimeout(
      setDoc(
        doc(db, 'login_rate_limits', key),
        sanitizeForFirestore({
          ...updated,
          updatedAt: nowMs
        }),
        { merge: true }
      )
    );
  } catch {
    // Offline fallback handled via inMemoryRateLimits
  }

  if (isLocked) {
    await recordSecurityAuditLog({
      eventType: 'ACCOUNT_LOCKOUT',
      username: key,
      status: 'BLOCKED',
      details: `Account "@${key}" temporarily locked for 5 minutes after ${nextAttempts} consecutive incorrect PIN attempts.`
    });
  } else {
    await recordSecurityAuditLog({
      eventType: 'LOGIN_FAILED',
      username: key,
      status: 'FAILED',
      details: `Failed PIN verification attempt (${nextAttempts}/${MAX_FAILED_LOGIN_ATTEMPTS}) for username "@${key}".`
    });
  }

  return {
    isLocked,
    failedAttempts: nextAttempts,
    remainingAttempts: Math.max(0, MAX_FAILED_LOGIN_ATTEMPTS - nextAttempts),
    remainingSeconds: isLocked ? Math.ceil(ACCOUNT_LOCKOUT_DURATION_MS / 1000) : 0,
    lockedUntil: isLocked ? lockedUntil : undefined
  };
}

/**
 * Resets failed login attempt counter upon successful authentication.
 */
export async function clearFailedPinAttempts(username: string): Promise<void> {
  const key = String(username || '').trim().toLowerCase();
  if (!key) return;
  inMemoryRateLimits.delete(key);
  try {
    await withCloudTimeout(
      setDoc(
        doc(db, 'login_rate_limits', key),
        {
          username: key,
          failedAttempts: 0,
          lockedUntil: 0,
          updatedAt: Date.now()
        },
        { merge: true }
      )
    );
  } catch {
    // Ignore offline error
  }
}

/**
 * Classifies a user into OWNER, STORE_MANAGER, WAITER, or UNAUTHENTICATED.
 */
export function getRoleClassification(
  user: AppUser | null | undefined
): 'OWNER' | 'STORE_MANAGER' | 'WAITER' | 'UNAUTHENTICATED' {
  if (!user || user.active === false) return 'UNAUTHENTICATED';
  const role = (user.roleId || '').toLowerCase();
  if (role === 'owner' || role === 'admin' || Boolean(user.fullAccess)) {
    return 'OWNER';
  }
  if (role === 'manager' || role === 'store_manager') {
    return 'STORE_MANAGER';
  }
  return 'WAITER';
}

/**
 * Verifies role-based access control (RBAC) for Owner vs Store Manager:
 * - OWNER LOGIN: Full access to Billing, Menu Management, Reports, Running KOTs,
 *   Daily Sales Backup, User Management, and Security Settings.
 * - STORE MANAGER LOGIN: Access to KOT creation & management, Billing, Menu Management
 *   and price modification, Reports, and Daily Sales Backup. No access to Owner-only
 *   User Management or Security Settings.
 */
export function canAccessFeature(
  user: AppUser | null | undefined,
  feature: PosSecurityFeature
): boolean {
  const classification = getRoleClassification(user);
  if (classification === 'UNAUTHENTICATED') return false;

  if (classification === 'OWNER') {
    return true;
  }

  if (classification === 'STORE_MANAGER') {
    switch (feature) {
      case 'BILLING':
      case 'KOT':
      case 'RUNNING_KOTS':
      case 'MENU_MANAGEMENT':
      case 'PRICE_MODIFICATION':
      case 'REPORTS':
      case 'DAILY_SALES_BACKUP':
        return true;
      case 'USER_MANAGEMENT':
      case 'SECURITY_SETTINGS':
        return false;
    }
  }

  // WAITER
  switch (feature) {
    case 'KOT':
    case 'RUNNING_KOTS':
    case 'BILLING':
      return true;
    default:
      return false;
  }
}

/**
 * Backend/service-layer guard that enforces RBAC permissions before executing protected operations.
 */
export async function assertAuthorizedForFeature(
  user: AppUser | null | undefined,
  feature: PosSecurityFeature,
  actionDescription: string
): Promise<void> {
  if (!user) {
    await recordSecurityAuditLog({
      eventType: 'UNAUTHORIZED_ACCESS_BLOCKED',
      username: 'anonymous',
      status: 'BLOCKED',
      details: `Blocked unauthenticated attempt to perform: ${actionDescription} (${feature})`
    });
    throw new Error('Authentication required. Please log in with your Username and PIN.');
  }

  if (!canAccessFeature(user, feature)) {
    await recordSecurityAuditLog({
      eventType: 'UNAUTHORIZED_ACCESS_BLOCKED',
      username: user.username || user.name || user.uid,
      userId: user.uid,
      role: user.roleId,
      status: 'BLOCKED',
      details: `Blocked unauthorized role (${user.roleId.toUpperCase()}) from performing: ${actionDescription} (${feature})`
    });
    throw new Error(`Access Denied: Only the Owner account has permission to access ${feature.replace(/_/g, ' ')}.`);
  }
}

/**
 * Records a security audit log entry in Firestore (`security_audit_logs` & `audit_logs`)
 * for login attempts, lockouts, report downloads, backup runs, and critical data changes.
 */
export async function recordSecurityAuditLog(params: {
  eventType: SecurityAuditEventType;
  username: string;
  userId?: string;
  role?: string;
  status: 'SUCCESS' | 'FAILED' | 'BLOCKED' | 'WARNING';
  details: string;
  metadata?: Record<string, any>;
}): Promise<SecurityAuditLogEntry> {
  const now = Date.now();
  const entry: SecurityAuditLogEntry = {
    id: `sec_${now}_${Math.random().toString(36).substring(2, 8)}`,
    eventType: params.eventType,
    username: params.username || 'unknown',
    userId: params.userId,
    role: params.role,
    status: params.status,
    details: params.details,
    timestamp: now,
    formattedTimeIST: formatISTTimestamp(now),
    deviceId: getDeviceId(),
    metadata: params.metadata
  };

  inMemoryAuditLogs.unshift(entry);
  if (inMemoryAuditLogs.length > 200) {
    inMemoryAuditLogs.length = 200;
  }

  try {
    await withCloudTimeout(
      setDoc(doc(db, 'security_audit_logs', entry.id), sanitizeForFirestore(entry))
    );
  } catch {
    // Offline fallback retained in inMemoryAuditLogs
  }

  return entry;
}

/**
 * Fetches recent security audit logs from Firestore merged with in-memory logs.
 */
export async function fetchSecurityAuditLogs(maxEntries = 50): Promise<SecurityAuditLogEntry[]> {
  const mergedMap = new Map<string, SecurityAuditLogEntry>();
  inMemoryAuditLogs.forEach((e) => mergedMap.set(e.id, e));

  try {
    const q = query(
      collection(db, 'security_audit_logs'),
      orderBy('timestamp', 'desc'),
      limit(maxEntries)
    );
    const snap = await withCloudTimeout(getDocs(q));
    snap.forEach((d) => {
      const data = d.data() as SecurityAuditLogEntry;
      mergedMap.set(d.id, { ...data, id: d.id });
    });
  } catch {
    // Use in-memory logs when offline
  }

  return Array.from(mergedMap.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, maxEntries);
}
