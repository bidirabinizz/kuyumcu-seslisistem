// hooks/useMarket.js
// Piyasa kur verilerini TCMB'den çeker ve 60sn önbellekler.
// useSocket.js içindeki inline useEffect'ten ayrıştırıldı (SRP).

import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../apiConfig';

export const useMarket = () => {
  const [kurlar, setKurlar]       = useState(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata]           = useState(null);

  const fetchKurlar = useCallback(async () => {
    setYukleniyor(true);
    try {
      const res  = await fetch(`${API_BASE}/piyasa/kurlar`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || 'Kur verisi alınamadı');
      setKurlar(data);
      setHata(null);
    } catch (e) {
      setHata(e.message);
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => {
    fetchKurlar();
    const id = setInterval(fetchKurlar, 60_000);
    return () => clearInterval(id);
  }, [fetchKurlar]);

  return { kurlar, yukleniyor, hata, yenile: fetchKurlar };
};
