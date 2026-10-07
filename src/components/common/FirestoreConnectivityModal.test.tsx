import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FirestoreConnectivityModal } from './FirestoreConnectivityModal';
import { FirestoreConnectivityInfo } from '../../hooks/useFirestoreConnectivity';

const createMockConnectivity = (overrides?: Partial<FirestoreConnectivityInfo>): FirestoreConnectivityInfo => ({
  state: 'online-synced',
  isOnline: true,
  isFromCache: false,
  hasPendingWrites: false,
  lastSyncTime: new Date(2026, 9, 7, 12, 0, 0),
  latencyMs: 38,
  isSimulatedOffline: false,
  errorMessage: null,
  isTestingConnection: false,
  testConnection: vi.fn().mockResolvedValue({ success: true, latencyMs: 38 }),
  reconnect: vi.fn().mockResolvedValue(undefined),
  toggleSimulatedOffline: vi.fn().mockResolvedValue(undefined),
  ...overrides
});

describe('FirestoreConnectivityModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const connectivity = createMockConnectivity();
    const { container } = render(
      <FirestoreConnectivityModal
        isOpen={false}
        onClose={vi.fn()}
        connectivity={connectivity}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders online cloud connected telemetry when state is online-synced', () => {
    const connectivity = createMockConnectivity();
    render(
      <FirestoreConnectivityModal
        isOpen={true}
        onClose={vi.fn()}
        connectivity={connectivity}
      />
    );

    expect(screen.getByText(/Firestore Database & Sync Monitor/i)).toBeDefined();
    expect(screen.getByText(/Cloud Firestore: Connected & Synced/i)).toBeDefined();
    expect(screen.getByText('Cloud Server')).toBeDefined();
    expect(screen.getByText('38 ms')).toBeDefined();
    expect(screen.getByText(/Offline Persistence Architecture/i)).toBeDefined();
  });

  it('renders offline persistence feedback when state is offline-persistence', () => {
    const connectivity = createMockConnectivity({
      state: 'offline-persistence',
      isOnline: false,
      isFromCache: true,
      hasPendingWrites: true,
      latencyMs: null
    });

    render(
      <FirestoreConnectivityModal
        isOpen={true}
        onClose={vi.fn()}
        connectivity={connectivity}
      />
    );

    expect(screen.getByText(/Offline Persistence Mode Active/i)).toBeDefined();
    expect(screen.getByText(/The POS is currently operating in offline persistence mode/i)).toBeDefined();
    expect(screen.getByText('DISCONNECTED')).toBeDefined();
    expect(screen.getByText('IndexedDB Cache')).toBeDefined();
    expect(screen.getByText('Syncing Queue...')).toBeDefined();
    expect(screen.getByText(/Zero Data Loss/i)).toBeDefined();
  });

  it('calls testConnection when Ping Cloud Server is clicked', () => {
    const testConnectionMock = vi.fn().mockResolvedValue({ success: true, latencyMs: 25 });
    const connectivity = createMockConnectivity({
      testConnection: testConnectionMock
    });

    render(
      <FirestoreConnectivityModal
        isOpen={true}
        onClose={vi.fn()}
        connectivity={connectivity}
      />
    );

    const pingBtn = screen.getByRole('button', { name: /Ping Cloud Server/i });
    fireEvent.click(pingBtn);
    expect(testConnectionMock).toHaveBeenCalledTimes(1);
  });

  it('calls toggleSimulatedOffline when Test Offline Mode is clicked', () => {
    const toggleMock = vi.fn().mockResolvedValue(undefined);
    const connectivity = createMockConnectivity({
      toggleSimulatedOffline: toggleMock
    });

    render(
      <FirestoreConnectivityModal
        isOpen={true}
        onClose={vi.fn()}
        connectivity={connectivity}
      />
    );

    const offlineBtn = screen.getByRole('button', { name: /Test Offline Mode/i });
    fireEvent.click(offlineBtn);
    expect(toggleMock).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Close button or X is clicked', () => {
    const onCloseMock = vi.fn();
    const connectivity = createMockConnectivity();

    render(
      <FirestoreConnectivityModal
        isOpen={true}
        onClose={onCloseMock}
        connectivity={connectivity}
      />
    );

    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });
});
