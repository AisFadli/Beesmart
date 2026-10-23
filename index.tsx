
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initTheme } from './theme';

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Application render error:', error, info.componentStack);
    localStorage.setItem('beesmart_last_error', JSON.stringify({
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
      time: new Date().toISOString()
    }));
  }

  render() {
    if (this.state.hasError) {
      let lastErr: any = null;
      try {
        lastErr = JSON.parse(localStorage.getItem('beesmart_last_error') || '{}');
      } catch (e) {}

      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center text-slate-800">
          <h1 className="text-xl font-bold text-red-600">Aplikasi mengalami kendala rendering</h1>
          <p className="max-w-md text-sm text-slate-600">Kesalahan render telah dicatat. Detail error:</p>
          {lastErr && lastErr.message && (
            <div className="max-w-lg bg-red-50 border border-red-200 p-4 rounded-xl text-left text-xs text-red-700 font-mono overflow-auto max-h-40">
              <p className="font-bold">{lastErr.message}</p>
              <pre className="mt-1 whitespace-pre-wrap">{lastErr.componentStack || lastErr.stack}</pre>
            </div>
          )}
          <button type="button" onClick={() => { localStorage.removeItem('beesmart_last_error'); localStorage.removeItem('beesmart_user'); window.location.reload(); }} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            Reset Sesi & Muat Ulang Aplikasi
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Terapkan tema tersimpan (light/dark) sebelum render pertama
initTheme();

// Registrasi Service Worker untuk PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.log('SW registration failed: ', err);
    });
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <AppErrorBoundary>
    <React.StrictMode>
      <App />
    </React.StrictMode>
  </AppErrorBoundary>
);
