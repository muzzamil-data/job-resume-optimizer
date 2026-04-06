import React, { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { logError } from '../../lib/supabase-client';

function isContextInvalidated(): boolean {
  try {
    return !chrome.runtime?.id;
  } catch {
    return true;
  }
}

export class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    // Don't try to log to Supabase if the extension context is dead
    if (isContextInvalidated()) return;
    logError('react_boundary', null, 'render_error', error.message, {
      stack: error.stack?.slice(0, 500),
    });
  }
  render() {
    if (this.state.error) {
      const contextDead =
        isContextInvalidated() ||
        this.state.error.message.includes('Extension context invalidated');

      if (contextDead) {
        return (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4">
            <RefreshCw size={32} className="text-amber-500" />
            <div>
              <p className="text-base font-bold text-slate-800 mb-1">Extension Updated</p>
              <p className="text-sm text-slate-500 mb-3">
                The extension was reloaded. Please refresh this page to continue.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90"
              >
                Refresh Page
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4">
          <AlertTriangle size={32} className="text-red-500" />
          <div>
            <p className="text-base font-bold text-slate-800 mb-1">Something went wrong</p>
            <p className="text-sm text-slate-500 mb-3">{this.state.error.message}</p>
            <button
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
