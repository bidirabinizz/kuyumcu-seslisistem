import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:record/record.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:audioplayers/audioplayers.dart';

import 'config.dart';

/// Sesli komuttan ayrıştırılan işlem ön-izlemesi
class IslemPreview {
  final String islemTipi;    // "ALIS" | "SATIS"
  final String kategori;     // "ALTIN" | "SARRAFIYE" | "PIRLANTA"
  final String urunCinsi;    // "22_AYAR", "CEYREK_ALTIN" …
  final double miktar;
  final int adet;
  final String odemeTipi;   // "NAKIT" | "KART"
  final double netHas;
  final String? uyari;

  const IslemPreview({
    required this.islemTipi,
    required this.kategori,
    required this.urunCinsi,
    required this.miktar,
    required this.adet,
    required this.odemeTipi,
    required this.netHas,
    this.uyari,
  });

  factory IslemPreview.fromJson(Map<String, dynamic> j) {
    return IslemPreview(
      islemTipi: j['islem_tipi']     ?? j['tip']       ?? '',
      kategori:  j['urun_kategorisi'] ?? 'ALTIN',
      urunCinsi: j['urun_cinsi']     ?? '',
      miktar:    (j['miktar']   ?? j['brut_miktar'] ?? 0).toDouble(),
      adet:      (j['adet']     ?? 1).toInt(),
      odemeTipi: j['odeme_tipi'] ?? 'NAKIT',
      netHas:    (j['has'] ?? j['net_has_miktar'] ?? j['net_has'] ?? 0).toDouble(),
      uyari:     j['uyari'],
    );
  }

  /// Ekranda gösterilecek kısa açıklama
  String get ozet {
    final tipStr   = islemTipi == 'ALIS' ? 'ALIŞ' : 'SATIŞ';
    final odemeStr = odemeTipi == 'KART' ? 'KARTLI' : 'NAKİT';

    if (kategori == 'SARRAFIYE') {
      final urunAd = urunCinsi
          .replaceAll('_ALTIN', '')
          .replaceAll('_', ' ')
          .toUpperCase();
      return '$adet Adet $urunAd · $tipStr · $odemeStr';
    } else if (kategori == 'PIRLANTA') {
      return '$adet Adet Pırlanta · $tipStr · $odemeStr';
    } else {
      final ayar = urunCinsi.replaceAll('_AYAR', '');
      return '${miktar.toStringAsFixed(2)} gr $ayar Ayar · $tipStr · $odemeStr';
    }
  }
}

class VoiceService {
  final void Function(String message)?         onStatusChanged;
  final void Function()?                       onDisconnected;
  final void Function(double amplitude)?       onAmplitudeChanged;
  final void Function(IslemPreview? preview)?  onCommandPreview;
  final void Function(int attempt, Duration nextRetry)? onReconnectAttempt;

  VoiceService({
    this.onStatusChanged,
    this.onDisconnected,
    this.onAmplitudeChanged,
    this.onCommandPreview,
    this.onReconnectAttempt,
  }) {
    _initAudioContext();
  }

  Future<void> _initAudioContext() async {
    try {
      await AudioPlayer.global.setAudioContext(AudioContext(
        android: AudioContextAndroid(
          isSpeakerphoneOn: true,
          audioFocus: AndroidAudioFocus.none,
        ),
        iOS: AudioContextIOS(
          category: AVAudioSessionCategory.playAndRecord,
          options: {
            AVAudioSessionOptions.defaultToSpeaker,
            AVAudioSessionOptions.mixWithOthers,
          },
        ),
      ));
    } catch (e) {
      print('AudioContext hatası: $e');
    }
  }

  final AudioRecorder _recorder    = AudioRecorder();
  final AudioPlayer   _audioPlayer = AudioPlayer();

  WebSocketChannel? _channel;
  StreamSubscription? _wsSubscription;
  StreamSubscription? _audioSubscription;

  bool _isListening   = false;
  bool _disposed      = false;
  bool _isManualStop  = false;

  // Exponential backoff için durum
  int      _reconnectCount = 0;
  int?     _lastPersonelId;
  Timer?   _reconnectTimer;

  static const int    _maxReconnectDelaySec = 30;
  static const int    _baseDelaySec         = 1;

  // Mikrofon susturma (TTS çalarken)
  Timer? _muteTimer;
  bool   _isMuted = false;

  // ── Bağlantı Kurma ───────────────────────────────────────────────────────────
  Future<bool> startStreaming(int personelId) async {
    if (_disposed) return false;
    _lastPersonelId  = personelId;
    _isManualStop    = false;

    final hasPermission = await _recorder.hasPermission();
    if (!hasPermission) return false;

    try {
      _channel = WebSocketChannel.connect(
        Uri.parse('${AppConfig.wsBase}/$personelId'),
      );

      await _channel!.ready.timeout(
        const Duration(seconds: 5),
        onTimeout: () => throw TimeoutException('Bağlantı zaman aşımı'),
      );

      // Başarılı bağlantı → backoff sıfırla
      _reconnectCount = 0;

      _wsSubscription = _channel!.stream.listen(
        (message) {
          if (_disposed) return;
          if (message is Uint8List) {
            _audioPlayer.play(BytesSource(message));
          } else if (message is String) {
            _handleTextMessage(message);
          }
        },
        onError: (_) => _handleDisconnect(),
        onDone: ()  => _handleDisconnect(),
      );

      const config = RecordConfig(
        encoder:     AudioEncoder.pcm16bits,
        sampleRate:  16000,
        numChannels: 1,
        echoCancel:  true,
        noiseSuppress: true,
        autoGain:    true,
        bitRate:     128000,
      );

      final stream = await _recorder.startStream(config);
      _isListening = true;

      _audioSubscription = stream.listen((data) {
        if (!_isListening || _disposed) return;

        if (_isMuted) {
          // Sessiz veri gönder — bağlantıyı ayakta tutar
          _channel?.sink.add(Uint8List(data.length));
        } else {
          _channel?.sink.add(data);
        }

        _calculateAmplitude(_isMuted ? Uint8List(data.length) : data);
      });

      return true;
    } catch (e) {
      await _cleanup();
      return false;
    }
  }

