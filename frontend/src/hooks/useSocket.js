// hooks/useSocket.js

import { useState, useEffect, useRef, useCallback } from 'react';

export const useSocket = (url) => {
  const [islemler, setIslemler]   = useState([]);
  const [toplamHas, setToplamHas] = useState(0);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [voiceState, setVoiceState] = useState({ state: 'IDLE', islem: null, mesaj: null });
  
  // YENİ: Ekranda "Geri Al" toast'u göstermek için son işlemi tutacağımız state
  const [lastTx, setLastTx] = useState(null); 
  
  const wsRef = useRef(null);
  const retryRef = useRef(null);
  const API_BASE = 'http://localhost:8000';

  const mapApiIslem = (row) => ({
    id: row.id,
    tip: row.islem_tipi,
    ayar: row.urun_cinsi,
    miktar: Number(row.brut_miktar || 0),
    has: Number(row.net_has_miktar || 0),
    zaman: row.islem_tarihi ? new Date(row.islem_tarihi).toLocaleTimeString('tr-TR') : '—',
    islem_tarihi: row.islem_tarihi,
    personel_ad_soyad: row.personel_ad_soyad,
    birim_fiyat: Number(row.birim_fiyat || 0),
  });

  const initialFetch = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/islemler?gunler=30&limit=15`);
      const data = await res.json();
      if (res.ok) {
        const normalized = data.map(mapApiIslem);
        setIslemler(normalized);
        setToplamHas(normalized.reduce((s, item) => item.tip === 'ALIS' ? s + item.has : s - item.has, 0));
      }
    } finally { setLoading(false); }
  }, []);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => { setConnected(true); clearTimeout(retryRef.current); };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          
          if (data.type === 'VOICE_STATE') {
            setVoiceState({ state: data.state, islem: data.islem, mesaj: data.mesaj });
            return;
          }

          // YENİ: İşlem Geri Alma/Silme Sinyali
          if (data.type === 'UNDO_TX') {
            setIslemler(prev => prev.filter(i => i.id !== data.id)); // Listeden çıkar
            setToplamHas(prev => data.tip === 'ALIS' ? prev - data.has : prev + data.has); // Bakiyeyi geri sar
            setLastTx(null); // Toast'u kapat
            return;
          }

          // YENİ İŞLEM GELDİĞİNDE (NEW_TX)
          const yeniIslem = { ...data, zaman: new Date().toLocaleTimeString('tr-TR') };
          setIslemler(prev => [yeniIslem, ...prev].slice(0, 100));
          setToplamHas(prev => data.tip === 'ALIS' ? prev + data.has : prev - data.has);
          
          // Ekranda 10 saniye görünecek Geri Al kutusu için state'e at
          setLastTx(yeniIslem); 
        } catch (_) {}
      };

      ws.onclose = () => {
        setConnected(false);
        retryRef.current = setTimeout(connect, 3000);
      };
    } catch (_) {}
  }, [url]);

  useEffect(() => {
    initialFetch();
    connect();
    return () => { clearTimeout(retryRef.current); wsRef.current?.close(); };
  }, [connect, initialFetch]);

  return { islemler, toplamHas, connected, loading, voiceState, lastTx, setLastTx };
};