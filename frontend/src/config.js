// Sunucu IP'sini localStorage'dan alır veya varsayılan olarak mevcut pencerenin IP'sini kullanır
export const getServerIP = () => {
    return localStorage.getItem('server_ip') || window.location.hostname;
};

export const API_BASE = import.meta.env.VITE_API_URL || `http://${getServerIP()}:8000`;
export const WS_BASE = import.meta.env.VITE_WS_URL || `ws://${getServerIP()}:8000/ws`;