import 'package:shared_preferences/shared_preferences.dart';

class AppConfig {
  static String _host = "192.168.122.84"; // Varsayılan IP
  static const int _port = 8000;

  static String get apiBase => "http://$_host:$_port";
  static String get wsBase => "ws://$_host:$_port/ws/audio";

  // IP'yi kaydetmek için
  static Future<void> setHost(String newHost) async {
    _host = newHost;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('server_ip', newHost);
  }

  // Kayıtlı IP'yi yüklemek için (main.dart başlangıcında çağır)
  static Future<void> loadConfig() async {
    final prefs = await SharedPreferences.getInstance();
    _host = prefs.getString('server_ip') ?? _host;
  }
}