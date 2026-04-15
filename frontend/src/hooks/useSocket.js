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
    personel_id: row.personel_id,
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
            // Tablodan ilgili satırı anında kaldır
            setIslemler(prev => prev.filter(i => i.id !== data.id));
            
            // Kasa bakiyesini tersine düzelt (Alış silindiyse çıkar, Satış silindiyse ekle)
            setToplamHas(prev => data.tip === 'ALIS' ? prev - data.has : prev + data.has);
            return;
          }

          if (data.type === 'UPDATE_TX') {
            // Tablodaki ilgili satırın verilerini anında güncelle
            setIslemler(prev => prev.map(i => {
              if (i.id === data.id) {
                return {
                  ...i,
                  tip: data.tip,
                  ayar: data.ayar,
                  miktar: Number(data.miktar || 0),
                  has: Number(data.has || 0)
                };
              }
              return i;
            }));

            // Kasa bakiyesini güncelle (Eski veriyi çıkar, yeni veriyi ekle)
            setToplamHas(prev => {
              let guncelKasa = prev;
              // Önce eski işlemi kasadan temizle
              guncelKasa = data.eski_tip === 'ALIS' ? guncelKasa - data.eski_has : guncelKasa + data.eski_has;
              // Sonra yeni/düzenlenmiş halini kasaya işle
              guncelKasa = data.tip === 'ALIS' ? guncelKasa + data.has : guncelKasa - data.has;
              return guncelKasa;
            });
            return;
          }
          // 3. YENİ İŞLEM GELDİĞİNDE
          if (data.type === 'NEW_TX') {
            const yeniIslem = { 
              id: data.id,
              tip: data.tip,
              ayar: data.ayar,
              miktar: Number(data.miktar || 0),
              has: Number(data.has || 0),
              zaman: new Date().toLocaleTimeString('tr-TR'),
              
              // 🌟 KRİTİK EKLENTİ: Filtrelemenin bu işlemi ekranda gösterebilmesi için ISO formatında tarih
              islem_tarihi: new Date().toISOString(), 
              
              personel_id: data.personel_id,
              personel_ad_soyad: data.personel_ad_soyad || 'Sistem / Manuel',
              birim_fiyat: Number(data.birim_fiyat || 0)
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