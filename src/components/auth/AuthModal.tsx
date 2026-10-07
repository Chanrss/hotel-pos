import React, { useState } from 'react';
import {
  X,
  AlertCircle,
  KeyRound,
  Lock,
  User as UserIcon,
  Delete,
  LogIn
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

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

  if (!isOpen) return null;

  const handleNumPadPress = (digit: string) => {
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
      setError('Please enter your username.');
      return;
    }
    if (!pin.trim()) {
      setError('Please enter your PIN.');
      return;
    }

    setLoading(true);
    try {
      await loginWithUsernameAndPin(username, pin);
      setPin('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Invalid username or PIN.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto ${
        fullScreen ? 'bg-slate-950' : 'bg-black/75 backdrop-blur-xs'
      }`}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl my-auto text-slate-100">
        {/* Top Header */}
        <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white leading-tight">
                POS Login
              </h3>
              <p className="text-xs text-slate-400">
                Enter your Username and PIN
              </p>
            </div>
          </div>
          {!fullScreen && (
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-red-950/80 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Username & PIN Form Only */}
        <form onSubmit={handlePinSubmit} className="p-5 space-y-4">
          {/* Username Input */}
          <div>
            <label
              htmlFor="login-username-input"
              className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5"
            >
              Username
            </label>
            <div className="relative flex items-center">
              <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5" />
              <input
                id="login-username-input"
                type="text"
                required
                autoFocus
                autoComplete="username"
                placeholder="Enter username (e.g. admin)"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError(null);
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-3.5 py-2.5 text-white text-sm font-mono focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* PIN Input (Strictly Masked) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="login-pin-input"
                className="block text-xs font-bold text-slate-300 uppercase tracking-wider"
              >
                PIN
              </label>
              <div
                className="flex items-center gap-1.5"
                aria-label={`PIN digits entered: ${pin.length}`}
              >
                {[0, 1, 2, 3].map((idx) => (
                  <span
                    key={idx}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      pin.length > idx
                        ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]'
                        : 'bg-slate-700'
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
              <input
                id="login-pin-input"
                name="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="current-password"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                maxLength={6}
                required
                aria-label="Masked Security PIN"
                placeholder="••••"
                value={pin}
                onCopy={(e) => e.preventDefault()}
                onCut={(e) => e.preventDefault()}
                onChange={(e) => {
                  setPin(e.target.value.replace(/[^0-9]/g, ''));
                  setError(null);
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-3.5 py-2.5 text-white text-center font-mono tracking-[0.4em] text-lg focus:outline-none focus:border-amber-400 select-none"
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
            <div className="grid grid-cols-3 gap-2.5">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  type="button"
                  data-digit={num}
                  aria-label={`PIN Digit ${num}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleNumPadPress(num)}
                  className="h-12 bg-slate-800/90 hover:bg-slate-700 active:bg-amber-500 active:text-slate-950 active:scale-[0.97] border border-slate-700/80 hover:border-amber-500/40 rounded-xl font-mono text-lg font-black text-white shadow-xs transition-all cursor-pointer flex items-center justify-center"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                aria-label="Clear PIN"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleNumPadClear}
                disabled={pin.length === 0}
                className="h-12 bg-slate-800/70 hover:bg-red-950/70 active:bg-red-600 active:text-white disabled:opacity-40 border border-slate-700/80 hover:border-red-500/40 text-slate-300 hover:text-red-200 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center"
              >
                Clear
              </button>
              <button
                type="button"
                data-digit="0"
                aria-label="PIN Digit 0"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleNumPadPress('0')}
                className="h-12 bg-slate-800/90 hover:bg-slate-700 active:bg-amber-500 active:text-slate-950 active:scale-[0.97] border border-slate-700/80 hover:border-amber-500/40 rounded-xl font-mono text-lg font-black text-white shadow-xs transition-all cursor-pointer flex items-center justify-center"
              >
                0
              </button>
              <button
                type="button"
                aria-label="Backspace PIN Digit"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleNumPadBackspace}
                disabled={pin.length === 0}
                className="h-12 bg-slate-800/70 hover:bg-slate-700 active:bg-amber-500 active:text-slate-950 disabled:opacity-40 border border-slate-700/80 text-slate-300 rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1 font-bold"
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
            disabled={loading}
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-extrabold text-sm rounded-xl shadow-lg cursor-pointer transition-colors flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            <span>{loading ? 'Signing In...' : 'Login'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