  // ── Metin Mesaj İşleyici ──────────────────────────────────────────────────────
  void _handleTextMessage(String message) {
    // "TTS_START:1800" → mikrofonu kapat
    if (message.startsWith('TTS_START:')) {
      final ms = int.tryParse(message.substring('TTS_START:'.length));
      if (ms != null) {
        _muteMicrophone(Duration(milliseconds: ms + 400));
      }
      return;
    }

    // JSON mesajlar
    if (message.trim().startsWith('{')) {
      try {
        final data  = jsonDecode(message) as Map<String, dynamic>;
        final type  = data['type'];
        final state = data['state'];

        if (type == 'VOICE_STATE') {
          switch (state) {
            case 'CONFIRMING':
              onStatusChanged?.call('ONAY BEKLENİYOR...');
              // İşlem önizlemesini üst katmana ilet
              if (data['islem'] != null) {
                try {
                  final preview = IslemPreview.fromJson(
                    Map<String, dynamic>.from(data['islem']),
                  );
                  onCommandPreview?.call(preview);
                } catch (_) {}
              }
              break;
            case 'IDLE':
              onStatusChanged?.call('UYANIYOR...');
              onCommandPreview?.call(null); // önizlemeyi temizle
              break;
            case 'LISTENING':
              onStatusChanged?.call('DİNLİYOR...');
              onCommandPreview?.call(null);
              break;
            case 'THINKING':
              onStatusChanged?.call('DÜŞÜNÜYOR...');
              break;
          }
        }
      } catch (_) {}
      return;
    }

    // Hata / düz metin mesajlar
    if (message.startsWith('HATA:')) {
      onStatusChanged?.call('⚠ ${message.substring(5).toUpperCase()}');
      onCommandPreview?.call(null);
      return;
    }

    onStatusChanged?.call(message.toUpperCase());
  }

  // ── Mikrofon Susturma ─────────────────────────────────────────────────────────
  void _muteMicrophone(Duration duration) {
    _muteTimer?.cancel();
    _isMuted = true;
    print('🔇 Mikrofon ${duration.inMilliseconds}ms susturuldu');

    _muteTimer = Timer(duration, () {
      if (!_disposed) {
        _isMuted = false;
        print('🎤 Mikrofon tekrar açıldı');
      }
    });
  }

  // ── Amplitude Hesaplama ───────────────────────────────────────────────────────
  void _calculateAmplitude(Uint8List data) {
    if (onAmplitudeChanged == null) return;
    int maxVal = 0;
    for (int i = 0; i < data.length - 1; i += 2) {
      int sample = ByteData.sublistView(data, i, i + 2).getInt16(0, Endian.little);
      if (sample.abs() > maxVal) maxVal = sample.abs();
    }
    final normalized = (maxVal / 32768.0).clamp(0.0, 1.0);
    onAmplitudeChanged!(normalized);
  }

  // ── Exponential Backoff Reconnect ─────────────────────────────────────────────
  void _handleDisconnect() {
    if (_disposed || _isManualStop) return;

    // Delay hesapla: 1s → 2s → 4s … max 30s
    final delaySec = (_baseDelaySec * (1 << _reconnectCount)).clamp(1, _maxReconnectDelaySec);
    final delay    = Duration(seconds: delaySec);

    _reconnectCount++;
    onReconnectAttempt?.call(_reconnectCount, delay);
    onStatusChanged?.call('BAĞLANTI KOPTU · ${delaySec}SN SONRA YENİDEN...');

    print('⚡ Reconnect #$_reconnectCount — ${delaySec}sn sonra denenecek');

    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(delay, () async {
      if (!_disposed && !_isManualStop && _lastPersonelId != null) {
        final basarili = await startStreaming(_lastPersonelId!);
        if (!basarili) _handleDisconnect(); // tekrar dene
      }
    });
  }

  // ── Durdurma ─────────────────────────────────────────────────────────────────
  void stopStreaming() {
    _isManualStop = true;
    _reconnectTimer?.cancel();
    _cleanup();
  }

  Future<void> _cleanup() async {
    _isListening = false;
    _isMuted     = false;
    _muteTimer?.cancel();
    _muteTimer = null;
    await _audioSubscription?.cancel();
    _audioSubscription = null;
    await _wsSubscription?.cancel();
    _wsSubscription = null;
    await _recorder.stop();
    await _channel?.sink.close();
    _channel = null;
    await _audioPlayer.stop();
    onAmplitudeChanged?.call(0.0);
    onCommandPreview?.call(null);
  }

  Future<void> dispose() async {
    _disposed = true;
    _reconnectTimer?.cancel();
    await _cleanup();
    await _recorder.dispose();
    await _audioPlayer.dispose();
  }
}