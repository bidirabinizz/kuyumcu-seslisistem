import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import 'models/personel.dart';
import 'voice_service.dart';
import 'config.dart'; // IP tek yerden yönetiliyor

void main() {
  runApp(const KuyumcuApp());
}

class KuyumcuApp extends StatelessWidget {
  const KuyumcuApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Çapar Kuyumculuk',
      theme: ThemeData.dark().copyWith(
        primaryColor: const Color(0xFFD4AF37),
        scaffoldBackgroundColor: Colors.black,
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFFD4AF37),
          secondary: Color(0xFFD4AF37),
        ),
      ),
      home: const VoiceControlPage(),
    );
  }
}

class VoiceControlPage extends StatefulWidget {
  const VoiceControlPage({super.key});

  @override
  State<VoiceControlPage> createState() => _VoiceControlPageState();
}

class _VoiceControlPageState extends State<VoiceControlPage>
    with WidgetsBindingObserver {
  // VoiceService artık dispose edilebilir
  late final VoiceService _voiceService;

  List<Personel> _personeller = [];
  Personel? _secilenPersonel;
  bool _isActive = false;
  bool _isLoading = true;
  bool _hasError = false;

  // Durum metni: sunucudan gelen son mesaj
  String _statusMessage = "BAŞLATMAK İÇİN DOKUNUN";

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _voiceService = VoiceService(
      // Sunucudan gelen durum metinlerini UI'ya yansıt
      onStatusChanged: (msg) {
        if (mounted) setState(() => _statusMessage = msg);
      },
      // Bağlantı kopunca UI'yı güncelle
      onDisconnected: () {
        if (mounted) {
          setState(() => _isActive = false);
          _showSnack("Sunucu bağlantısı kesildi, tekrar deneyin.");
        }
      },
    );
    _personelleriGetir();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _voiceService.dispose(); // bellek sızıntısı engellendi
    super.dispose();
  }

  // Uygulama arka plana alınınca sistemi durdur
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused && _isActive) {
      _sistemDurdur();
    }
  }

  Future<void> _personelleriGetir() async {
    setState(() {
      _isLoading = true;
      _hasError = false;
    });
    try {
      final response = await http
          .get(Uri.parse("${AppConfig.apiBase}/personeller"))
          .timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final List data = json.decode(response.body);
        if (mounted) {
          setState(() {
            _personeller = data.map((p) => Personel.fromJson(p)).toList();
            _isLoading = false;
          });
        }
      } else {
        _handleLoadError("Sunucu hata döndürdü: ${response.statusCode}");
      }
    } catch (e) {
      _handleLoadError("Sunucuya bağlanılamadı. IP: ${AppConfig.apiBase}");
    }
  }

  void _handleLoadError(String msg) {
    if (mounted) {
      setState(() {
        _isLoading = false;
        _hasError = true;
      });
      _showSnack(msg);
    }
  }

  void _showSnack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: Colors.red[900],
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Future<void> _toggleSistem() async {
    if (_secilenPersonel == null) return;

    if (_isActive) {
      _sistemDurdur();
    } else {
      await _sistemBaslat();
    }
  }

  Future<void> _sistemBaslat() async {
    final basarili =
        await _voiceService.startStreaming(_secilenPersonel!.id);
    if (basarili && mounted) {
      setState(() {
        _isActive = true;
        _statusMessage = "SİSTEM DİNLİYOR...";
      });
    } else {
      _showSnack("Mikrofon izni alınamadı veya bağlantı kurulamadı.");
    }
  }

  void _sistemDurdur() {
    _voiceService.stopStreaming();
    if (mounted) {
      setState(() {
        _isActive = false;
        _statusMessage = "BAŞLATMAK İÇİN DOKUNUN";
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        width: double.infinity,
        decoration: BoxDecoration(
          gradient: RadialGradient(
            center: Alignment.center,
            radius: 1.5,
            colors: [Colors.grey[900]!, Colors.black],
          ),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 30),
        child: _isLoading
            ? const Center(
                child: CircularProgressIndicator(
                  color: Color(0xFFD4AF37),
                ),
              )
            : _hasError
                ? _buildHataEkrani()
                : _buildIcerik(),
      ),
    );
  }

  Widget _buildHataEkrani() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.wifi_off, color: Colors.red, size: 60),
          const SizedBox(height: 20),
          const Text(
            "Sunucuya Bağlanılamadı",
            style: TextStyle(color: Colors.white, fontSize: 18),
          ),
          const SizedBox(height: 8),
          Text(
            AppConfig.apiBase,
            style: const TextStyle(color: Colors.white54, fontSize: 12),
          ),
          const SizedBox(height: 30),
          TextButton.icon(
            onPressed: _personelleriGetir,
            icon: const Icon(Icons.refresh, color: Color(0xFFD4AF37)),
            label: const Text(
              "Tekrar Dene",
              style: TextStyle(color: Color(0xFFD4AF37)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildIcerik() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Text(
          "ÇAPAR KUYUMCULUK",
          style: TextStyle(
            color: Color(0xFFD4AF37),
            fontSize: 28,
            fontWeight: FontWeight.bold,
            letterSpacing: 3,
          ),
        ),
        const SizedBox(height: 12),
        Container(
          height: 1,
          width: 100,
          color: const Color(0xFFD4AF37).withValues(alpha: 0.5),
        ),
        const SizedBox(height: 60),

        // PERSONEL SEÇİMİ
        const Text(
          "İŞLEM YAPAN PERSONEL",
          style: TextStyle(
            color: Color.fromARGB(139, 255, 255, 255),
            fontSize: 12,
            letterSpacing: 1.5,
          ),
        ),
        const SizedBox(height: 15),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 5),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(15),
            border: Border.all(
              color: const Color(0xFFD4AF37).withValues(alpha: 0.4),
            ),
            color: Colors.black.withValues(alpha: 0.3),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<Personel>(
              value: _secilenPersonel,
              hint: const Text(
                "İsminizi Seçin",
                style: TextStyle(color: Colors.white70),
              ),
              isExpanded: true,
              dropdownColor: Colors.grey[900],
              icon: const Icon(
                Icons.keyboard_arrow_down,
                color: Color(0xFFD4AF37),
              ),
              items: _personeller.map((Personel p) {
                return DropdownMenuItem<Personel>(
                  value: p,
                  child: Text(
                    p.adSoyad,
                    style: const TextStyle(color: Colors.white),
                  ),
                );
              }).toList(),
              onChanged: _isActive
                  ? null // Sistem aktifken personel değiştirmeyi engelle
                  : (val) {
                      setState(() => _secilenPersonel = val);
                    },
            ),
          ),
        ),

        const SizedBox(height: 80),

        if (_secilenPersonel != null) ...[
          GestureDetector(
            onTap: _toggleSistem,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              width: 200,
              height: 200,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _isActive
                    ? Colors.red.withValues(alpha: 0.1)
                    : Colors.green.withValues(alpha: 0.1),
                border: Border.all(
                  color: _isActive ? Colors.red : Colors.green,
                  width: 4,
                ),
                boxShadow: [
                  BoxShadow(
                    color: _isActive
                        ? Colors.red.withValues(alpha: 0.4)
                        : Colors.green.withValues(alpha: 0.4),
                    blurRadius: _isActive ? 40 : 15,
                    spreadRadius: 5,
                  ),
                ],
              ),
              child: Icon(
                _isActive ? Icons.mic : Icons.mic_none,
                size: 80,
                color: _isActive ? Colors.red : Colors.green,
              ),
            ),
          ),
          const SizedBox(height: 40),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 200),
            child: Text(
              _statusMessage,
              key: ValueKey(_statusMessage),
              style: TextStyle(
                color: _isActive ? Colors.red : Colors.green,
                fontWeight: FontWeight.bold,
                fontSize: 16,
                letterSpacing: 1.5,
              ),
            ),
          ),
        ] else
          const Opacity(
            opacity: 0.5,
            child: Text(
              "Lütfen listeden personelinizi seçerek\nsistemi aktif hale getirin.",
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white70, height: 1.5),
            ),
          ),
      ],
    );
  }
}