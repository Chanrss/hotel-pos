import React, { useState, useEffect } from 'react';
import {
  X,
  AlertCircle,
  KeyRound,
  Lock,
  User as UserIcon,
  Delete,
  LogIn,
  ShieldCheck,
  Clock
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { checkAccountLockout } from '../../services/securityService';
import { DEFAULT_RESTAURANT_LOGO, SRI_SARAVANA_BHAVAN_SVG } from '../../data/defaultLogo';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  fullScreen?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  fullScreen = false
}) => {
  const { loginWithUsernameAndPin } = useAuth();

  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);

  // Clear credentials whenever modal opens/closes so no previous session is remembered
  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(null);
    }
  }, [isOpen]);

  // Monitor temporary account lockout countdown if locked
  useEffect(() => {
    if (!username.trim()) {
      setLockoutSeconds(0);
      return;
    }
    const updateLockout = () => {
      const status = checkAccountLockout(username);
      setLockoutSeconds(status.isLocked ? status.remainingSeconds : 0);
    };
    updateLockout();
    const timer = setInterval(updateLockout, 1000);
    return () => clearInterval(timer);
  }, [username, error]);

  if (!isOpen) return null;

  const handleNumPadPress = (digit: string) => {
    if (lockoutSeconds > 0) return;
    if (pin.length < 6) {
      setPin((prev) => prev + digit);
      setError(null);
    }
  };

  const handleNumPadBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleNumPadClear = () => {
    setPin('');
    setError(null);
  };

  const handlePinSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (!username.trim()) {
      setError('Username is mandatory. Please enter your username.');
      return;
    }
    if (!pin.trim()) {
      setError('PIN is mandatory. Please enter your PIN.');
      return;
    }

    const lockout = checkAccountLockout(username);
    if (lockout.isLocked) {
      setLockoutSeconds(lockout.remainingSeconds);
      setError(
        `Account temporarily locked due to repeated failed PIN attempts. Try again in ${lockout.remainingSeconds}s.`
      );
      return;
    }

    setLoading(true);
    try {
      await loginWithUsernameAndPin(username, pin);
      setPin('');
      setUsername('');
      onClose();
    } catch (err: any) {
      setPin('');
      setError(err.message || 'Invalid username or PIN.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-testid="mandatory-pos-login-screen"
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto ${
        fullScreen
          ? 'bg-[#0F172A] bg-[radial-gradient(ellipse_at_top,#1E293B_0%,#0F172A_75%)]'
          : 'bg-slate-950/75 backdrop-blur-xs'
      }`}
    >
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl my-auto text-slate-900">
        {/* Enterprise Navy Restaurant Brand Header */}
        <div className="bg-[#0F172A] px-6 py-5 border-b border-slate-800 text-white relative">
          {!fullScreen && (
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          <div className="flex items-center gap-3.5">
            <div className="w-13 h-13 rounded-xl bg-white border-2 border-emerald-500/80 p-1 flex items-center justify-center shrink-0 shadow-md overflow-hidden">
              <img
                src={DEFAULT_RESTAURANT_LOGO}
                alt="SRI SARAVANA BHAVAN"
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = SRI_SARAVANA_BHAVAN_SVG;
                }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold uppercase tracking-wider mb-1">
                <ShieldCheck className="w-3 h-3" />
                <span>Secure POS Terminal</span>
              </div>
              <h2 className="font-extrabold text-base sm:text-lg text-white tracking-tight uppercase truncate">
                SRI SARAVANAN BHAVAN
              </h2>
              <p className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider truncate">
                Pure Veg Family Restaurant • Kallakurichi
              </p>
            </div>
          </div>
        </div>

        {/* Subheader */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#0F172A]" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
              Operator Authentication
            </span>
          </div>
          <span className="text-[11px] font-medium text-slate-500">
            Owner / Store Manager
          </span>
        </div>

        {/* Temporary Lockout Alert */}
        {lockoutSeconds > 0 && (
          <div
            data-testid="login-lockout-banner"
            className="mx-6 mt-4 p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center gap-2 font-mono"
          >
            <Clock className="w-4 h-4 shrink-0 text-amber-600" />
            <span>
              Account locked for security. Retry in <strong>{lockoutSeconds}s</strong>.
            </span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div
            data-testid="login-error-alert"
            className="mx-6 mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Username & PIN Form */}
        <form onSubmit={handlePinSubmit} autoComplete="off" className="p-6 space-y-4">
          {/* Username Input */}
          <div>
            <label
              htmlFor="login-username-input"
              className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5"
            >
              Username <span className="text-emerald-600">*</span>
            </label>
            <div className="relative flex items-center">
              <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5" />
              <input
                id="login-username-input"
                name="pos_username"
                type="text"
                required
                autoFocus
                autoComplete="off"
                spellCheck={false}
                placeholder="Enter username (owner / manager)"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError(null);
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-3.5 py-2.5 text-slate-900 text-sm font-mono font-semibold focus:outline-none focus:bg-white focus:border-[#0F172A] focus:ring-2 focus:ring-slate-900/10 transition-all"
              />
            </div>
          </div>

          {/* PIN Input (Strictly Masked, Never Stored in Plain Text) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="login-pin-input"
                className="block text-xs font-bold text-slate-700 uppercase tracking-wider"
              >
                Security PIN <span className="text-emerald-600">*</span>
              </label>
              <div
                className="flex items-center gap-1.5"
                aria-label={`PIN digits entered: ${pin.length}`}
              >
                {[0, 1, 2, 3].map((idx) => (
                  <span
                    key={idx}
                    className={`w-2.5 h-2.5 rounded-full transition-all ${
                      pin.length > idx
                        ? 'bg-emerald-600 scale-110'
                        : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                id="login-pin-input"
                name="pos_pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="new-password"
                data-lpignore="true"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                maxLength={6}
                required
                disabled={lockoutSeconds > 0}
                aria-label="Masked Security PIN"
                placeholder="••••"
                value={pin}
                onCopy={(e) => e.preventDefault()}
                onCut={(e) => e.preventDefault()}
                onChange={(e) => {
                  setPin(e.target.value.replace(/[^0-9]/g, ''));
                  setError(null);
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-3.5 py-2.5 text-slate-900 text-center font-mono tracking-[0.45em] text-lg font-bold focus:outline-none focus:bg-white focus:border-[#0F172A] focus:ring-2 focus:ring-slate-900/10 select-none disabled:opacity-50 transition-all"
              />
            </div>
          </div>

          {/* High-Traffic POS Touch Numeric Keypad Grid */}
          <div
            id="auth-pin-keypad-grid"
            data-testid="pin-numeric-keypad"
            role="group"
            aria-label="PIN Numeric Keypad"
            className="pt-1 select-none"
          >
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  type="button"
                  data-digit={num}
                  disabled={lockoutSeconds > 0}
                  aria-label={`PIN Digit ${num}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleNumPadPress(num)}
                  className="h-12 bg-slate-50 hover:bg-slate-100 active:bg-[#0F172A] active:text-white active:scale-[0.98] disabled:opacity-40 border border-slate-200 hover:border-slate-300 rounded-xl font-mono text-lg font-extrabold text-slate-900 shadow-2xs transition-all cursor-pointer flex items-center justify-center"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                aria-label="Clear PIN"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleNumPadClear}
                disabled={pin.length === 0 || lockoutSeconds > 0}
                className="h-12 bg-red-50/70 hover:bg-red-100 active:bg-red-600 active:text-white disabled:opacity-40 border border-red-200 text-red-700 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center"
              >
                Clear
              </button>
              <button
                type="button"
                data-digit="0"
                disabled={lockoutSeconds > 0}
                aria-label="PIN Digit 0"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleNumPadPress('0')}
                className="h-12 bg-slate-50 hover:bg-slate-100 active:bg-[#0F172A] active:text-white active:scale-[0.98] disabled:opacity-40 border border-slate-200 hover:border-slate-300 rounded-xl font-mono text-lg font-extrabold text-slate-900 shadow-2xs transition-all cursor-pointer flex items-center justify-center"
              >
                0
              </button>
              <button
                type="button"
                aria-label="Backspace PIN Digit"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleNumPadBackspace}
                disabled={pin.length === 0 || lockoutSeconds > 0}
                className="h-12 bg-slate-100 hover:bg-slate-200 active:bg-[#0F172A] active:text-white disabled:opacity-40 border border-slate-200 text-slate-700 rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1 font-bold"
                title="Backspace"
              >
                <Delete className="w-4 h-4" />
                <span>Del</span>
              </button>
            </div>
          </div>

          {/* Primary Sign In Button */}
          <button
            type="submit"
            disabled={loading || lockoutSeconds > 0}
            data-testid="pos-login-submit-btn"
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-extrabold text-sm rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            <span>
              {lockoutSeconds > 0
                ? `Locked (${lockoutSeconds}s)`
                : loading
                ? 'Verifying Credentials...'
                : 'Unlock & Sign In to POS'}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
};

