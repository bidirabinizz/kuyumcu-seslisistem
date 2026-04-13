import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';

const API_BASE = 'http://localhost:8000';

const TrendIcon = ({ trend }) => {
  if (trend === 'up') return <ArrowUpRight size={14} className="text-emerald-500" />;
  if (trend === 'down') return <ArrowDownRight size={14} className="text-red-500" />;
  return <ArrowRight size={14} className="text-ink-400" />;
};

export const LiveTicker = () => {
  const [data, setData] = useState(null);

  const fetchTicker = async () => {
    try {
      const res = await fetch(`${API_BASE}/piyasa/kurlar`);
      const body = await res.json();
      if (res.ok) setData(body);
    } catch (_) {}
  };

  useEffect(() => {
    fetchTicker();
    const id = setInterval(fetchTicker, 60000);
    return () => clearInterval(id);
  }, []);

  const items = data
    ? [
        { key: 'usd', label: 'USD/TRY', value: Number(data.usd_try).toFixed(4), trend: data.trends?.usd_try },
        { key: 'eur', label: 'EUR/TRY', value: Number(data.eur_try).toFixed(4), trend: data.trends?.eur_try },
        { key: 'gold', label: '24K ALTIN', value: Number(data.gram_altin_24k_try).toFixed(2), trend: data.trends?.gold },
      ]
    : [{ key: 'load', label: 'Piyasa', value: 'Güncelleniyor...', trend: 'same' }];

  return (
    <div className="border-b border-ink-100 bg-white overflow-hidden relative w-full h-10 flex items-center">
      <div className="flex animate-ticker whitespace-nowrap min-w-full">
        {/* İçeriği 4 kez basmak her ekran boyutunda boşluğu kesin olarak kapatır */}
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center gap-12 px-6 shrink-0">
            {items.map((item) => (
              <div key={`${item.key}-${i}`} className="flex items-center gap-2 text-xs">
                <span className="font-bold text-ink-500 uppercase tracking-widest">{item.label}</span>
                <TrendIcon trend={item.trend} />
                <span className="font-mono font-black text-ink-900">{item.value}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
