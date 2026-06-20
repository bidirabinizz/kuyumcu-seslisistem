import 'dart:convert';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:web_socket_channel/web_socket_channel.dart';
import 'config.dart';
import 'models/personel.dart';
import 'models/urun.dart';
import 'models/kategori.dart';

class _KatDisplayInfo {
  final String ad;
  final String etiket;
  _KatDisplayInfo({required this.ad, required this.etiket});
}

// ─── Renk paleti (backend renk isimleriyle eşleşir) ─────────────────────────
Color _renkten(String renk, {double opacity = 1.0}) {
  final renkMap = {
    'yellow': const Color(0xFFFACC15),
    'amber':  const Color(0xFFF59E0B),
    'orange': const Color(0xFFF97316),
    'red':    const Color(0xFFEF4444),
    'purple': const Color(0xFFA855F7),
    'blue':   const Color(0xFF3B82F6),
    'green':  const Color(0xFF22C55E),
    'gray':   const Color(0xFF9CA3AF),
  };
  return (renkMap[renk] ?? const Color(0xFFF59E0B)).withOpacity(opacity);
}

// ─── ANA KASA EKRANI ─────────────────────────────────────────────────────────
class KasaScreen extends StatefulWidget {
  const KasaScreen({super.key});

  @override
  State<KasaScreen> createState() => _KasaScreenState();
}

class _KasaScreenState extends State<KasaScreen> {
  int _adim = 1; // 1: Personel Seç, 2: İşlem Gir, 3: Onayla

  Personel? _secilenPersonel;
  Urun?     _secilenUrun;
  String    _islemTipi  = 'SATIS';
  String    _odemeTipi  = 'NAKIT';
  String    _miktar     = '';
  String    _fiyat      = '';
  String    _aktifInput = 'miktar'; // 'miktar' | 'fiyat'

  // Veri
  List<Personel> _personeller = [];
  List<Urun>     _urunler     = [];
  List<Kategori> _kategoriler = [];
  Map<String, dynamic>? _kurlar;
  bool _personelYukleniyor  = true;
  bool _urunYukleniyor      = true;
  bool _kategoriYukleniyor  = true;

  // Cached grouped products and ordered categories
  Map<String, Map<String, List<Urun>>> _groupedUrunler = {};
  List<_KatDisplayInfo> _orderedKats = [];

  void _updateGroupedUrunler() {
    final Map<String, Map<String, List<Urun>>> g = {};
    for (final u in _urunler) {
      g.putIfAbsent(u.urunKategorisi, () => {});
      g[u.urunKategorisi]!.putIfAbsent(u.urunGrubu, () => []).add(u);
    }
    _groupedUrunler = g;

    final dbKatCodes = _kategoriler.where((k) => k.aktif).map((k) => k.ad.toUpperCase()).toSet();
    _orderedKats = [
      ..._kategoriler.where((k) => k.aktif).map((k) => _KatDisplayInfo(ad: k.ad.toUpperCase(), etiket: k.etiket)),
      ...g.keys.where((k) => !dbKatCodes.contains(k.toUpperCase())).map((k) => _KatDisplayInfo(ad: k, etiket: '📁 $k')),
    ];
  }

  // WebSocket ve Zamanlayıcı
  WebSocketChannel? _wsChannel;
  Timer? _reconnectTimer;

  @override
  void initState() {
    super.initState();
    _personelleriYukle();
    _urunleriYukle();
    _kategorileriYukle();
    _kurlariYukle();
    _baglantiyiBaslat();
  }

  @override
  void dispose() {
    _reconnectTimer?.cancel();
    _wsChannel?.sink.close();
    super.dispose();
  }

  void _baglantiyiBaslat() {
    _reconnectTimer?.cancel();
    _wsChannel?.sink.close();

    try {
      final uri = Uri.parse(AppConfig.wsBase);
      debugPrint('[WS] Bağlanılıyor: $uri');
      _wsChannel = WebSocketChannel.connect(uri);

      _wsChannel!.stream.listen(
        (message) {
          debugPrint('[WS] Mesaj alındı: $message');
          try {
            final data = json.decode(message);
            if (data is Map<String, dynamic>) {
              final type = data['type'];
              if (type == 'REFRESH_PERSONELLER') {
                debugPrint('[WS] Personel listesi canlı güncelleniyor...');
                _personelleriYukle();
              } else if (type == 'REFRESH_URUNLER') {
                debugPrint('[WS] Ürün listesi canlı güncelleniyor...');
                _urunleriYukle();
                _kategorileriYukle();
              } else if (type == 'REFRESH_KATEGORILER') {
                debugPrint('[WS] Kategoriler/Ürünler canlı güncelleniyor...');
                _urunleriYukle();
                _kategorileriYukle();
              } else if (type == 'REFRESH_KURLAR') {
                debugPrint('[WS] Günlük kurlar canlı güncelleniyor...');
                _kurlariYukle();
              }
            }
          } catch (e) {
            debugPrint('[WS] Mesaj işleme hatası: $e');
          }
        },
        onError: (err) {
          debugPrint('[WS] Hata oluştu: $err');
          _tekrarBaglan();
        },
        onDone: () {
          debugPrint('[WS] Bağlantı kapandı.');
          _tekrarBaglan();
        },
      );
    } catch (e) {
      debugPrint('[WS] Bağlantı kurulamadı: $e');
      _tekrarBaglan();
    }
  }

