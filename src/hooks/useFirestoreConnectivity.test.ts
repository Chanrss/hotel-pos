import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFirestoreConnectivity } from './useFirestoreConnectivity';
import * as firestoreModule from 'firebase/firestore';

vi.mock('../services/firebase', () => ({
  db: {}
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  getDocFromServer: vi.fn(),
  enableNetwork: vi.fn(),
  disableNetwork: vi.fn()
}));

describe('useFirestoreConnectivity Hook', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with connecting state and transitions to online-synced when server doc succeeds', async () => {
    (firestoreModule.getDocFromServer as any).mockResolvedValue({
      exists: () => true
    });

    (firestoreModule.onSnapshot as any).mockImplementation((_ref: any, _options: any, callback: any) => {
      callback({
        metadata: {
          fromCache: false,
          hasPendingWrites: false
        }
      });
      return vi.fn();
    });

    const { result } = renderHook(() => useFirestoreConnectivity());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.state).toBe('online-synced');
    expect(result.current.isFromCache).toBe(false);
    expect(result.current.hasPendingWrites).toBe(false);
    expect(result.current.latencyMs).not.toBeNull();
  });

  it('detects offline persistence mode when snapshot metadata is fromCache', async () => {
    (firestoreModule.getDocFromServer as any).mockRejectedValue(new Error('Failed to get document because the client is offline.'));

    (firestoreModule.onSnapshot as any).mockImplementation((_ref: any, _options: any, callback: any) => {
      callback({
        metadata: {
          fromCache: true,
          hasPendingWrites: true
        }
      });
      return vi.fn();
    });

    const { result } = renderHook(() => useFirestoreConnectivity());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.state).toBe('offline-persistence');
    expect(result.current.isFromCache).toBe(true);
    expect(result.current.hasPendingWrites).toBe(true);
  });

  it('toggles simulated offline persistence using disableNetwork and enableNetwork', async () => {
    (firestoreModule.getDocFromServer as any).mockResolvedValue({ exists: () => true });
    (firestoreModule.disableNetwork as any).mockResolvedValue(undefined);
    (firestoreModule.enableNetwork as any).mockResolvedValue(undefined);
    (firestoreModule.onSnapshot as any).mockImplementation(() => vi.fn());

    const { result } = renderHook(() => useFirestoreConnectivity());

    await act(async () => {
      await result.current.toggleSimulatedOffline();
    });

    expect(result.current.isSimulatedOffline).toBe(true);
    expect(result.current.state).toBe('offline-persistence');
    expect(firestoreModule.disableNetwork).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.toggleSimulatedOffline();
    });

    expect(result.current.isSimulatedOffline).toBe(false);
    expect(firestoreModule.enableNetwork).toHaveBeenCalledTimes(1);
  });
});
