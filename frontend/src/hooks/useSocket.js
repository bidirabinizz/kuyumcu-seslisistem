import { useState, useEffect, useRef, useCallback } from 'react';

export const useSocket = (url) => {
  const [islemler, setIslemler]   = useState([]);
  const [toplamHas, setToplamHas] = useState(0);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const retryRef = useRef(null);

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
    connect();
    return () => {
      clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { islemler, toplamHas, connected };
};
