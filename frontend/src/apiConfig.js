// src/apiConfig.js

// Kullanıcının Ayarlar sayfasından girdiği IP'yi alır 
// Eğer henüz girilmemişse, tarayıcıda yazan adresi (hostname) varsayılan kabul eder.
export const getServerIP = () => {
  return localStorage.getItem('server_ip') || window.location.hostname;
};

// Backend'e gidecek HTTP ve WebSocket adresleri
export const API_BASE = `http://${getServerIP()}:8000`;
export const WS_BASE = `ws://${getServerIP()}:8000/ws`;