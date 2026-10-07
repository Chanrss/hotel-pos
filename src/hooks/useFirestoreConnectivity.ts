import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, onSnapshot, getDocFromServer, enableNetwork, disableNetwork } from 'firebase/firestore';
import { db } from '../services/firebase';

export type ConnectivityState = 
  | 'online-synced'        // Connected to Cloud Firestore, live sync active
  | 'offline-persistence'  // Operating in offline persistence mode (IndexedDB cache)
  | 'syncing'              // Syncing pending local writes to Cloud Firestore
  | 'connecting';          // Verifying connection

export interface FirestoreConnectivityInfo {
  state: ConnectivityState;
  isOnline: boolean;             // Physical network connection (navigator.onLine)
  isFromCache: boolean;          // Firestore snapshot is being served from local cache
  hasPendingWrites: boolean;     // Local mutations queued for Cloud Firestore sync
  lastSyncTime: Date | null;     // Timestamp of last verified Cloud sync
  latencyMs: number | null;      // Latency in milliseconds from last server check
  isSimulatedOffline: boolean;   // Whether offline mode was manually triggered
  errorMessage: string | null;   // Error details if connection test failed
  isTestingConnection: boolean;  // Loading indicator for active connection ping
  testConnection: () => Promise<{ success: boolean; latencyMs?: number; error?: string }>;
  reconnect: () => Promise<void>;
  toggleSimulatedOffline: () => Promise<void>;
}

export function useFirestoreConnectivity(): FirestoreConnectivityInfo {
  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isFromCache, setIsFromCache] = useState<boolean>(false);
  const [hasPendingWrites, setHasPendingWrites] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [isSimulatedOffline, setIsSimulatedOffline] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);
  const [isInitialCheckDone, setIsInitialCheckDone] = useState<boolean>(false);

  // Derive state based on connectivity telemetry
  let state: ConnectivityState = 'connecting';
  if (!isInitialCheckDone) {
    state = 'connecting';
  } else if (!isOnline || isFromCache || isSimulatedOffline) {
    state = 'offline-persistence';
  } else if (hasPendingWrites) {
    state = 'syncing';
  } else {
    state = 'online-synced';
  }

  // Test server connectivity with getDocFromServer
  const testConnection = useCallback(async (): Promise<{ success: boolean; latencyMs?: number; error?: string }> => {
    setIsTestingConnection(true);
    setErrorMessage(null);
    const start = performance.now();

    try {
      if (isSimulatedOffline) {
        throw new Error('Firestore network is manually disabled in simulated offline mode.');
      }

      // Query test connection doc directly from Cloud Firestore server
      await getDocFromServer(doc(db, 'test', 'connection'));
      const duration = Math.round(performance.now() - start);
      setLatencyMs(duration);
      setLastSyncTime(new Date());
      setIsFromCache(false);
      setErrorMessage(null);
      setIsTestingConnection(false);
      return { success: true, latencyMs: duration };
    } catch (err: any) {
      const duration = Math.round(performance.now() - start);
      const msg = err?.message || 'Unable to establish server connection';
      
      // If error indicates doc not found, server was still contacted successfully!
      if (err?.code === 'not-found' || msg.includes('not found')) {
        setLatencyMs(duration);
        setLastSyncTime(new Date());
        setIsFromCache(false);
        setErrorMessage(null);
        setIsTestingConnection(false);
        return { success: true, latencyMs: duration };
      }

      console.debug('Firestore connectivity test notice:', msg);
      setLatencyMs(null);
      setErrorMessage(msg);
      setIsTestingConnection(false);
      return { success: false, error: msg };
    }
  }, [isSimulatedOffline]);

  // Force reconnect to Firestore network
  const reconnect = useCallback(async () => {
    try {
      setIsTestingConnection(true);
      await enableNetwork(db);
      setIsSimulatedOffline(false);
      await testConnection();
    } catch (err: any) {
      console.warn('Firestore enableNetwork notice:', err);
    } finally {
      setIsTestingConnection(false);
    }
  }, [testConnection]);

  // Toggle simulated offline persistence mode
  const toggleSimulatedOffline = useCallback(async () => {
    try {
      if (isSimulatedOffline) {
        await enableNetwork(db);
        setIsSimulatedOffline(false);
        await testConnection();
      } else {
        await disableNetwork(db);
        setIsSimulatedOffline(true);
        setIsFromCache(true);
      }
    } catch (err: any) {
      console.warn('Firestore toggle simulated offline notice:', err);
    }
  }, [isSimulatedOffline, testConnection]);

  // Monitor physical network events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (!isSimulatedOffline) {
        enableNetwork(db).catch(() => {});
        testConnection();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsFromCache(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isSimulatedOffline, testConnection]);

  // Real-time metadata listener for snapshot cache / server sync state
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let isMounted = true;

    try {
      const docRef = doc(db, 'settings', 'restaurant');
      unsubscribe = onSnapshot(
        docRef,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (!isMounted) return;
          const fromCache = snapshot.metadata.fromCache;
          const pendingWrites = snapshot.metadata.hasPendingWrites;

          setIsFromCache(fromCache);
          setHasPendingWrites(pendingWrites);

          if (!fromCache) {
            setLastSyncTime(new Date());
          }
          setIsInitialCheckDone(true);
        },
        (error) => {
          if (!isMounted) return;
          console.debug('Firestore connectivity metadata listener note:', error?.message);
          setIsFromCache(true);
          setIsInitialCheckDone(true);
        }
      );
    } catch (err) {
      console.debug('Firestore listener registration note:', err);
      setIsInitialCheckDone(true);
    }

    // Run initial server test on boot
    testConnection().finally(() => {
      if (isMounted) {
        setIsInitialCheckDone(true);
      }
    });

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [testConnection]);

  return {
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
  };
}