  void _tekrarBaglan() {
    if (!mounted) return;
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 5), () {
      debugPrint('[WS] Yeniden bağlanmayı deniyor...');
      _baglantiyiBaslat();
    });
  }

  Future<void> _kurlariYukle() async {
    try {
      final res = await http
          .get(Uri.parse('${AppConfig.apiBase}/piyasa/kurlar'))
          .timeout(const Duration(seconds: 8));
      if (res.statusCode == 200) {
        final data = json.decode(res.body) as Map<String, dynamic>;
        if (mounted) setState(() => _kurlar = data);
      }
    } catch (e) {
      debugPrint('[KasaScreen] Kurlar yüklenemedi: $e');
    }
  }

  Future<void> _personelleriYukle() async {
    try {
      final res = await http
          .get(Uri.parse('${AppConfig.apiBase}/personeller'))
          .timeout(const Duration(seconds: 8));
      if (res.statusCode == 200) {
        final liste = (json.decode(res.body) as List)
            .map((e) => Personel.fromJson(e))
            .toList();
        if (mounted) setState(() => _personeller = liste);
      }
    } catch (e) {
      debugPrint('[KasaScreen] Personel yüklenemedi: $e');
    } finally {
      if (mounted) setState(() => _personelYukleniyor = false);
    }
  }

  Future<void> _urunleriYukle() async {
    try {
      final res = await http
          .get(Uri.parse('${AppConfig.apiBase}/urunler'))
          .timeout(const Duration(seconds: 8));
      if (res.statusCode == 200) {
        final liste = (json.decode(res.body) as List)
            .map((e) => Urun.fromJson(e))
            .where((u) => u.mobilAktif)
            .toList();
        if (mounted) {
          setState(() {
            _urunler = liste;
            _updateGroupedUrunler();
            if (liste.isNotEmpty && _secilenUrun == null) {
              _secilenUrun = liste.first;
            }
          });
        }
      }
    } catch (e) {
      debugPrint('[KasaScreen] Ürünler yüklenemedi: $e');
    } finally {
      if (mounted) setState(() => _urunYukleniyor = false);
    }
  }

  Future<void> _kategorileriYukle() async {
    try {
      final res = await http
          .get(Uri.parse('${AppConfig.apiBase}/kategoriler'))
          .timeout(const Duration(seconds: 8));
      if (res.statusCode == 200) {
        final liste = (json.decode(res.body) as List)
            .map((e) => Kategori.fromJson(e))
            .toList();
        if (mounted) {
          setState(() {
            _kategoriler = liste;
            _updateGroupedUrunler();
          });
        }
      }
    } catch (e) {
      debugPrint('[KasaScreen] Kategoriler yüklenemedi: $e');
    } finally {
      if (mounted) setState(() => _kategoriYukleniyor = false);
    }
  }

  void _sifirla() {
    setState(() {
      _adim            = 1;
      _secilenPersonel = null;
      _secilenUrun     = _urunler.isNotEmpty ? _urunler.first : null;
      _islemTipi       = 'SATIS';
      _odemeTipi       = 'NAKIT';
      _miktar          = '';
      _fiyat           = '';
      _aktifInput      = 'miktar';
    });
  }

  void _numpadTus(String tus) {
    setState(() {
      final aktif = _aktifInput == 'miktar' ? _miktar : _fiyat;
      String yeni = aktif;
      if (tus == 'DEL') {
        yeni = aktif.isEmpty ? '' : aktif.substring(0, aktif.length - 1);
      } else if (tus == '.') {
        if (!aktif.contains('.') && (_secilenUrun?.gramCinsinden ?? true)) {
          yeni = aktif.isEmpty ? '0.' : aktif + '.';
        }
      } else {
        if (aktif.length >= 10) return;
        yeni = aktif + tus;
      }
      if (_aktifInput == 'miktar') {
        _miktar = yeni;
      } else {
        _fiyat = yeni;
      }
    });
  }

  String _initials(String adSoyad) {
    return adSoyad.trim().split(' ').take(2).map((w) => w.isNotEmpty ? w[0].toUpperCase() : '').join();
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: const Color(0xFFFCFBFA),
      ),
      child: Scaffold(
        backgroundColor: const Color(0xFFFCFBFA),
        body: SafeArea(
          child: Column(
            children: [
              _AdimBar(adim: _adim),
              Expanded(
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 250),
                  child: switch (_adim) {
                    1 => _PersonelSec(
                        key: const ValueKey(1),
                        personeller: _personeller,
                        yukleniyor: _personelYukleniyor,
                        initials: _initials,
                        onSec: (p) => setState(() {
                          _secilenPersonel = p;
                          _adim = 2;
                        }),
                      ),
                    2 => _IslemGir(
                        key: const ValueKey(2),
                        personel: _secilenPersonel!,
                        groupedUrunler: _groupedUrunler,
                        orderedKats: _orderedKats,
                        urunYukleniyor: _urunYukleniyor,
                        kategoriYukleniyor: _kategoriYukleniyor,
                        secilenUrun: _secilenUrun,
                        islemTipi: _islemTipi,
                        odemeTipi: _odemeTipi,
                        miktar: _miktar,
                        fiyat: _fiyat,
                        aktifInput: _aktifInput,
                        initials: _initials,
                        onGeri: () => setState(() => _adim = 1),
                        onUrunSec: (u) => setState(() {
                          _secilenUrun = u;
                          _miktar = '';
                        }),
                        onIslemTipi: (t) => setState(() => _islemTipi = t),
                        onOdemeTipi: (t) => setState(() => _odemeTipi = t),
                        onInputSec: (i) => setState(() => _aktifInput = i),
                        onNumpad: _numpadTus,
                        onDevam: () => setState(() => _adim = 3),
                        kurlar: _kurlar,
                      ),
                    3 => _IslemOnayla(
                        key: const ValueKey(3),
                        personel: _secilenPersonel!,
                        urun: _secilenUrun!,
                        islemTipi: _islemTipi,
                        odemeTipi: _odemeTipi,
                        miktar: double.tryParse(_miktar) ?? 0,
                        fiyat: double.tryParse(_fiyat) ?? 0,
                        initials: _initials,
                        onGeri: () => setState(() => _adim = 2),
                        onTamamlandi: _sifirla,
                        kurlar: _kurlar,
                      ),
                    _ => const SizedBox.shrink(),
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Adım göstergesi ─────────────────────────────────────────────────────────
class _AdimBar extends StatelessWidget {
  final int adim;
  const _AdimBar({required this.adim});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: Row(
        children: [
          _bar(1, flex: 1),
          const SizedBox(width: 4),
          _bar(2, flex: 2),
          const SizedBox(width: 4),
          _bar(3, flex: 1),
        ],
      ),
    );
  }

  Widget _bar(int s, {required int flex}) {
    return Expanded(
      flex: flex,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        height: 4,
        decoration: BoxDecoration(
          color: s <= adim ? const Color(0xFFD4AF37) : const Color(0xFFEAEAEA),
          borderRadius: BorderRadius.circular(0),
        ),
      ),
    );
  }
}

// ─── ADIM 1: Personel Seçimi ──────────────────────────────────────────────────
class _PersonelSec extends StatelessWidget {
  final List<Personel> personeller;
  final bool yukleniyor;
  final String Function(String) initials;
  final void Function(Personel) onSec;

  const _PersonelSec({
    super.key,
    required this.personeller,
    required this.yukleniyor,
    required this.initials,
    required this.onSec,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'ÇAPAR KUYUMCULUK · KASA',
                style: TextStyle(
                  color: const Color(0xFFD4AF37),
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 2,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Kim işlem yapıyor?',
                style: TextStyle(
                  color: Color(0xFF1A1A1A),
                  fontSize: 26,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: yukleniyor
              ? const Center(
                  child: CircularProgressIndicator(color: Color(0xFFF59E0B)),
                )
              : personeller.isEmpty
                  ? const Center(
                      child: Text(
                        'Personel bulunamadı.\nAdmin panelinden ekleyin.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Color(0xFF6B7280), fontSize: 15),
                      ),
                    )
                  : Builder(
                      builder: (context) {
                        final isLandscape = MediaQuery.of(context).orientation == Orientation.landscape;
                        return GridView.builder(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 2,
                            crossAxisSpacing: 12,
                            mainAxisSpacing: 12,
                            childAspectRatio: isLandscape ? 3.0 : 1.1,
                          ),
                          itemCount: personeller.length,
                          itemBuilder: (_, i) {
                            final p = personeller[i];
                            return Material(
                              color: Colors.transparent,
                              child: InkWell(
                                onTap: () => onSec(p),
                                borderRadius: BorderRadius.circular(0),
                                child: Ink(
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    border: Border.all(color: const Color(0xFFE5E5E5), width: 1.5),
                                    borderRadius: BorderRadius.circular(0),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black.withOpacity(0.03),
                                        blurRadius: 10,
                                        offset: const Offset(0, 2),
                                      )
                                    ],
                                  ),
                                  child: isLandscape
                                      ? Row(
                                          children: [
                                            const SizedBox(width: 24),
                                            Container(
                                              width: 48,
                                              height: 48,
                                              decoration: BoxDecoration(
                                                color: const Color(0xFFFCFBFA),
                                                border: Border.all(color: const Color(0xFFD4AF37), width: 1.5),
                                                borderRadius: BorderRadius.circular(0),
                                              ),
                                              child: Center(
                                                child: Text(
                                                  initials(p.adSoyad),
                                                  style: const TextStyle(
                                                    color: Color(0xFF1A1A1A),
                                                    fontSize: 16,
                                                    fontWeight: FontWeight.w900,
                                                  ),
                                                ),
                                              ),
                                            ),
                                            const SizedBox(width: 16),
                                            Expanded(
                                              child: Column(
                                                crossAxisAlignment: CrossAxisAlignment.start,
                                                mainAxisAlignment: MainAxisAlignment.center,
                                                children: [
                                                  Text(
                                                    p.adSoyad,
                                                    style: const TextStyle(
                                                      color: Color(0xFF1A1A1A),
                                                      fontSize: 14,
                                                      fontWeight: FontWeight.w700,
                                                    ),
                                                    maxLines: 1,
                                                    overflow: TextOverflow.ellipsis,
                                                  ),
                                                  if (p.rol.isNotEmpty) ...[
                                                    const SizedBox(height: 2),
                                                    Text(
                                                      p.rol,
                                                      style: const TextStyle(
                                                        color: Color(0xFF6B7280),
                                                        fontSize: 11,
                                                      ),
                                                      maxLines: 1,
                                                      overflow: TextOverflow.ellipsis,
                                                    ),
                                                  ],
                                                ],
                                              ),
                                            ),
                                            const SizedBox(width: 12),
                                          ],
                                        )
                                      : Column(
                                          mainAxisAlignment: MainAxisAlignment.center,
                                          children: [
                                            Container(
                                              width: 60,
                                              height: 60,
                                              decoration: BoxDecoration(
                                                color: const Color(0xFFFCFBFA),
                                                border: Border.all(color: const Color(0xFFD4AF37), width: 1.5),
                                                borderRadius: BorderRadius.circular(0),
                                              ),
                                              child: Center(
                                                child: Text(
                                                  initials(p.adSoyad),
                                                  style: const TextStyle(
                                                    color: Color(0xFF1A1A1A),
                                                    fontSize: 20,
                                                    fontWeight: FontWeight.w900,
                                                  ),
                                                ),
                                              ),
                                            ),
                                            const SizedBox(height: 12),
                                            Text(
                                              p.adSoyad,
                                              textAlign: TextAlign.center,
                                              style: const TextStyle(
                                                color: Color(0xFF1A1A1A),
                                                fontSize: 14,
                                                fontWeight: FontWeight.w700,
                                              ),
                                            ),
                                            if (p.rol.isNotEmpty) ...[
                                              const SizedBox(height: 2),
                                              Text(
                                                p.rol,
                                                style: const TextStyle(
                                                  color: Color(0xFF6B7280),
                                                  fontSize: 11,
                                                ),
                                              ),
                                            ],
                                          ],
                                        ),
                                ),
                              ),
                            );
                          },
                        );
                      }
                    ),
        ),
      ],
    );
  }
}

