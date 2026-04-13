import { useState, useEffect, useRef, useCallback } from 'react';

export const useSocket = (url) => {
  const [islemler, setIslemler]   = useState([]);
  const [toplamHas, setToplamHas] = useState(0);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef(null);
  const retryRef = useRef(null);
  const API_BASE = 'http://localhost:8000';

  const mapApiIslem = (row) => {
    const tarihObj = row.islem_tarihi ? new Date(row.islem_tarihi) : null;
    return {
      id: row.id,
      tip: row.islem_tipi,
      ayar: row.urun_cinsi,
      miktar: Number(row.brut_miktar || 0),
      has: Number(row.net_has_miktar || 0),
      zaman: tarihObj ? tarihObj.toLocaleTimeString('tr-TR') : '—',
      islem_tarihi: row.islem_tarihi,
      personel_ad_soyad: row.personel_ad_soyad,
      birim_fiyat: Number(row.birim_fiyat || 0),
    };
  };

  const initialFetch = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/islemler?gunler=30&limit=15`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || 'İşlemler alınamadı.');
      }
      const normalized = data.map(mapApiIslem);
      setIslemler(normalized);
      const toplam = normalized.reduce((s, item) => {
        return item.tip === 'ALIS' ? s + item.has : s - item.has;
      }, 0);
      setToplamHas(toplam);
    } catch (_) {
      // Socket akışı devam eder; ilk yükleme hatası UI'ı kırmamalı.
    } finally {
      setLoading(false);
    }
  }, []);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        clearTimeout(retryRef.current);
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          setIslemler(prev => {
            const updated = [{ ...data, zaman: new Date().toLocaleTimeString('tr-TR') }, ...prev];
            return updated.slice(0, 100); // max 100 kayıt
          });
          setToplamHas(prev =>
            data.tip === 'ALIS'
              ? prev + data.has
              : prev - data.has
          );
        } catch (_) {}
      };

      ws.onclose = () => {
        setConnected(false);
        // 3 saniye sonra yeniden bağlan
        retryRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    } catch (_) {}
  }, [url]);

  useEffect(() => {
    initialFetch();
    connect();
    return () => {
      clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect, initialFetch]);

  return { islemler, toplamHas, connected, loading };
};
