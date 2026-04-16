// hooks/useSocket.js — Refaktör: odeme_tipi, kategori, adet alanları eklendi.
// mapApiIslem genişletildi; useMarket hook'u ayrıştırıldı.

import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE } from '../apiConfig';

export const useSocket = (url) => {
  const [islemler, setIslemler]     = useState([]);
  const [toplamHas, setToplamHas]   = useState(0);
  const [connected, setConnected]   = useState(false);
  const [loading, setLoading]       = useState(true);
  const [voiceState, setVoiceState] = useState({ state: 'IDLE', islem: null, mesaj: null });
  const [lastTx, setLastTx]         = useState(null);

  const wsRef    = useRef(null);
  const retryRef = useRef(null);

  // ── API yanıtını normalize eden fonksiyon ──────────────────────────────────
  const mapApiIslem = (row) => ({
    id:               row.id,
    tip:              row.islem_tipi,
    ayar:             row.urun_cinsi,
    kategori:         row.urun_kategorisi  ?? 'ALTIN',
    birim:            row.islem_birimi     ?? 'GRAM',
    odeme_tipi:       row.odeme_tipi       ?? 'NAKIT',
    adet:             row.adet             ?? 1,
    miktar:           Number(row.brut_miktar || 0),
    has:              Number(row.net_has_miktar || 0),
    zaman:            row.islem_tarihi
      ? new Date(row.islem_tarihi).toLocaleTimeString('tr-TR')
      : '—',
    islem_tarihi:     row.islem_tarihi,
    personel_ad_soyad: row.personel_ad_soyad,
    personel_id:      row.personel_id,
    birim_fiyat:      Number(row.birim_fiyat || 0),
  });

  // ── İlk veri çekimi ───────────────────────────────────────────────────────
  const initialFetch = useCallback(async () => {
    try {
      setLoading(true);
      const res  = await fetch(`${API_BASE}/islemler?gunler=30&limit=15`);
      const data = await res.json();
      if (res.ok) {
        const normalized = data.map(mapApiIslem);
        setIslemler(normalized);
        setToplamHas(
          normalized.reduce((s, i) => i.tip === 'ALIS' ? s + i.has : s - i.has, 0)
        );
      }
    } catch (err) {
      console.error('İlk veriler çekilemedi:', err);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── WebSocket bağlantısı ──────────────────────────────────────────────────
  const connect = useCallback(() => {
    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        console.log('✅ Dashboard Soketi Bağlandı');
        clearTimeout(retryRef.current);
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);

          // 1. Ses asistanı durum güncellemesi
          if (data.type === 'VOICE_STATE') {
            setVoiceState({ state: data.state, islem: data.islem, mesaj: data.mesaj });
            return;
          }

          // 2. İşlem silme
          if (data.type === 'UNDO_TX') {
            setIslemler(prev => prev.filter(i => i.id !== data.id));
            setToplamHas(prev =>
              data.tip === 'ALIS' ? prev - data.has : prev + data.has
            );
            return;
          }

          // 3. İşlem güncelleme
          if (data.type === 'UPDATE_TX') {
            setIslemler(prev =>
              prev.map(i => i.id === data.id
                ? {
                    ...i,
                    tip:       data.tip,
                    ayar:      data.ayar,
                    miktar:    Number(data.miktar || 0),
                    adet:      Number(data.adet   || 1),
                    has:       Number(data.has    || 0),
                    odeme_tipi: data.odeme_tipi ?? i.odeme_tipi,
                  }
                : i
              )
            );
            setToplamHas(prev => {
              let g = prev;
              g = data.eski_tip === 'ALIS' ? g - data.eski_has : g + data.eski_has;
              g = data.tip      === 'ALIS' ? g + data.has      : g - data.has;
              return g;
            });
            return;
          }

          // 4. Yeni işlem
          if (data.type === 'NEW_TX') {
            const yeniIslem = {
              id:               data.id,
              tip:              data.tip,
              ayar:             data.ayar,
              kategori:         data.kategori   ?? 'ALTIN',
              birim:            data.birim      ?? 'GRAM',
              odeme_tipi:       data.odeme_tipi ?? 'NAKIT',
              adet:             data.adet       ?? 1,
              miktar:           Number(data.miktar || 0),
              has:              Number(data.has    || 0),
              zaman:            new Date().toLocaleTimeString('tr-TR'),
              islem_tarihi:     new Date().toISOString(),
              personel_id:      data.personel_id,
              personel_ad_soyad: data.personel_ad_soyad || 'Sistem / Manuel',
              birim_fiyat:      Number(data.birim_fiyat || 0),
              uyari:            data.uyari ?? null,
            };
            setIslemler(prev => [yeniIslem, ...prev].slice(0, 100));
            setToplamHas(prev =>
              data.tip === 'ALIS' ? prev + data.has : prev - data.has
            );
            setLastTx(yeniIslem);
          }
        } catch (err) {
          console.error('Soket mesajı işleme hatası:', err);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        console.log('❌ Dashboard Soketi Kapandı, 3sn sonra tekrar denenecek...');
        retryRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    } catch (_) {}
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

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