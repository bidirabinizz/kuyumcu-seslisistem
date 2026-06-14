import { LayoutDashboard, Users, BarChart3, ShieldCheck, Package, Monitor, Settings2Icon, X, ExternalLink, Building2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const menu = [
  { icon: LayoutDashboard, label: 'Canlı İzleme',  path: '/' },
  { icon: Building2,       label: 'Toptancılar',   path: '/toptancilar' },
  { icon: Users,           label: 'Personeller',   path: '/kullanicilar' },
  { icon: Package,         label: 'Ürünler',        path: '/urunler' },
  { icon: BarChart3,       label: 'Raporlar',       path: '/raporlar' },
  { icon: Settings2Icon,   label: 'Ayarlar',        path: '/ayarlar' },
];

export const Sidebar = ({ closeMobileMenu, mobileOpen }) => {
  const location = useLocation();

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={closeMobileMenu}
        />
      )}

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-30
        w-64 bg-gray-700 flex flex-col text-white
        backdrop-blur-sm bg-opacity-100
        border-r border-gold-400/20
        transition-transform duration-300 ease-in-out
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>

        {/* Logo */}
        <div className="px-6 py-7 border-b border-gold-400/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gold-500 flex items-center justify-center shadow-lg shadow-gold-500/30">
              <ShieldCheck size={18} className="text-ink-900" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="font-display font-black text-lg leading-none tracking-tight text-white">ÇAPAR</h1>
              <p className="text-[10px] font-mono text-gold-500 tracking-[0.2em] mt-0.5">ERP SİSTEMİ</p>
            </div>
          </div>
          <button onClick={closeMobileMenu} className="lg:hidden text-ink-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Kasa Ekranı hızlı erişim */}
        <div className="px-3 py-2 border-b border-white/5">
          <a
            href="/kasa"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 bg-amber-500/10 border border-amber-400/20 rounded-xl px-3 py-2.5 hover:bg-amber-500/20 transition-all group"
          >
            <Monitor size={14} className="text-amber-400" />
            <span className="text-xs font-medium text-amber-300 flex-1">Kasa Ekranı</span>
            <ExternalLink size={12} className="text-amber-500/50 group-hover:text-amber-400 transition-colors" />
          </a>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3">
          <p className="text-[12px] font-bold tracking-[0.15em] text-ink-100 uppercase px-3 mb-3">Menü</p>
          {menu.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={closeMobileMenu}
                className={`
                  flex items-center gap-3 px-3 py-3 rounded-xl mb-1
                  transition-all duration-150 group
                  ${active
                    ? 'nav-active-glow text-gold-400'
                    : 'text-ink-100 hover:text-white hover:bg-white/5'
                  }
                `}
              >
                <item.icon size={17} strokeWidth={active ? 2.5 : 2} />
                <span className="text-sm font-semibold">{item.label}</span>
                {active && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-gold-400" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-white/5">
          <p className="text-[10px] text-ink-600 font-mono">v2.1.0 · 2026</p>
        </div>
      </aside>
    </>
  );
};
