
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
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center text-slate-800">
          <h1 className="text-xl font-bold">Aplikasi mengalami kendala</h1>
          <p className="max-w-md text-sm text-slate-600">Kesalahan render telah dicatat. Muat ulang aplikasi untuk mencoba kembali.</p>
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            Muat ulang aplikasi
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
