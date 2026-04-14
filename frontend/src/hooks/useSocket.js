// hooks/useSocket.js

import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE } from '../apiConfig'; // Merkezi ayarı import et

export const useSocket = (url) => {
  const [islemler, setIslemler]   = useState([]);
  const [toplamHas, setToplamHas] = useState(0);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading]     = useState(true);
  const [voiceState, setVoiceState] = useState({ state: 'IDLE', islem: null, mesaj: null });
  const [lastTx, setLastTx]         = useState(null); 
  
  const wsRef = useRef(null);
  const retryRef = useRef(null);

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
      // ARTIK DİNAMİK: localhost yerine API_BASE kullanılıyor
      const res = await fetch(`${API_BASE}/islemler?gunler=30&limit=15`);
      const data = await res.json();
      if (res.ok) {
        const normalized = data.map(mapApiIslem);
        setIslemler(normalized);
        setToplamHas(normalized.reduce((s, item) => item.tip === 'ALIS' ? s + item.has : s - item.has, 0));
      }
    } catch (err) {
      console.error("İlk veriler çekilemedi:", err);
    } finally { setLoading(false); }
  }, []);

  const connect = useCallback(() => {
    try {
      // wsRef varsa ve açıksa tekrar bağlanma
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => { 
        setConnected(true); 
        console.log("✅ Dashboard Soketi Bağlandı");
        clearTimeout(retryRef.current); 
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          
          // 1. ASİSTAN DURUMU (DİNLİYOR, DÜŞÜNÜYOR VB.)
          if (data.type === 'VOICE_STATE') {
            setVoiceState({ state: data.state, islem: data.islem, mesaj: data.mesaj });
            return;
          }

          // 2. İŞLEM GERİ ALMA (TABLOYU VE KASAYI ANLIK DÜZELTİR)
          if (data.type === 'UNDO_TX') {
            setIslemler(prev => prev.filter(i => i.id !== data.id)); // Listeden anında uçur
            // Kasayı tersine hesapla: Alış silindiyse çıkar, Satış silindiyse ekle
            setToplamHas(prev => data.tip === 'ALIS' ? prev - data.has : prev + data.has);
            setLastTx(null); // Eğer toast açıksa kapat
            return;
          }

          // 3. YENİ İŞLEM GELDİĞİNDE
          if (data.type === 'NEW_TX') {
            const yeniIslem = { 
              ...data, 
              ayar: data.ayar, // Backend'den gelen formatı koru
              zaman: new Date().toLocaleTimeString('tr-TR') 
            };
            setIslemler(prev => [yeniIslem, ...prev].slice(0, 100));
            setToplamHas(prev => data.tip === 'ALIS' ? prev + data.has : prev - data.has);
            setLastTx(yeniIslem); 
          }
        } catch (error) {
          console.error("Soket mesajı işleme hatası:", error);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        console.log("❌ Dashboard Soketi Kapandı, 3sn sonra tekrar denenecek...");
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

  return { islemler, toplamHas, connected, loading, voiceState, lastTx, setLastTx };
};