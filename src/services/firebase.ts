import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  initializeFirestore, 
  enableIndexedDbPersistence,
  enableNetwork,
  disableNetwork,
  setLogLevel
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { safeStorage } from '../utils/safeStorage';
import firebaseConfig from '../../firebase-applet-config.json';

// Silence benign WebChannel transport reconnection warnings (stream dropped by proxies/iframes)
try {
  setLogLevel('error');
} catch (_) {}

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with long-polling for proxy stability
let db: ReturnType<typeof getFirestore>;

const databaseId = (firebaseConfig as any).firestoreDatabaseId || undefined;

try {
  db = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
    },
    databaseId
  );
} catch (e) {
  // If already initialized, get instance with specified databaseId
  db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
}

// Enable IndexedDb persistence with forceOwnership: true for resilient local state synchronization
if (typeof window !== 'undefined' && db) {
  try {
    enableIndexedDbPersistence(db, { forceOwnership: true }).catch((err) => {
      if (err?.code === 'failed-precondition') {
        console.warn('Firestore persistence notice: Another tab is active with cache ownership');
      } else if (err?.code === 'unimplemented') {
        console.warn('Firestore persistence not supported in this browser environment');
      } else {
        console.warn('Firestore persistence initialization notice:', err?.message || err);
      }
    });
  } catch (err: any) {
    console.warn('Firestore persistence synchronous initialization notice:', err?.message || err);
  }
}

export const auth = getAuth(app);
export const storage = getStorage(app);
export { db, enableNetwork, disableNetwork };

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Operation Notice [' + operationType + ' ' + (path || '') + ']:', JSON.stringify(errInfo));
  return errInfo;
}

// Device ID management for offline transaction idempotency
export function getDeviceId(): string {
  let deviceId = safeStorage.getItem('pos_device_id');
  if (!deviceId) {
    deviceId = 'POS-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    safeStorage.setItem('pos_device_id', deviceId);
  }
  return deviceId;
}

export function generateUUID(): string {
  return 'tx_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
}

/**
 * Removes all undefined properties recursively from objects/arrays 
 * to prevent Firestore "Unsupported field value: undefined" errors.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data as Record<string, any>)) {
      if (value !== undefined) {
        cleaned[key] = sanitizeForFirestore(value);
      }
    }
    return cleaned as T;
  }
  return data;
}
