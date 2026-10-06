// @ts-nocheck
import React, { Component } from 'react';
import * as Sentry from '@sentry/react';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';
import { safeStorage } from '../../utils/safeStorage';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
    try {
      Sentry.captureException(error, {
        extra: {
          componentStack: errorInfo?.componentStack,
          ...errorInfo,
        },
      });
    } catch (_) {}
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    try {
      safeStorage.clear();
      localStorage.clear();
    } catch (e) {
      // ignore
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-slate-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 text-center space-y-4">
            <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8" />
            </div>
            
            <div>
              <h2 className="text-xl font-bold text-slate-900">Application Notice</h2>
              <p className="text-sm text-slate-600 mt-1">
                An unexpected display issue occurred. You can reload the application or reset local cache to continue.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-left overflow-x-auto text-xs font-mono text-red-600">
                {String(this.state.error)}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <RotateCcw className="w-4 h-4" /> Reload App
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl flex items-center justify-center gap-2 cursor-pointer border border-slate-200"
              >
                <Trash2 className="w-4 h-4 text-slate-500" /> Clear Cache & Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