// ─── ADIM 2: İşlem Girişi ─────────────────────────────────────────────────────
class _IslemGir extends StatelessWidget {
  final Personel personel;
  final Map<String, Map<String, List<Urun>>> groupedUrunler;
  final List<_KatDisplayInfo> orderedKats;
  final bool urunYukleniyor;
  final bool kategoriYukleniyor;
  final Urun? secilenUrun;
  final String islemTipi;
  final String odemeTipi;
  final String miktar;
  final String fiyat;
  final String aktifInput;
  final String Function(String) initials;
  final VoidCallback onGeri;
  final void Function(Urun) onUrunSec;
  final void Function(String) onIslemTipi;
  final void Function(String) onOdemeTipi;
  final void Function(String) onInputSec;
  final void Function(String) onNumpad;
  final VoidCallback onDevam;
  final Map<String, dynamic>? kurlar;

  const _IslemGir({
    super.key,
    required this.personel,
    required this.groupedUrunler,
    required this.orderedKats,
    required this.urunYukleniyor,
    required this.kategoriYukleniyor,
    required this.secilenUrun,
    required this.islemTipi,
    required this.odemeTipi,
    required this.miktar,
    required this.fiyat,
    required this.aktifInput,
    required this.initials,
    required this.onGeri,
    required this.onUrunSec,
    required this.onIslemTipi,
    required this.onOdemeTipi,
    required this.onInputSec,
    required this.onNumpad,
    required this.onDevam,
    this.kurlar,
  });

