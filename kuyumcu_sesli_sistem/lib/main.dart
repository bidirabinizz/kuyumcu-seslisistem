import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'config.dart';
import 'kasa_screen.dart';

// ─── Hata Handler (Global, UI dışı) ─────────────────────────────────────────
Future<void> _globalFlutterHataHandler() async {
  // FlutterError (widget build hataları, binding hataları)
  FlutterError.onError = (FlutterErrorDetails details) {
    FlutterError.presentError(details); // Release modda log'a yaz
    debugPrint('[FlutterError] ${details.exceptionAsString()}');
    debugPrint(details.stack.toString());
  };
}

void main() {
  runZonedGuarded(
    () async {
      WidgetsFlutterBinding.ensureInitialized();

      // Platform hata ayarları
      await _globalFlutterHataHandler();

      // Kayıtlı IP'yi yükle ve ardından güncel sunucuyu bulmayı dene
      await AppConfig.loadConfig();
      // Her açılışta güncel sunucuyu (IP değişmiş olabilir) bul
      await AppConfig.otomatikIpBul();

      runApp(const KuyumcuApp());
    },
    // Dart Zone'dan kaçan tüm yakalanmamış istisnalar buraya düşer
    (error, stack) {
      debugPrint('[ZoneError] $error');
      debugPrint(stack.toString());
    },
  );
}

class KuyumcuApp extends StatelessWidget {
  const KuyumcuApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Çapar Kuyumculuk Kasa',
      theme: ThemeData.light().copyWith(
        primaryColor: const Color(0xFFD4AF37),
        scaffoldBackgroundColor: const Color(0xFFFCFBFA),
        colorScheme: const ColorScheme.light(
          primary: Color(0xFFD4AF37),
          secondary: Color(0xFFB8962E),
          surface: Colors.white,
          onSurface: Color(0xFF1A1A1A),
        ),
      ),
      home: const KasaScreen(),
    );
  }
}