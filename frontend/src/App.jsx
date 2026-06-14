import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, TrendingUp, AlertCircle } from 'lucide-react';
import { Analytics } from '@vercel/analytics/react';
import { Sidebar }        from './components/Sidebar';
import { LiveTicker }     from './components/LiveTicker';
import { Dashboard }      from './pages/Dashboard';
import { Kullanicilar }   from './pages/Kullanicilar';
import { Raporlar }       from './pages/Raporlar';
import { Urunler }        from './pages/Urunler';
import { ErrorBoundary }  from './components/ErrorBoundary';
import { ToastProvider }  from './components/ToastProvider';
import Ayarlar            from './pages/Ayarlar';
import KasaTablet         from './pages/KasaTablet';
import './index.css';

import { Toptancilar }    from './pages/Toptancilar';
import { ToptanciDetay }  from './pages/ToptanciDetay';

export default function App() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <ToastProvider>
      <Analytics />
      <BrowserRouter>
        <DailyKurPrompt />
        <Routes>
          {/* ── Kasa Ekranı — tam ekran, sidebar YOK ── */}
          <Route path="/kasa" element={
            <ErrorBoundary>
              <KasaTablet />
            </ErrorBoundary>
          } />

          {/* ── Admin Paneli — sidebar ile ── */}
          <Route path="*" element={
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
                    className="w-9 h-9 rounded-sm bg-ink-50 flex items-center justify-center text-ink-600 premium-border"
                  >
                    <Menu size={18} />
                  </button>
                  <span className="font-display font-black text-ink-900">ÇAPAR ERP</span>
                </div>

                <LiveTicker />
                <main className="flex-1 overflow-y-auto">
                  <Routes>
                    <Route path="/" element={
                      <ErrorBoundary><Dashboard /></ErrorBoundary>
                    } />
                    <Route path="/toptancilar" element={
                      <ErrorBoundary><Toptancilar /></ErrorBoundary>
                    } />
                    <Route path="/toptancilar/:id" element={
                      <ErrorBoundary><ToptanciDetay /></ErrorBoundary>
                    } />
                    <Route path="/kullanicilar" element={
                      <ErrorBoundary><Kullanicilar /></ErrorBoundary>
                    } />
                    <Route path="/urunler" element={
                      <ErrorBoundary><Urunler /></ErrorBoundary>
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
          } />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}

function DailyKurPrompt() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname === '/kasa') return;

    const today = new Date().toISOString().split('T')[0];
    const lastPromptDate = localStorage.getItem('daily_kur_prompt_last_date');
    if (lastPromptDate !== today) {
      setOpen(true);
    }
  }, [location.pathname]);

  const handleClose = () => {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem('daily_kur_prompt_last_date', today);
    setOpen(false);
  };

  const handleGoToSettings = () => {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem('daily_kur_prompt_last_date', today);
    setOpen(false);
    navigate('/?openKurModal=true');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink-950/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white border border-ink-200 w-full max-w-md p-6 rounded-lg shadow-2xl relative animate-scaleUp">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-ink-400 hover:text-ink-900 transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center text-amber-600 mb-4 border border-amber-200 animate-pulse">
            <TrendingUp size={24} />
          </div>

          <h3 className="text-base font-black text-ink-900 mb-2">
            Günlük Kur Ayarlama Hatırlatması
          </h3>

          <p className="text-xs text-ink-500 leading-relaxed mb-6">
            Bugün bu tarayıcı üzerinden sisteme ilk defa giriş yaptınız. Günlük işlemlerin ve toptancı hesaplarının güncel kurlarla (Altın, USD, EUR) doğru hesaplanabilmesi için kurlarınızı ayarlamanız önerilir.
          </p>

          <div className="flex gap-3 w-full">
            <button
              onClick={handleClose}
              className="flex-1 h-9 border border-ink-200 hover:bg-ink-50 text-ink-700 text-xs font-bold transition-colors"
            >
              Daha Sonra
            </button>
            <button
              onClick={handleGoToSettings}
              className="flex-1 h-9 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded transition-colors flex items-center justify-center gap-1.5 shadow-sm"
            >
              <AlertCircle size={14} /> Kurları Ayarla
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