  bool get _devamAktif => miktar.isNotEmpty && (double.tryParse(miktar) ?? 0) > 0 && secilenUrun != null;

  @override
  Widget build(BuildContext context) {
    final gruplar = groupedUrunler;

    return Column(
      children: [
        // Üst bar
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
          child: Row(
            children: [
              IconButton(
                icon: const Icon(Icons.chevron_left, color: Color(0xFF6B7280), size: 28),
                onPressed: onGeri,
              ),
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFFF59E0B), Color(0xFFD97706)],
                  ),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Center(
                  child: Text(
                    initials(personel.adSoyad),
                    style: const TextStyle(
                      color: Color(0xFF1A1A1A),
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
                Text(
                  personel.adSoyad,
                  style: const TextStyle(
                    color: Color(0xFF1A1A1A),
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
            ],
          ),
        ),
        // İçerik: sol ürünler / sağ numpad
        Expanded(
          child: Row(
            children: [
              // ── SOL: Ürün seçimi ──
              Expanded(
                flex: 55,
                child: Column(
                  children: [
                    // ALIŞ / SATIŞ
                    Padding(
                      padding: const EdgeInsets.fromLTRB(12, 8, 6, 6),
                      child: Row(
                        children: [
                          _IslemTipiBtn(
                            label: '↓ SATIŞ',
                            aktif: islemTipi == 'SATIS',
                            renk: Colors.red,
                            onTap: () => onIslemTipi('SATIS'),
                          ),
                          const SizedBox(width: 8),
                          _IslemTipiBtn(
                            label: '↑ ALIŞ',
                            aktif: islemTipi == 'ALIS',
                            renk: Colors.green,
                            onTap: () => onIslemTipi('ALIS'),
                          ),
                        ],
                      ),
                    ),
                    // Ürünler
                    Expanded(
                      child: (urunYukleniyor || kategoriYukleniyor)
                          ? const Center(child: CircularProgressIndicator(color: Color(0xFFF59E0B)))
                          : SingleChildScrollView(
                              padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  for (final kat in orderedKats)
                                    if (gruplar.containsKey(kat.ad)) ...[
                                      Padding(
                                        padding: const EdgeInsets.only(top: 14, bottom: 6, left: 4),
                                        child: Text(
                                          kat.etiket.toUpperCase(),
                                          style: const TextStyle(
                                            color: Color(0xFFD4AF37),
                                            fontSize: 10,
                                            fontWeight: FontWeight.w900,
                                            letterSpacing: 1.2,
                                          ),
                                        ),
                                      ),
                                      for (final grup in gruplar[kat.ad]!.keys) ...[
                                        // Ürün Grubu Başlığı (Örn: Bilezik, Yüzük, Kolye)
                                        Padding(
                                          padding: const EdgeInsets.only(top: 6, bottom: 4, left: 6),
                                          child: Text(
                                            grup.toUpperCase(),
                                            style: const TextStyle(
                                              color: Color(0xFF6B7280),
                                              fontSize: 12,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                        ),
                                        Padding(
                                          padding: const EdgeInsets.only(left: 6.0, bottom: 8.0),
                                          child: Wrap(
                                            spacing: 8,
                                            runSpacing: 8,
                                            children: gruplar[kat.ad]![grup]!.map((u) {
                                              final aktif = secilenUrun?.id == u.id;
                                              return _UrunBtn(urun: u, aktif: aktif, onTap: () => onUrunSec(u));
                                            }).toList(),
                                          ),
                                        ),
                                      ],
                                    ],
                                ],
                              ),
                            ),
                    ),
                  ],
                ),
              ),
              // ── Ayraç ──
              Container(width: 1, color: const Color(0xFFE5E5E5)),
              // ── SAĞ: Numpad + Giriş ──
              Expanded(
                flex: 45,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(6, 8, 12, 8),
                  child: Column(
                    children: [
                      // Seçilen ürün etiketi
                      if (secilenUrun != null)
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
                          decoration: BoxDecoration(
                            color: _renkten(secilenUrun!.renk, opacity: 0.15),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: _renkten(secilenUrun!.renk, opacity: 0.5)),
                          ),
                          child: Text(
                            secilenUrun!.ad,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: _renkten(secilenUrun!.renk),
                              fontWeight: FontWeight.w800,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      const SizedBox(height: 8),
                      // Miktar & Fiyat göstergesi
                      Row(
                        children: [
                          _InputGosterge(
                            label: secilenUrun?.islemBirimi == 'ADET' ? 'Adet' : 'Gram',
                            deger: miktar,
                            aktif: aktifInput == 'miktar',
                            onTap: () => onInputSec('miktar'),
                          ),
                          const SizedBox(width: 6),
                          _InputGosterge(
                            label: 'Fiyat ₺',
                            deger: fiyat,
                            aktif: aktifInput == 'fiyat',
                            onTap: () => onInputSec('fiyat'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      // Numpad
                      Expanded(
                        child: _NumPad(
                          onTus: onNumpad,
                          ondalikAktif: aktifInput == 'fiyat' || (secilenUrun?.gramCinsinden ?? true),
                        ),
                      ),
                      const SizedBox(height: 8),
                      // NAKİT / KART / USD / EUR
                      Row(
                        children: [
                          _OdemeBtn(label: '💵 Nakit', aktif: odemeTipi == 'NAKIT', renk: Colors.green, onTap: () => onOdemeTipi('NAKIT')),
                          const SizedBox(width: 4),
                          _OdemeBtn(label: '💳 Kart', aktif: odemeTipi == 'KART', renk: Colors.blue, onTap: () => onOdemeTipi('KART')),
                          const SizedBox(width: 4),
                          _OdemeBtn(label: '💵 USD', aktif: odemeTipi == 'USD', renk: Colors.amber, onTap: () => onOdemeTipi('USD')),
                          const SizedBox(width: 4),
                          _OdemeBtn(label: '💶 EUR', aktif: odemeTipi == 'EUR', renk: Colors.purple, onTap: () => onOdemeTipi('EUR')),
                        ],
                      ),
                      if ((odemeTipi == 'USD' || odemeTipi == 'EUR') && double.tryParse(fiyat) != null && double.parse(fiyat) > 0) ...[
                        const SizedBox(height: 8),
                        Builder(builder: (context) {
                          final fVal = double.parse(fiyat);
                          final kur = odemeTipi == 'USD' 
                              ? (kurlar?['usd_try'] as num?)?.toDouble() ?? 1.0 
                              : (kurlar?['eur_try'] as num?)?.toDouble() ?? 1.0;
                          final tutar = fVal / kur;
                          final sembol = odemeTipi == 'USD' ? '\$' : '€';
                          return Container(
                            width: double.infinity,
                            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
                            decoration: BoxDecoration(
                              color: Colors.amber.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(0),
                              border: Border.all(color: Colors.amber.withOpacity(0.3)),
                            ),
                            child: Text(
                              'Ödenecek Döviz: ${tutar.toStringAsFixed(2)} $sembol (Kur: $kur ₺)',
                              style: const TextStyle(color: Colors.amber, fontSize: 11, fontWeight: FontWeight.bold),
                              textAlign: TextAlign.center,
                            ),
                          );
                        }),
                      ],
                      const SizedBox(height: 8),
                      // Devam
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _devamAktif ? onDevam : null,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: _devamAktif ? const Color(0xFFD4AF37) : const Color(0xFFE5E5E5),
                            foregroundColor: _devamAktif ? Colors.white : const Color(0xFF9CA3AF),
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(0)),
                            elevation: 0,
                          ),
                          child: const Text(
                            'İleri → Onayla',
                            style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ─── ADIM 3: Onay ─────────────────────────────────────────────────────────────
class _IslemOnayla extends StatefulWidget {
  final Personel personel;
  final Urun     urun;
  final String   islemTipi;
  final String   odemeTipi;
  final double   miktar;
  final double   fiyat;
  final String Function(String) initials;
  final VoidCallback onGeri;
  final VoidCallback onTamamlandi;
  final Map<String, dynamic>? kurlar;

  const _IslemOnayla({
    super.key,
    required this.personel,
    required this.urun,
    required this.islemTipi,
    required this.odemeTipi,
    required this.miktar,
    required this.fiyat,
    required this.initials,
    required this.onGeri,
    required this.onTamamlandi,
    this.kurlar,
  });

  @override
  State<_IslemOnayla> createState() => _IslemOnaylaState();
}

class _IslemOnaylaState extends State<_IslemOnayla> {
  bool _yukleniyor = false;
  bool _basarili   = false;
  String? _hata;

  String? get _hasGoster {
    final u = widget.urun;
    if (u.milyem > 0) {
      return '≈ ${(widget.miktar * u.milyem).toStringAsFixed(4)} gr has';
    } else if (u.hasKarsiligi > 0) {
      return '≈ ${(widget.miktar * u.hasKarsiligi).toStringAsFixed(4)} gr has';
    }
    return null;
  }

  Future<void> _kaydet() async {
    setState(() { _yukleniyor = true; _hata = null; });
    try {
      final u = widget.urun;
      final isDoviz = u.urunKategorisi == 'DÖVİZ' || u.urunKategorisi == 'DOVIZ';
      double dovizTutar = 0.0;
      double dovizKuru = 1.0;

      if (isDoviz) {
        dovizTutar = widget.miktar;
        dovizKuru = widget.miktar > 0 ? (widget.fiyat / widget.miktar) : 1.0;
      } else {
        if (widget.odemeTipi == 'USD' && widget.fiyat > 0) {
          dovizKuru = (widget.kurlar?['usd_try'] as num?)?.toDouble() ?? 1.0;
          dovizTutar = widget.fiyat / dovizKuru;
        } else if (widget.odemeTipi == 'EUR' && widget.fiyat > 0) {
          dovizKuru = (widget.kurlar?['eur_try'] as num?)?.toDouble() ?? 1.0;
          dovizTutar = widget.fiyat / dovizKuru;
        }
      }

      final payload = {
        'personel_id':            widget.personel.id,
        'islem_tipi':             widget.islemTipi,
        'urun_cinsi':             u.urunCinsi,
        'urun_kategorisi':        u.urunKategorisi,
        'islem_birimi':           u.islemBirimi,
        'brut_miktar':            widget.miktar,
        'birim_fiyat':            widget.fiyat,
        'odeme_tipi':             widget.odemeTipi,
        'adet':                   u.islemBirimi == 'ADET' ? widget.miktar.round() : 1,
        if (u.milyem > 0)        'milyem_override':        u.milyem,
        if (u.hasKarsiligi > 0)  'has_karsiligi_override': u.hasKarsiligi,
        'urun_adi':               u.ad,
        'doviz_tutar':            double.parse(dovizTutar.toStringAsFixed(2)),
        'doviz_kuru':             dovizKuru,
      };

      final res = await http
          .post(
            Uri.parse('${AppConfig.apiBase}/islemler'),
            headers: {'Content-Type': 'application/json'},
            body: json.encode(payload),
          )
          .timeout(const Duration(seconds: 10));

      if (res.statusCode == 200) {
        HapticFeedback.heavyImpact();
        setState(() { _basarili = true; _yukleniyor = false; });
        await Future.delayed(const Duration(seconds: 2));
        widget.onTamamlandi();
      } else {
        final body = json.decode(res.body);
        setState(() {
          _hata = body['detail']?.toString() ?? 'Sunucu hatası (${res.statusCode})';
          _yukleniyor = false;
        });
      }
    } catch (e) {
      setState(() {
        _hata = 'Bağlantı hatası: $e';
        _yukleniyor = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final u = widget.urun;
    final isDoviz = u.urunKategorisi == 'DÖVİZ' || u.urunKategorisi == 'DOVIZ';
    if (_basarili) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: 1),
              duration: const Duration(milliseconds: 400),
              builder: (_, v, child) => Transform.scale(scale: v, child: child),
              child: Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.green.withOpacity(0.15),
                  border: Border.all(color: Colors.green.shade400, width: 2),
                ),
                child: const Icon(Icons.check_circle_outline, color: Color(0xFF4ADE80), size: 52),
              ),
            ),
            const SizedBox(height: 20),
            const Text(
              'Kaydedildi!',
              style: TextStyle(color: Color(0xFF4ADE80), fontSize: 26, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 8),
            const Text(
              'Personel seçimine dönülüyor...',
              style: TextStyle(color: Color(0xFF6B7280), fontSize: 13),
            ),
          ],
        ),
      );
    }

    final isLandscape = MediaQuery.of(context).orientation == Orientation.landscape;

    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              IconButton(
                icon: const Icon(Icons.chevron_left, color: Color(0xFF6B7280), size: 28),
                onPressed: widget.onGeri,
              ),
              const Text(
                'İşlemi Onayla',
                style: TextStyle(color: Color(0xFF1A1A1A), fontSize: 20, fontWeight: FontWeight.w900),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Özet kart
          Expanded(
            child: Center(
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(0),
                  border: Border.all(color: const Color(0xFFE5E5E5), width: 1.5),
                  boxShadow: [
                    BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 10, offset: const Offset(0, 4)),
                  ],
                ),
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Personel
                      Row(
                        children: [
                          Container(
                            width: 40, height: 40,
                            decoration: BoxDecoration(
                              color: const Color(0xFFFCFBFA),
                              border: Border.all(color: const Color(0xFFD4AF37), width: 1.5),
                              borderRadius: BorderRadius.circular(0),
                            ),
                            child: Center(
                              child: Text(
                                widget.initials(widget.personel.adSoyad),
                                style: const TextStyle(color: Color(0xFF1A1A1A), fontWeight: FontWeight.w900),
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(widget.personel.adSoyad, style: const TextStyle(color: Color(0xFF1A1A1A), fontWeight: FontWeight.w700, fontSize: 15)),
                              if (widget.personel.rol.isNotEmpty)
                               Text(widget.personel.rol, style: const TextStyle(color: Color(0xFF6B7280), fontSize: 11)),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      const Divider(color: Color(0xFFE5E5E5)),
                      const SizedBox(height: 16),
                      // Detaylar
                      GridView.count(
                        shrinkWrap: true,
                        crossAxisCount: isLandscape ? 4 : 2,
                        childAspectRatio: 2.2,
                        crossAxisSpacing: 10,
                        mainAxisSpacing: 10,
                        physics: const NeverScrollableScrollPhysics(),
                        children: [
                        _OzetKart(
                          baslik: 'İşlem',
                          deger: widget.islemTipi == 'SATIS' ? '↓ SATIŞ' : '↑ ALIŞ',
                          renkRgb: widget.islemTipi == 'SATIS' ? Colors.red : Colors.green,
                        ),
                        _OzetKart(
                          baslik: 'Ürün',
                          deger: widget.urun.ad,
                          renkRgb: _renkten(widget.urun.renk),
                        ),
                        _OzetKart(
                          baslik: widget.urun.islemBirimi == 'ADET' ? 'Adet' : 'Miktar',
                          deger: widget.urun.islemBirimi == 'ADET'
                              ? '${widget.miktar.round()} adet'
                              : '${widget.miktar} gr',
                        ),
                        _OzetKart(
                          baslik: 'Ödeme',
                          deger: widget.odemeTipi == 'KART'
                              ? '💳 Kart TL'
                              : widget.odemeTipi == 'USD'
                                  ? '💵 USD (\$)'
                                  : widget.odemeTipi == 'EUR'
                                      ? '💶 EUR (€)'
                                      : '💵 Nakit TL',
                          renkRgb: widget.odemeTipi == 'KART'
                              ? Colors.blue
                              : widget.odemeTipi == 'USD'
                                  ? Colors.amber
                                  : widget.odemeTipi == 'EUR'
                                      ? Colors.purple
                                      : Colors.green,
                        ),
                      ],
                    ),
                    if (isDoviz && widget.miktar > 0) ...[
                      const SizedBox(height: 10),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                        decoration: BoxDecoration(
                          color: Colors.green.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(0),
                          border: Border.all(color: Colors.green.withOpacity(0.3)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text('Döviz İşlem Detayı', style: TextStyle(color: Colors.green, fontSize: 12, fontWeight: FontWeight.w600)),
                                Text(
                                  '${widget.fiyat.toStringAsFixed(0)} ₺',
                                  style: const TextStyle(color: Colors.green, fontSize: 20, fontWeight: FontWeight.w900),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '${widget.miktar} ${widget.urun.urunCinsi} ➔ ${widget.fiyat.toStringAsFixed(0)} ₺ | 1 ${widget.urun.urunCinsi} = ${(widget.fiyat / widget.miktar).toStringAsFixed(4)} ₺',
                              style: const TextStyle(color: Colors.green, fontSize: 11, fontWeight: FontWeight.w600),
                            ),
                          ],
                        ),
                      ),
                    ] else ...[
                      if (widget.fiyat > 0) ...[
                        const SizedBox(height: 10),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                          decoration: BoxDecoration(
                            color: const Color(0xFFD4AF37).withOpacity(0.1),
                            borderRadius: BorderRadius.circular(0),
                            border: Border.all(color: const Color(0xFFD4AF37).withOpacity(0.3)),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text('Toplam Fiyat', style: TextStyle(color: Color(0xFFF59E0B), fontSize: 12, fontWeight: FontWeight.w600)),
                              Text(
                                '${widget.fiyat.toStringAsFixed(0)} ₺',
                                style: const TextStyle(color: Color(0xFFF59E0B), fontSize: 20, fontWeight: FontWeight.w900),
                              ),
                            ],
                          ),
                        ),
                      ],
                      if (widget.fiyat > 0 && (widget.odemeTipi == 'USD' || widget.odemeTipi == 'EUR')) ...[
                        Builder(builder: (context) {
                          final kur = widget.odemeTipi == 'USD' 
                              ? (widget.kurlar?['usd_try'] as num?)?.toDouble() ?? 1.0 
                              : (widget.kurlar?['eur_try'] as num?)?.toDouble() ?? 1.0;
                          final tutar = widget.fiyat / kur;
                          final sembol = widget.odemeTipi == 'USD' ? '\$' : '€';
                          return Padding(
                            padding: const EdgeInsets.only(top: 8.0),
                            child: Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                              decoration: BoxDecoration(
                                color: Colors.amber.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(0),
                                border: Border.all(color: Colors.amber.withOpacity(0.3)),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text('Ödenecek Döviz ($sembol)', style: const TextStyle(color: Colors.amber, fontSize: 12, fontWeight: FontWeight.w600)),
                                      Text(
                                        '${tutar.toStringAsFixed(2)} $sembol',
                                        style: const TextStyle(color: Colors.amber, fontSize: 20, fontWeight: FontWeight.w900),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    'Sistem Kuru: $kur TL',
                                    style: TextStyle(color: Colors.grey.shade400, fontSize: 10, fontFamily: 'monospace'),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }),
                      ],
                    ],
                    if (_hasGoster != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        _hasGoster!,
                        style: const TextStyle(color: Color(0xFF4B5563), fontSize: 12),
                        textAlign: TextAlign.center,
                      ),
                    ],
                    ],
                  ),
                ),
              ),
            ),
          ),
          if (_hata != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.red.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.red.withOpacity(0.3)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.error_outline, color: Colors.red, size: 16),
                  const SizedBox(width: 8),
                  Expanded(child: Text(_hata!, style: const TextStyle(color: Colors.red, fontSize: 12))),
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: widget.onGeri,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF6B7280),
                    side: const BorderSide(color: Color(0xFFE5E5E5)),
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(0)),
                  ),
                  child: const Text('← Geri', style: TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: ElevatedButton(
                  onPressed: _yukleniyor ? null : _kaydet,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green.shade600,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(0)),
                    elevation: 0,
                  ),
                  child: _yukleniyor
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.check_circle_outline, size: 18),
                            SizedBox(width: 6),
                            Text('KAYDET', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
                          ],
                        ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Küçük Yardımcı Widget'lar ────────────────────────────────────────────────
class _IslemTipiBtn extends StatelessWidget {
  final String label;
  final bool aktif;
  final Color renk;
  final VoidCallback onTap;
  const _IslemTipiBtn({required this.label, required this.aktif, required this.renk, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: aktif ? renk.withOpacity(0.85) : renk.withOpacity(0.08),
            borderRadius: BorderRadius.circular(0),
            border: Border.all(color: aktif ? renk : renk.withOpacity(0.25), width: 2),
          ),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                color: aktif ? Colors.white : renk.withOpacity(0.7),
                fontWeight: FontWeight.w900,
                fontSize: 13,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _UrunBtn extends StatelessWidget {
  final Urun urun;
  final bool aktif;
  final VoidCallback onTap;
  const _UrunBtn({required this.urun, required this.aktif, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final c = _renkten(urun.renk);
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: aktif ? c : c.withOpacity(0.12),
          borderRadius: BorderRadius.circular(0),
          border: Border.all(color: aktif ? c : c.withOpacity(0.35), width: 2),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              urun.ad,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: aktif ? const Color(0xFF1A1A1A) : c,
                fontWeight: FontWeight.w800,
                fontSize: 12,
              ),
            ),
            if (urun.milyem > 0)
              Text(
                '%${(urun.milyem * 100).toStringAsFixed(1)} has',
                style: TextStyle(
                  color: (aktif ? const Color(0xFF1A1A1A) : c).withOpacity(0.65),
                  fontSize: 9,
                ),
              ),
            if (urun.hasKarsiligi > 0)
              Text(
                '${urun.hasKarsiligi.toStringAsFixed(4)} gr/adet',
                style: TextStyle(
                  color: (aktif ? const Color(0xFF1A1A1A) : c).withOpacity(0.65),
                  fontSize: 9,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _InputGosterge extends StatelessWidget {
  final String label;
  final String deger;
  final bool aktif;
  final VoidCallback onTap;
  const _InputGosterge({required this.label, required this.deger, required this.aktif, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: aktif ? const Color(0xFFD4AF37).withOpacity(0.1) : Colors.white,
            borderRadius: BorderRadius.circular(0),
            border: Border.all(
              color: aktif ? const Color(0xFFD4AF37) : const Color(0xFFE5E5E5),
              width: aktif ? 2 : 1,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(color: Color(0xFF6B7280), fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 1),
              ),
              const SizedBox(height: 2),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      deger.isEmpty ? '0' : deger,
                      style: TextStyle(
                        color: deger.isEmpty ? const Color(0xFF9CA3AF) : const Color(0xFF1A1A1A),
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  if (aktif)
                    Container(
                      width: 2,
                      height: 18,
                      color: const Color(0xFFF59E0B),
                      margin: const EdgeInsets.only(left: 2),
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

class _OdemeBtn extends StatelessWidget {
  final String label;
  final bool aktif;
  final Color renk;
  final VoidCallback onTap;
  const _OdemeBtn({required this.label, required this.aktif, required this.renk, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: aktif ? renk.withOpacity(0.75) : renk.withOpacity(0.08),
            borderRadius: BorderRadius.circular(0),
            border: Border.all(color: aktif ? renk : renk.withOpacity(0.25), width: 1.5),
          ),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                color: aktif ? Colors.white : renk.withOpacity(0.6),
                fontWeight: FontWeight.w800,
                fontSize: 12,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _OzetKart extends StatelessWidget {
  final String baslik;
  final String deger;
  final Color? renkRgb;
  const _OzetKart({required this.baslik, required this.deger, this.renkRgb});

  @override
  Widget build(BuildContext context) {
    final renk = renkRgb ?? const Color(0xFF9CA3AF);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: renk.withOpacity(0.08),
        borderRadius: BorderRadius.circular(0),
        border: Border.all(color: renk.withOpacity(0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(baslik, style: TextStyle(color: renk.withOpacity(0.7), fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 1)),
          const SizedBox(height: 3),
          Text(deger, style: TextStyle(color: renk, fontSize: 14, fontWeight: FontWeight.w900), maxLines: 1, overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}

// ─── NumPad Widget ────────────────────────────────────────────────────────────
class _NumPad extends StatelessWidget {
  final void Function(String) onTus;
  final bool ondalikAktif;
  const _NumPad({required this.onTus, this.ondalikAktif = true});

  @override
  Widget build(BuildContext context) {
    final tuslar = [
      ['7', '8', '9'],
      ['4', '5', '6'],
      ['1', '2', '3'],
      [ondalikAktif ? '.' : '', '0', 'DEL'],
    ];
    return Column(
      children: tuslar.map((satir) {
        return Expanded(
          child: Row(
            children: satir.map((tus) {
              if (tus.isEmpty) return Expanded(child: const SizedBox());
              final isDel = tus == 'DEL';
              return Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(3),
                  child: Material(
                    color: isDel ? const Color(0xFFEAEAEA) : Colors.white,
                    borderRadius: BorderRadius.circular(0),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(0),
                      onTap: () {
                        HapticFeedback.selectionClick();
                        onTus(tus);
                      },
                      child: Center(
                        child: isDel
                            ? const Icon(Icons.backspace_outlined, color: Color(0xFF6B7280), size: 20)
                            : Text(
                                tus,
                                style: const TextStyle(
                                  color: Color(0xFF1A1A1A),
                                  fontSize: 22,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                      ),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        );
      }).toList(),
    );
  }
}
