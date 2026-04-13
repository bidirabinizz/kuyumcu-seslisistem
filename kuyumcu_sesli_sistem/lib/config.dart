// Tüm IP ve bağlantı ayarları tek yerden yönetilir.
// Sunucu IP'si değişince sadece buraya bakman yeterli.
class AppConfig {
  static const String _host = "192.168.122.84";
  static const int _port = 8000;

  static String get apiBase => "http://$_host:$_port";
  static String get wsBase => "ws://$_host:$_port/ws/audio";
}