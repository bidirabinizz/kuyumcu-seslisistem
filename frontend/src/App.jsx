import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sidebar }        from './components/Sidebar';
import { LiveTicker }     from './components/LiveTicker';
import { Dashboard }      from './pages/Dashboard';
import { Kullanicilar }   from './pages/Kullanicilar';
import { Raporlar }       from './pages/Raporlar';
import { ErrorBoundary }  from './components/ErrorBoundary';
import { ToastProvider }  from './components/ToastProvider';
import Ayarlar            from './pages/Ayarlar';
import './index.css';

export default function App() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <ToastProvider>
      <BrowserRouter>
        <div className="flex h-screen overflow-hidden bg-ink-50">
          <Sidebar
            mobileOpen={mobileOpen}
            closeMobileMenu={() => setMobileOpen(false)}
          />

          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Mobile topbar */}
            <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-ink-100 shadow-sm">
              <button
                id="mobile-menu-toggle"
                onClick={() => setMobileOpen(true)}
                className="w-9 h-9 rounded-xl bg-ink-50 flex items-center justify-center text-ink-600"
              >
                <Menu size={18} />
              </button>
              <span className="font-display font-black text-ink-900">ÇAPAR ERP</span>
            </div>

            {/* Main content */}
            <LiveTicker />
            <main className="flex-1 overflow-y-auto">
              <Routes>
                <Route path="/" element={
                  <ErrorBoundary><Dashboard /></ErrorBoundary>
                } />
                <Route path="/kullanicilar" element={
                  <ErrorBoundary><Kullanicilar /></ErrorBoundary>
                } />
                <Route path="/raporlar" element={
                  <ErrorBoundary><Raporlar /></ErrorBoundary>
                } />
                <Route path="/ayarlar" element={
                  <ErrorBoundary><Ayarlar /></ErrorBoundary>
                } />
              </Routes>
            </main>
          </div>
        </div>
      </BrowserRouter>
    </ToastProvider>
  );
}

