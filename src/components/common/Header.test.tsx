import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from './Header';
import * as authContext from '../../context/AuthContext';

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn()
}));

const mockAuthUser = {
  currentUser: {
    uid: 'u-1',
    name: 'Admin Owner',
    username: 'admin',
    roleId: 'owner',
    active: true
  },
  isOnline: true,
  logout: vi.fn(),
  firebaseUser: null,
  hasPermission: vi.fn().mockReturnValue(true),
  isOwner: true,
  isManager: false,
  isWaiter: false
};

describe('Header Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (authContext.useAuth as any).mockReturnValue(mockAuthUser);
  });

  it('renders essential header controls and current bill counter', () => {
    const { container } = render(
      <Header
        onOpenAuth={vi.fn()}
      />
    );

    // Verifies restaurant title & bill counter
    expect(screen.getByText(/SRI SARAVANA BHAVAN/i)).toBeDefined();
    expect(container.querySelector('#header-current-bill-no')).toBeDefined();

    // Verifies fullscreen, login, and logout actions
    expect(screen.getByRole('button', { name: /Full Screen POS/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Login/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Sign Out/i })).toBeDefined();
  });

  it('does not render the removed telemetry and status buttons in the header', () => {
    const { container } = render(
      <Header
        onOpenAuth={vi.fn()}
      />
    );

    // Verifies removed buttons are absent
    expect(container.querySelector('#header-connectivity-status')).toBeNull();
    expect(container.querySelector('#header-printer-status-btn')).toBeNull();
    expect(screen.queryByText(/CLOUD SYNCED/i)).toBeNull();
    expect(screen.queryByText(/PRINTER: OK/i)).toBeNull();
    expect(screen.queryByText(/OFFLINE PERSISTENCE/i)).toBeNull();
  });

  it('triggers onOpenAuth when Login button is clicked', () => {
    const onOpenAuthMock = vi.fn();
    render(
      <Header
        onOpenAuth={onOpenAuthMock}
      />
    );

    const loginBtn = screen.getByRole('button', { name: /Login/i });
    fireEvent.click(loginBtn);
    expect(onOpenAuthMock).toHaveBeenCalledTimes(1);
  });
});

