// hooks/useSocket.js — Refaktör: odeme_tipi, kategori, adet, doviz_tutar, doviz_kuru alanları eklendi.
// mapApiIslem genişletildi; useMarket hook'u ayrıştırıldı.

import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE } from '../apiConfig';

export const useSocket = (url, dateFilter) => {
  const [islemler, setIslemler]     = useState([]);
  const [toplamHas, setToplamHas]   = useState(0);
  const [toplamTl, setToplamTl]     = useState(0);
  const [toplamUsd, setToplamUsd]   = useState(0);
  const [toplamEur, setToplamEur]   = useState(0);
  const [connected, setConnected]   = useState(false);
  const [loading, setLoading]       = useState(true);
  const [lastTx, setLastTx]         = useState(null);

  const wsRef    = useRef(null);
  const retryRef = useRef(null);
  const dateFilterRef = useRef(dateFilter);

  useEffect(() => {
    dateFilterRef.current = dateFilter;
  }, [dateFilter]);

  const filterKey = dateFilter ? JSON.stringify(dateFilter) : '';

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
    doviz_tutar:      Number(row.doviz_tutar || 0),
    doviz_kuru:       Number(row.doviz_kuru || 1),
  });

  // ── İlk veri çekimi ───────────────────────────────────────────────────────
  const initialFetch = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (dateFilter && (dateFilter.type === 'today' || dateFilter.type === 'week' || dateFilter.type === 'custom')) {
        if (dateFilter.start) params.append('start_date', dateFilter.start);
        if (dateFilter.end) params.append('end_date', dateFilter.end);
      }
      
      const res  = await fetch(`${API_BASE}/islemler?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        const normalized = data.map(mapApiIslem);
        setIslemler(normalized);
      }
    } catch (err) {
      console.error('İlk veriler çekilemedi:', err);
    } finally {
      setLoading(false);
    }
  }, [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

          // 1. İşlem silme
          if (data.type === 'UNDO_TX') {
            setIslemler(prev => prev.filter(i => i.id !== data.id));
            return;
          }

          // 2. İşlem güncelleme
          if (data.type === 'UPDATE_TX') {
            setIslemler(prev =>
              prev.map(i => i.id === data.id
                ? {
                    ...i,
                    tip:         data.tip,
                    ayar:        data.ayar,
                    miktar:      Number(data.miktar || 0),
                    adet:        Number(data.adet   || 1),
                    has:         Number(data.has    || 0),
                    odeme_tipi:  data.odeme_tipi ?? i.odeme_tipi,
                    doviz_tutar: Number(data.doviz_tutar || 0),
                    doviz_kuru:  Number(data.doviz_kuru || 1),
                    birim_fiyat: Number(data.birim_fiyat || 0),
                  }
                : i
              )
            );
            return;
          }

          // 3. Yeni işlem
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
              doviz_tutar:      Number(data.doviz_tutar || 0),
              doviz_kuru:       Number(data.doviz_kuru || 1),
              uyari:            data.uyari ?? null,
            };
            
            // Filtre uyumluluğunu kontrol et
            let matchesFilter = true;
            const currentFilter = dateFilterRef.current;
            if (currentFilter && (currentFilter.type === 'today' || currentFilter.type === 'week' || currentFilter.type === 'custom')) {
              const islemTarihi = yeniIslem.islem_tarihi?.split('T')[0];
              if (currentFilter.start && islemTarihi < currentFilter.start) matchesFilter = false;
              if (currentFilter.end && islemTarihi > currentFilter.end) matchesFilter = false;
            }
            
            if (matchesFilter) {
              setIslemler(prev => [yeniIslem, ...prev].slice(0, 100));
            }
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

  // ── Kasaları anlık ve otomatik hesapla ──────────────────────────────────────
  useEffect(() => {
    let has = 0;
    let tl = 0;
    let usd = 0;
    let eur = 0;

    islemler.forEach(i => {
      // 1. Has Altın Hesabı
      if (i.tip === 'ALIS') {
        has += i.has;
      } else {
        has -= i.has;
      }

      const tutarTl = (i.miktar || 0) * (i.birim_fiyat || 0);
      const dovizVal = Number(i.doviz_tutar || 0);

      // 2. Nakit TL, Kart, USD, EUR Kasaları
      if (i.odeme_tipi === 'NAKIT') {
        if (i.tip === 'SATIS') {
          tl += tutarTl;
        } else {
          tl -= tutarTl;
        }
      } else if (i.odeme_tipi === 'USD') {
        if (i.tip === 'SATIS') {
          usd += dovizVal;
        } else {
          usd -= dovizVal;
        }
      } else if (i.odeme_tipi === 'EUR') {
        if (i.tip === 'SATIS') {
          eur += dovizVal;
        } else {
          eur -= dovizVal;
        }
      }
    });

    setToplamHas(has);
    setToplamTl(tl);
    setToplamUsd(usd);
    setToplamEur(eur);
  }, [islemler]);

  useEffect(() => {
    initialFetch();
    connect();
    return () => {
      clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect, initialFetch]);

  return { islemler, toplamHas, toplamTl, toplamUsd, toplamEur, connected, loading, lastTx, setLastTx };
};