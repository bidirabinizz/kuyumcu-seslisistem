import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;

class AppConfig {
  static String _host = "192.168.122.84"; // Varsayılan IP
  static const int _port = 8000;

  static String get apiBase => "http://$_host:$_port";
  static String get wsBase => "ws://$_host:$_port/ws/audio";
  static String get currentHost => _host;

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

  // Backend'den otomatik IP çek
  // Önce mevcut IP'yi dener, sonra yaygın ağ geçidi IP'lerini dener
  // Başarılı olursa kaydeder, olmazsa mevcut IP'yi korur
  // Dönüş: çekilen IP veya null
  static Future<String?> otomatikIpBul() async {
    // 1. ÖNCE mevcut IP'yi dene (varsayılan IP bile olsa)
    try {
      final response = await http
          .get(Uri.parse("http://$_host:$_port/sistem/ip"))
          .timeout(const Duration(seconds: 3));
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final yeniIp = data['ip'] as String?;
        if (yeniIp != null && yeniIp.isNotEmpty) {
          return yeniIp;
        }
      }
    } catch (_) {
      // Mevcut IP çalışmadı, ağ geçitlerini dene
    }

    // 2. Yaygın ağ geçidi IP'lerini dene
    final varsayilanIpler = [
      '192.168.1.1',
      '192.168.0.1',
      '192.168.122.1',
      '10.0.0.1',
      '10.0.0.2',
    ];

    for (final ip in varsayilanIpler) {
      if (ip == _host) continue; // Zaten denendi
      try {
        final response = await http
            .get(Uri.parse("http://$ip:$_port/sistem/ip"))
            .timeout(const Duration(seconds: 3));

        if (response.statusCode == 200) {
          final data = json.decode(response.body);
          final yeniIp = data['ip'] as String?;
          if (yeniIp != null && yeniIp.isNotEmpty) {
            await setHost(yeniIp);
            return yeniIp;
          }
        }
      } catch (_) {
        continue;
      }
    }

    return null;
  }
}