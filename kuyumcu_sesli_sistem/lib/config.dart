import 'dart:convert';
import 'dart:io';
import 'dart:async';
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

  // Backend'den otomatik IP çek — ÖNce UDP broadcast, sonra HTTP fallback
  static Future<String?> otomatikIpBul() async {
    // ── 1. UDP Broadcast (En hızlı yol) ──────────────────────────────────────
    final udpIp = await _udpDiscover();
    if (udpIp != null) {
      await setHost(udpIp);
      return udpIp;
    }

    // ── 2. Mevcut kaydedilmiş IP'yi HTTP ile dene ─────────────────────────────
    try {
      final response = await http
          .get(Uri.parse("http://$_host:$_port/sistem/ip"))
          .timeout(const Duration(seconds: 3));
      if (response.statusCode == 200) {
        final data  = json.decode(response.body);
        final yeniIp = data['ip'] as String?;
        if (yeniIp != null && yeniIp.isNotEmpty) return yeniIp;
      }
    } catch (_) {}

    // ── 3. Yaygın ağ geçidi IP'lerini HTTP ile dene ───────────────────────────
    final varsayilanIpler = [
      '192.168.1.1', '192.168.0.1', '192.168.122.1', '10.0.0.1', '10.0.0.2',
    ];
    for (final ip in varsayilanIpler) {
      if (ip == _host) continue;
      try {
        final response = await http
            .get(Uri.parse("http://$ip:$_port/sistem/ip"))
            .timeout(const Duration(seconds: 2));
        if (response.statusCode == 200) {
          final data   = json.decode(response.body);
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

  /// UDP broadcast ile ağdaki sunucuyu keşfeder (Python backend ile eşleşmeli)
  static Future<String?> _udpDiscover() async {
    const udpPort    = 55780;
    const broadcastMsg = 'KUYUMCU_ERP_SERVER';
    const ackPrefix    = 'KUYUMCU_ERP_ACK:';

    RawDatagramSocket? sock;
    try {
      sock = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
      sock.broadcastEnabled = true;

      // Broadcast gönder
      final bytes = broadcastMsg.codeUnits;
      sock.send(bytes, InternetAddress('255.255.255.255'), udpPort);

      // 3 saniye yanıt bekle
      final completer = Completer<String?>();
      late StreamSubscription<RawSocketEvent> sub;
      final timer = Timer(const Duration(seconds: 3), () {
        if (!completer.isCompleted) completer.complete(null);
      });

      sub = sock.listen((event) {
        if (event == RawSocketEvent.read) {
          final dg = sock!.receive();
          if (dg != null) {
            final msg = String.fromCharCodes(dg.data);
            if (msg.startsWith(ackPrefix)) {
              final ip = msg.substring(ackPrefix.length).trim();
              if (!completer.isCompleted) {
                timer.cancel();
                completer.complete(ip);
              }
            }
          }
        }
      });

      final result = await completer.future;
      await sub.cancel();
      return result;
    } catch (e) {
      print('[UDP Discovery] Hata: $e');
      return null;
    } finally {
      sock?.close();
    }
  }
}