import 'dart:convert';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

import 'models/personel.dart';
import 'voice_service.dart';
import 'config.dart';

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
        scaffoldBackgroundColor: const Color(0xFF0A0A0A),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFFD4AF37),
          secondary: Color(0xFFB8962E),
          surface: Color(0xFF111111),
        ),
      ),
      home: const VoiceControlPage(),
    );
  }
}

// ─── Mod Enum ───────────────────────────────────────────────────────────────
enum MikrofonModu { toggle, hold }

// ─── Ana Sayfa ───────────────────────────────────────────────────────────────
class VoiceControlPage extends StatefulWidget {
  const VoiceControlPage({super.key});

  @override
  State<VoiceControlPage> createState() => _VoiceControlPageState();
}

class _VoiceControlPageState extends State<VoiceControlPage>
    with WidgetsBindingObserver, TickerProviderStateMixin {
  late final VoiceService _voiceService;

  List<Personel> _personeller = [];
  Personel? _secilenPersonel;
  bool _isActive = false;
  bool _isLoading = true;
  bool _hasError = false;
  bool _isHoldPressed = false;

  MikrofonModu _mod = MikrofonModu.toggle;

  String _statusMessage = "BAŞLATMAK İÇİN DOKUNUN";

  // Animasyon kontrolcüleri
  late AnimationController _pulseController;
  late AnimationController _rippleController;
  late AnimationController _fadeController;
  late Animation<double> _pulseAnimation;
  late Animation<double> _rippleAnimation;
  late Animation<double> _fadeAnimation;

  // Ses seviyesi simülasyonu
  double _voiceLevel = 0.0;
  Timer? _voiceLevelTimer;
  double _amplitude  = 0.0;

  // İşlem önizleme (sesli komut algılandığında)
  IslemPreview? _commandPreview;

  // Yeniden bağlanma bilgisi
  String? _reconnectInfo;
@override
void initState() {
  super.initState();
  _initAnimations();
  AppConfig.loadConfig().then((_) => _personelleriGetir());
  WidgetsBinding.instance.addObserver(this);

  _voiceService = VoiceService(
    onStatusChanged: (msg) {
      if (mounted) setState(() => _statusMessage = msg);
    },
    onDisconnected: () {
      if (mounted) {
        setState(() {
          _isActive = false;
          _isHoldPressed = false;
          _commandPreview = null;
          _reconnectInfo = null;
        });
        _stopAnimations();
        _showSnack('Sunucu bağlantısı kesildi.');
      }
    },
    onAmplitudeChanged: (amp) {
      if (mounted) setState(() => _amplitude = amp);
    },
    onCommandPreview: (preview) {
      if (mounted) setState(() => _commandPreview = preview);
    },
    onReconnectAttempt: (attempt, nextRetry) {
      if (mounted) {
        setState(() {
          _reconnectInfo = 'Yeniden bağlanıyor... (#$attempt, ${nextRetry.inSeconds}sn)';
        });
      }
    },
  );
}

  void _initAnimations() {
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );
    _rippleController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2000),
    );
    _fadeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
    );

    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.08).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
    _rippleAnimation = Tween<double>(begin: 0.85, end: 1.3).animate(
      CurvedAnimation(parent: _rippleController, curve: Curves.easeOut),
    );
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _fadeController, curve: Curves.easeIn),
    );

    _fadeController.forward();
  }

  void _startAnimations() {
    _pulseController.repeat(reverse: true);
    _rippleController.repeat();
    _voiceLevelTimer = Timer.periodic(const Duration(milliseconds: 150), (_) {
      if (mounted && _isActive) {
        setState(() {
          _voiceLevel = (0.3 + (DateTime.now().millisecond % 100) / 140).clamp(0.0, 1.0);
        });
      }
    });
  }

  void _stopAnimations() {
    _pulseController.stop();
    _pulseController.reset();
    _rippleController.stop();
    _rippleController.reset();
    _voiceLevelTimer?.cancel();
    if (mounted) {
      setState(() {
        _voiceLevel = 0.0;
        _commandPreview = null;
        _reconnectInfo  = null;
      });
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pulseController.dispose();
    _rippleController.dispose();
    _fadeController.dispose();
    _voiceLevelTimer?.cancel();
    _voiceService.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused && _isActive) {
      _sistemDurdur();
    }
  }

  // ─── Veri Yükleme ─────────────────────────────────────────────────────────
  Future<void> _personelleriGetir() async {
    setState(() {
      _isLoading = true;
      _hasError = false;
      _secilenPersonel = null;
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
      _handleLoadError("Bağlantı hatası — ${AppConfig.apiBase}");
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
        content: Row(
          children: [
            const Icon(Icons.error_outline, color: Colors.white, size: 18),
            const SizedBox(width: 10),
            Expanded(child: Text(msg, style: const TextStyle(fontSize: 13))),
          ],
        ),
        backgroundColor: const Color(0xFF8B1A1A),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        margin: const EdgeInsets.all(16),
      ),
    );
  }

  // ─── Toggle Modu ──────────────────────────────────────────────────────────
  Future<void> _toggleSistem() async {
    if (_secilenPersonel == null || _mod != MikrofonModu.toggle) return;
    HapticFeedback.mediumImpact();

    if (_isActive) {
      _sistemDurdur();
    } else {
      await _sistemBaslat();
    }
  }

  Future<void> _sistemBaslat() async {
    final basarili = await _voiceService.startStreaming(_secilenPersonel!.id);
    if (basarili && mounted) {
      setState(() {
        _isActive = true;
        _statusMessage = "DİNLİYOR...";
      });
      _startAnimations();
    } else {
      _showSnack("Mikrofon izni alınamadı veya bağlantı kurulamadı.");
    }
  }

  void _sistemDurdur() {
    _voiceService.stopStreaming();
    _stopAnimations();
    if (mounted) {
      setState(() {
        _isActive = false;
        _isHoldPressed = false;
        _statusMessage = _mod == MikrofonModu.toggle
            ? "BAŞLATMAK İÇİN DOKUNUN"
            : "KONUŞMAK İÇİN BASILI TUTUN";
      });
    }
  }

  // ─── Hold Modu ────────────────────────────────────────────────────────────
  Future<void> _holdBaslat() async {
    if (_secilenPersonel == null || _mod != MikrofonModu.hold || _isHoldPressed) return;
    HapticFeedback.mediumImpact();
    setState(() => _isHoldPressed = true);
    await _sistemBaslat();
  }

  void _holdBirak() {
    if (_mod != MikrofonModu.hold || !_isHoldPressed) return;
    HapticFeedback.lightImpact();
    _sistemDurdur();
  }

  // ─── IP Ayarları ──────────────────────────────────────────────────────────
  void _ipAyarlari() {
    final currentIp = RegExp(r"\d+\.\d+\.\d+\.\d+").stringMatch(AppConfig.apiBase) ?? "";
    final controller = TextEditingController(text: currentIp);
    bool isSearching = false;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => Dialog(
          backgroundColor: const Color(0xFF111111),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: BorderSide(color: const Color(0xFFD4AF37).withOpacity(0.3)),
          ),
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.dns_outlined, color: Color(0xFFD4AF37), size: 20),
                    const SizedBox(width: 10),
                    const Text(
                      "SUNUCU AYARLARI",
                      style: TextStyle(
                        color: Color(0xFFD4AF37),
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 2,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                const Text(
                  "Sunucu IP Adresi",
                  style: TextStyle(color: Colors.white54, fontSize: 12, letterSpacing: 1),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: controller,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  style: const TextStyle(color: Colors.white, fontFamily: 'monospace'),
                  decoration: InputDecoration(
                    hintText: "192.168.1.15",
                    hintStyle: const TextStyle(color: Colors.white24),
                    filled: true,
                    fillColor: Colors.black.withOpacity(0.4),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide(color: const Color(0xFFD4AF37).withOpacity(0.3)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: Color(0xFFD4AF37)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide(color: Colors.white.withOpacity(0.1)),
                    ),
                    prefixIcon: const Icon(Icons.router_outlined, color: Color(0xFFD4AF37), size: 18),
                  ),
                ),
                const SizedBox(height: 16),
                // Otomatik Bul Butonu
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: isSearching
                        ? null
                        : () async {
                            setDialogState(() => isSearching = true);
                            final ip = await AppConfig.otomatikIpBul();
                            if (context.mounted) {
                              setDialogState(() => isSearching = false);
                              if (ip != null) {
                                controller.text = ip;
                                _showSnack("Sunucu bulundu: $ip");
                              } else {
                                _showSnack("Sunucu bulunamadı, IP'yi manuel girin.");
                              }
                            }
                          },
                    style: OutlinedButton.styleFrom(
                      side: BorderSide(color: const Color(0xFFD4AF37).withOpacity(0.5)),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    icon: isSearching
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Color(0xFFD4AF37),
                            ),
                          )
                        : const Icon(Icons.search_rounded, color: Color(0xFFD4AF37), size: 18),
                    label: Text(
                      isSearching ? "ARANIYOR..." : "OTOMATİK BUL",
                      style: const TextStyle(
                        color: Color(0xFFD4AF37),
                        letterSpacing: 1,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => Navigator.pop(context),
                        style: OutlinedButton.styleFrom(
                          side: BorderSide(color: Colors.white.withOpacity(0.2)),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                        child: const Text("İPTAL", style: TextStyle(color: Colors.white54, letterSpacing: 1, fontSize: 12)),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () async {
                          final input = controller.text.trim();
                          if (RegExp(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$").hasMatch(input)) {
                            await AppConfig.setHost(input);
                            if (mounted) {
                              Navigator.pop(context);
                              _personelleriGetir();
                            }
                          } else {
                            _showSnack("Lütfen geçerli bir IP adresi girin (Örn: 192.168.1.10)");
                          }
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFFD4AF37),
                          foregroundColor: Colors.black,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          elevation: 0,
                        ),
                        child: const Text("KAYDET", style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: 1, fontSize: 12)),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ── Premium Çok Katmanlı Ses Halkası ────────────────────────────────────────
  Widget _buildWaveEffect() {
    return CustomPaint(
      size: const Size(280, 280),
      painter: _WaveRingsPainter(
        amplitude: _amplitude,
        animation: _rippleAnimation,
      ),
    );
  }

  // ── İşlem Önizleme Kartı ─────────────────────────────────────────────────────
  Widget _buildCommandPreview() {
    final p = _commandPreview!;
    final renkAlis  = const Color(0xFF34D399); // Yeşil — alış
    final renkSatis = const Color(0xFFF87171); // Kırmızı — satış
    final renkKart  = const Color(0xFF60A5FA); // Mavi — kart
    final renk      = p.islemTipi == 'ALIS' ? renkAlis : renkSatis;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeOutCubic,
      margin: const EdgeInsets.symmetric(horizontal: 4),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        color: Colors.white.withOpacity(0.06),
        border: Border.all(color: renk.withOpacity(0.4), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: renk.withOpacity(0.12),
            blurRadius: 20,
            spreadRadius: 2,
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8),
                  color: renk.withOpacity(0.18),
                  border: Border.all(color: renk.withOpacity(0.5)),
                ),
                child: Text(
                  p.islemTipi == 'ALIS' ? '↑ ALIŞ' : '↓ SATIŞ',
                  style: TextStyle(
                    color: renk,
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.5,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              if (p.odemeTipi == 'KART')
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(8),
                    color: renkKart.withOpacity(0.15),
                    border: Border.all(color: renkKart.withOpacity(0.4)),
                  ),
                  child: Text(
                    '💳 KART',
                    style: TextStyle(
                      color: renkKart,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1,
                    ),
                  ),
                )
              else
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(8),
                    color: const Color(0xFF34D399).withOpacity(0.12),
                    border: Border.all(color: const Color(0xFF34D399).withOpacity(0.35)),
                  ),
                  child: const Text(
                    '💵 NAKİT',
                    style: TextStyle(
                      color: Color(0xFF34D399),
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1,
                    ),
                  ),
                ),
              const Spacer(),
              // Yanıp sönen onay göstergesi
              Container(
                width: 7, height: 7,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: renk,
                  boxShadow: [
                    BoxShadow(color: renk.withOpacity(0.7), blurRadius: 8)
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            p.ozet,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.5,
              height: 1.3,
            ),
          ),
          if (p.netHas > 0) ...
            [
              const SizedBox(height: 6),
              Text(
                '≈ ${p.netHas.toStringAsFixed(4)} gr has altın',
                style: TextStyle(
                  color: const Color(0xFFD4AF37).withOpacity(0.7),
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          if (p.uyari != null) ...
            [
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8),
                  color: const Color(0xFFFBBF24).withOpacity(0.15),
                  border: Border.all(color: const Color(0xFFFBBF24).withOpacity(0.4)),
                ),
                child: Row(
                  children: [
                    const Text('⚠️', style: TextStyle(fontSize: 13)),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        p.uyari!,
                        style: const TextStyle(
                          color: Color(0xFFFBBF24),
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          const SizedBox(height: 10),
          Text(
            'Onaylamak için "EVET", iptal için "HAYIR" deyin',
            style: TextStyle(
              color: Colors.white.withOpacity(0.35),
              fontSize: 10,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }

  // ─── BUILD ─────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0A),
      body: Stack(
        children: [
          // Arka plan dokusu
          _buildBackground(),
          // İçerik
          SafeArea(
            child: FadeTransition(
              opacity: _fadeAnimation,
              child: Column(
                children: [
                  _buildTopBar(),
                  Expanded(
                    child: _isLoading
                        ? _buildYuklemeEkrani()
                        : _hasError
                            ? _buildHataEkrani()
                            : _buildIcerik(),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBackground() {
    return Positioned.fill(
      child: CustomPaint(
        painter: _BackgroundPainter(),
      ),
    );
  }

  Widget _buildTopBar() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Logo / Marka
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 6,
                    height: 6,
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      color: Color(0xFFD4AF37),
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Text(
                    "ÇAPAR",
                    style: TextStyle(
                      color: Color(0xFFD4AF37),
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 4,
                    ),
                  ),
                ],
              ),
              const Padding(
                padding: EdgeInsets.only(left: 14),
                child: Text(
                  "KUYUMCULUK",
                  style: TextStyle(
                    color: Colors.white24,
                    fontSize: 8,
                    letterSpacing: 3.5,
                  ),
                ),
              ),
            ],
          ),
          // Sağ üst ikonlar
          Row(
            children: [
              // Bağlantı durumu indikatörü
              if (!_isLoading)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(20),
                    color: _hasError
                        ? Colors.red.withOpacity(0.15)
                        : const Color(0xFFD4AF37).withOpacity(0.1),
                    border: Border.all(
                      color: _hasError
                          ? Colors.red.withOpacity(0.4)
                          : const Color(0xFFD4AF37).withOpacity(0.3),
                    ),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 5,
                        height: 5,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: _hasError ? Colors.red : const Color(0xFFD4AF37),
                        ),
                      ),
                      const SizedBox(width: 5),
                      Text(
                        _hasError ? "BAĞLANTI YOK" : "BAĞLI",
                        style: TextStyle(
                          color: _hasError ? Colors.red : const Color(0xFFD4AF37),
                          fontSize: 9,
                          letterSpacing: 1,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(width: 8),
              IconButton(
                icon: const Icon(Icons.settings_outlined, color: Colors.white38, size: 20),
                onPressed: _ipAyarlari,
                splashRadius: 20,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildYuklemeEkrani() {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 36,
            height: 36,
            child: CircularProgressIndicator(
              color: Color(0xFFD4AF37),
              strokeWidth: 2,
            ),
          ),
          SizedBox(height: 20),
          Text(
            "BAĞLANIYOR...",
            style: TextStyle(
              color: Colors.white24,
              fontSize: 11,
              letterSpacing: 3,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHataEkrani() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.red.withOpacity(0.08),
              border: Border.all(color: Colors.red.withOpacity(0.3)),
            ),
            child: const Icon(Icons.wifi_off_rounded, color: Colors.red, size: 44),
          ),
          const SizedBox(height: 28),
          const Text(
            "SUNUCUYA BAĞLANILAMADI",
            style: TextStyle(
              color: Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.bold,
              letterSpacing: 2,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            AppConfig.apiBase,
            style: const TextStyle(color: Colors.white24, fontSize: 12, fontFamily: 'monospace'),
          ),
          const SizedBox(height: 32),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _GoldButton(
                onPressed: _personelleriGetir,
                icon: Icons.refresh_rounded,
                label: "TEKRAR DENE",
                outlined: true,
              ),
              const SizedBox(width: 12),
              _GoldButton(
                onPressed: _ipAyarlari,
                icon: Icons.settings_outlined,
                label: "AYARLAR",
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildIcerik() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 28),
      child: Column(
        children: [
          const SizedBox(height: 8),
          _buildPersonelSecimi(),
          const SizedBox(height: 24),
          _buildModSecimi(),
          const Spacer(),
          _buildMikrofonAlani(),
          const Spacer(),
          _buildAltBilgi(),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _buildPersonelSecimi() {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: Colors.white.withOpacity(0.03),
        border: Border.all(color: Colors.white.withOpacity(0.07)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
            child: Row(
              children: [
                Icon(Icons.person_outline, color: Colors.white.withOpacity(0.3), size: 14),
                const SizedBox(width: 7),
                Text(
                  "PERSONEL",
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.3),
                    fontSize: 10,
                    letterSpacing: 2,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          DropdownButtonHideUnderline(
            child: DropdownButton<Personel>(
              value: _secilenPersonel,
              hint: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  "İsminizi seçin...",
                  style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 15),
                ),
              ),
              isExpanded: true,
              dropdownColor: const Color(0xFF161616),
              icon: Padding(
                padding: const EdgeInsets.only(right: 14),
                child: Icon(
                  Icons.keyboard_arrow_down_rounded,
                  color: const Color(0xFFD4AF37).withOpacity(0.7),
                ),
              ),
              items: _personeller.map((Personel p) {
                return DropdownMenuItem<Personel>(
                  value: p,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      children: [
                        Container(
                          width: 28,
                          height: 28,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: const Color(0xFFD4AF37).withOpacity(0.15),
                          ),
                          child: Center(
                            child: Text(
                              p.adSoyad.isNotEmpty ? p.adSoyad[0] : "?",
                              style: const TextStyle(
                                color: Color(0xFFD4AF37),
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Text(
                          p.adSoyad,
                          style: const TextStyle(color: Colors.white, fontSize: 15),
                        ),
                      ],
                    ),
                  ),
                );
              }).toList(),
              onChanged: _isActive
                  ? null
                  : (val) => setState(() => _secilenPersonel = val),
            ),
          ),
          const SizedBox(height: 10),
        ],
      ),
    );
  }

  Widget _buildModSecimi() {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: Colors.white.withOpacity(0.03),
        border: Border.all(color: Colors.white.withOpacity(0.07)),
      ),
      child: Row(
        children: [
          _ModButon(
            label: "TOGGLE",
            subtitle: "Aç / Kapat",
            icon: Icons.toggle_on_outlined,
            aktif: _mod == MikrofonModu.toggle,
            disabled: _isActive,
            onTap: () {
              if (!_isActive) {
                setState(() {
                  _mod = MikrofonModu.toggle;
                  _statusMessage = "BAŞLATMAK İÇİN DOKUNUN";
                });
              }
            },
          ),
          _ModButon(
            label: "HOLD",
            subtitle: "Basılı Tut",
            icon: Icons.touch_app_outlined,
            aktif: _mod == MikrofonModu.hold,
            disabled: _isActive,
            onTap: () {
              if (!_isActive) {
                setState(() {
                  _mod = MikrofonModu.hold;
                  _statusMessage = "KONUŞMAK İÇİN BASILI TUTUN";
                });
              }
            },
          ),
        ],
      ),
    );
  }

  Widget _buildMikrofonAlani() {
    if (_secilenPersonel == null) {
      return Column(
        children: [
          Container(
            width: 180,
            height: 180,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white.withOpacity(0.02),
              border: Border.all(color: Colors.white.withOpacity(0.06), width: 2),
            ),
            child: Icon(
              Icons.mic_none_rounded,
              size: 60,
              color: Colors.white.withOpacity(0.1),
            ),
          ),
          const SizedBox(height: 28),
          Text(
            "Lütfen personel seçin",
            style: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 14, letterSpacing: 0.5),
          ),
        ],
      );
    }

    return Column(
      children: [
        if (_mod == MikrofonModu.toggle)
          _buildToggleButon()
        else
          _buildHoldButon(),
        const SizedBox(height: 24),
        _buildDurumMetni(),
        const SizedBox(height: 16),
        // İşlem önizleme alanı
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 350),
          transitionBuilder: (child, anim) => FadeTransition(
            opacity: anim,
            child: SizeTransition(sizeFactor: anim, axisAlignment: -1, child: child),
          ),
          child: _commandPreview != null
              ? Padding(
                  key: ValueKey(_commandPreview!.ozet),
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _buildCommandPreview(),
                )
              : const SizedBox.shrink(key: ValueKey('empty')),
        ),
        if (_isActive && _commandPreview == null) _buildSesGostergesi(),
      ],
    );
  }

  Widget _buildToggleButon() {
    return GestureDetector(
      onTap: _toggleSistem,
      child: AnimatedBuilder(
        animation: Listenable.merge([_pulseAnimation, _rippleAnimation]),
        builder: (context, child) {
          return Stack(
            alignment: Alignment.center,
            children: [
              // Dış ripple halkası
              if (_isActive) _buildWaveEffect(),
                
              // Ana buton
              Transform.scale(
                scale: _isActive ? _pulseAnimation.value : 1.0,
                child: Container(
                  width: 180,
                  height: 180,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: _isActive
                        ? const Color(0xFFD4AF37).withOpacity(0.12)
                        : Colors.white.withOpacity(0.04),
                    border: Border.all(
                      color: _isActive
                          ? const Color(0xFFD4AF37)
                          : Colors.white.withOpacity(0.15),
                      width: _isActive ? 2.5 : 1.5,
                    ),
                    boxShadow: _isActive
                        ? [
                            BoxShadow(
                              color: const Color(0xFFD4AF37).withOpacity(0.25),
                              blurRadius: 40,
                              spreadRadius: 8,
                            ),
                          ]
                        : [],
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        _isActive ? Icons.mic_rounded : Icons.mic_none_rounded,
                        size: 64,
                        color: _isActive
                            ? const Color(0xFFD4AF37)
                            : Colors.white.withOpacity(0.5),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _isActive ? "DURDURMAK\nİÇİN DOKUN" : "BAŞLAT",
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: _isActive
                              ? const Color(0xFFD4AF37).withOpacity(0.7)
                              : Colors.white.withOpacity(0.25),
                          fontSize: 9,
                          letterSpacing: 1.5,
                          fontWeight: FontWeight.w600,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildHoldButon() {
    return GestureDetector(
      onLongPressStart: (_) => _holdBaslat(),
      onLongPressEnd: (_) => _holdBirak(),
      onLongPressCancel: () => _holdBirak(),
      child: AnimatedBuilder(
        animation: Listenable.merge([_pulseAnimation, _rippleAnimation]),
        builder: (context, child) {
          return Stack(
            alignment: Alignment.center,
            children: [
              if (_isHoldPressed) _buildWaveEffect(),
                
              Transform.scale(
                scale: _isHoldPressed ? _pulseAnimation.value : 1.0,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  width: 180,
                  height: 180,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: _isHoldPressed
                        ? const Color(0xFFD4AF37).withOpacity(0.15)
                        : Colors.white.withOpacity(0.04),
                    border: Border.all(
                      color: _isHoldPressed
                          ? const Color(0xFFD4AF37)
                          : Colors.white.withOpacity(0.15),
                      width: _isHoldPressed ? 2.5 : 1.5,
                    ),
                    boxShadow: _isHoldPressed
                        ? [
                            BoxShadow(
                              color: const Color(0xFFD4AF37).withOpacity(0.3),
                              blurRadius: 50,
                              spreadRadius: 10,
                            ),
                          ]
                        : [],
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        _isHoldPressed ? Icons.mic_rounded : Icons.touch_app_rounded,
                        size: 64,
                        color: _isHoldPressed
                            ? const Color(0xFFD4AF37)
                            : Colors.white.withOpacity(0.5),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _isHoldPressed ? "KONUŞUYOR" : "BASILI\nTUTUN",
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: _isHoldPressed
                              ? const Color(0xFFD4AF37).withOpacity(0.7)
                              : Colors.white.withOpacity(0.25),
                          fontSize: 9,
                          letterSpacing: 1.5,
                          fontWeight: FontWeight.w600,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildDurumMetni() {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 250),
      child: Text(
        _statusMessage,
        key: ValueKey(_statusMessage),
        textAlign: TextAlign.center,
        style: TextStyle(
          color: _isActive || _isHoldPressed
              ? const Color(0xFFD4AF37)
              : Colors.white.withOpacity(0.35),
          fontSize: 12,
          fontWeight: FontWeight.w700,
          letterSpacing: 2,
        ),
      ),
    );
  }

  Widget _buildSesGostergesi() {
    return SizedBox(
      height: 36,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: List.generate(24, (i) {
          final height = (4 + _voiceLevel * 28 * (0.4 + (i % 5) * 0.15)).clamp(4.0, 32.0);
          return AnimatedContainer(
            duration: Duration(milliseconds: 80 + (i * 5)),
            width: 3,
            height: height,
            margin: const EdgeInsets.symmetric(horizontal: 1.5),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(2),
              color: const Color(0xFFD4AF37).withOpacity(0.5 + (height / 64)),
            ),
          );
        }),
      ),
    );
  }

  Widget _buildAltBilgi() {
    return Column(
      children: [
        // Reconnect bilgisi
        if (_reconnectInfo != null)
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 300),
            child: Container(
              key: ValueKey(_reconnectInfo),
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                color: const Color(0xFFFBBF24).withOpacity(0.1),
                border: Border.all(color: const Color(0xFFFBBF24).withOpacity(0.3)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const SizedBox(
                    width: 12, height: 12,
                    child: CircularProgressIndicator(
                      strokeWidth: 1.5,
                      color: Color(0xFFFBBF24),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    _reconnectInfo!,
                    style: TextStyle(
                      color: const Color(0xFFFBBF24).withOpacity(0.8),
                      fontSize: 9,
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
            ),
          ),
        // IP bilgisi
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.lock_outline, color: Colors.white.withOpacity(0.15), size: 11),
            const SizedBox(width: 6),
            Text(
              'Şifreli bağlantı  •  '
              '${AppConfig.apiBase.replaceAll("http://", "").split(":")[0]}',
              style: TextStyle(
                color: Colors.white.withOpacity(0.15),
                fontSize: 10,
                letterSpacing: 0.5,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ─── Yardımcı Widget'lar ─────────────────────────────────────────────────────

class _ModButon extends StatelessWidget {
  final String label;
  final String subtitle;
  final IconData icon;
  final bool aktif;
  final bool disabled;
  final VoidCallback onTap;

  const _ModButon({
    required this.label,
    required this.subtitle,
    required this.icon,
    required this.aktif,
    required this.disabled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: disabled ? null : onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(11),
            color: aktif
                ? const Color(0xFFD4AF37).withOpacity(0.12)
                : Colors.transparent,
            border: aktif
                ? Border.all(color: const Color(0xFFD4AF37).withOpacity(0.5))
                : Border.all(color: Colors.transparent),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 16,
                color: aktif
                    ? const Color(0xFFD4AF37)
                    : Colors.white.withOpacity(0.3),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      color: aktif
                          ? const Color(0xFFD4AF37)
                          : Colors.white.withOpacity(0.35),
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 1.5,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: TextStyle(
                      color: aktif
                          ? const Color(0xFFD4AF37).withOpacity(0.5)
                          : Colors.white.withOpacity(0.2),
                      fontSize: 9,
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GoldButton extends StatelessWidget {
  final VoidCallback onPressed;
  final IconData icon;
  final String label;
  final bool outlined;

  const _GoldButton({
    required this.onPressed,
    required this.icon,
    required this.label,
    this.outlined = false,
  });

  @override
  Widget build(BuildContext context) {
    return outlined
        ? OutlinedButton.icon(
            onPressed: onPressed,
            icon: Icon(icon, size: 16, color: const Color(0xFFD4AF37)),
            label: Text(
              label,
              style: const TextStyle(
                color: Color(0xFFD4AF37),
                fontSize: 11,
                letterSpacing: 1.5,
                fontWeight: FontWeight.bold,
              ),
            ),
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: Color(0xFFD4AF37)),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            ),
          )
        : ElevatedButton.icon(
            onPressed: onPressed,
            icon: Icon(icon, size: 16),
            label: Text(
              label,
              style: const TextStyle(
                fontSize: 11,
                letterSpacing: 1.5,
                fontWeight: FontWeight.bold,
              ),
            ),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFD4AF37),
              foregroundColor: Colors.black,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              elevation: 0,
            ),
          );
  }
}

// ─── Arka Plan Painter ────────────────────────────────────────────────────────
class _BackgroundPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    // Hafif radial gradient
    final radialPaint = Paint()
      ..shader = RadialGradient(
        center: Alignment.topCenter,
        radius: 1.2,
        colors: [
          const Color(0xFFD4AF37).withOpacity(0.04),
          Colors.transparent,
        ],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height));

    canvas.drawRect(Rect.fromLTWH(0, 0, size.width, size.height), radialPaint);

    // İnce köşe çizgisi - sol üst
    final linePaint = Paint()
      ..color = const Color(0xFFD4AF37).withOpacity(0.08)
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;

    canvas.drawLine(const Offset(0, 0), Offset(size.width * 0.25, 0), linePaint);
    canvas.drawLine(const Offset(0, 0), Offset(0, size.height * 0.15), linePaint);

    // Sağ alt köşe
    canvas.drawLine(Offset(size.width, size.height), Offset(size.width * 0.75, size.height), linePaint);
    canvas.drawLine(Offset(size.width, size.height), Offset(size.width, size.height * 0.85), linePaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

// ─── Premium Ses Halkaları Painter ───────────────────────────────────────────
class _WaveRingsPainter extends CustomPainter {
  final double _amplitude;
  final Animation<double> _animation;

  _WaveRingsPainter({
    required double amplitude,
    required Animation<double> animation,
  })  : _amplitude = amplitude,
        _animation = animation,
        super(repaint: animation);

  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final cy = size.height / 2;

    // Her halka için farklı faz ve renk
    final rings = [
      _RingConfig(baseRadius: 95,  phaseOffset: 0.0,  baseOpacity: 0.45, color: const Color(0xFFD4AF37)),
      _RingConfig(baseRadius: 115, phaseOffset: 0.33, baseOpacity: 0.28, color: const Color(0xFFB8962E)),
      _RingConfig(baseRadius: 135, phaseOffset: 0.66, baseOpacity: 0.15, color: const Color(0xFF8B6914)),
    ];

    for (final ring in rings) {
      // Animasyon değeri + amplitude ile halka yarıçapını hesapla
      final animVal  = ((_animation.value + ring.phaseOffset) % 1.0);
      final ampBoost = _amplitude * 18.0;
      final r        = ring.baseRadius + (animVal * 12.0) + ampBoost;

      // Amplitude'a göre opaklık artar
      final opacity = (ring.baseOpacity + (_amplitude * 0.3)).clamp(0.0, 0.7);

      final paint = Paint()
        ..color = ring.color.withOpacity(opacity)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5 + (_amplitude * 2.5);

      canvas.drawCircle(Offset(cx, cy), r, paint);
    }
  }

  @override
  bool shouldRepaint(_WaveRingsPainter old) =>
      old._amplitude != _amplitude;
}

class _RingConfig {
  final double baseRadius;
  final double phaseOffset;
  final double baseOpacity;
  final Color  color;
  const _RingConfig({
    required this.baseRadius,
    required this.phaseOffset,
    required this.baseOpacity,
    required this.color,
  });
}