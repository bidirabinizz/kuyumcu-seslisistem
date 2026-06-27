import 'package:shared_preferences/shared_preferences.dart';

class AppConfig {
  static String _host = "sistem.caparkuyumculuk.com"; 

  static String get apiBase => "https://$_host/api";
  static String get wsBase => "wss://$_host/api/ws";
  static String get currentHost => _host;

  // IP'yi kaydetmek için (Eski altyapıdan kalan uyumluluk)
  static Future<void> setHost(String newHost) async {
    _host = newHost;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('server_ip', newHost);
  }

  // Kayıtlı IP'yi yüklemek için (main.dart başlangıcında çağır)
  static Future<void> loadConfig() async {
    final prefs = await SharedPreferences.getInstance();
    String? saved = prefs.getString('server_ip');
    // Sadece domain formatındaysa veya kullanıcı özel bir IP girdiyse ezmesine izin ver.
    // Şimdilik bulut sunucumuz sabit olduğu için direkt domaini kullanıyoruz.
    if (saved != null && saved.isNotEmpty) {
        // _host = saved; // Gerekirse ileride açabiliriz
    }
  }

  // Backend'den otomatik IP çek — Artık VDS üzerinde olduğumuz için devre dışı
  static Future<String?> otomatikIpBul() async {
    return _host;
  }
}