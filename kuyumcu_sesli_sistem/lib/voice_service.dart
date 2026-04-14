import 'dart:async';
import 'dart:typed_data';
import 'package:record/record.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:audioplayers/audioplayers.dart';

import 'config.dart';

class VoiceService {
  // Callback'ler: UI tarafına veri aktarımı
  final void Function(String message)? onStatusChanged;
  final void Function()? onDisconnected;
  final void Function(double amplitude)? onAmplitudeChanged; // YENİ: Ses şiddeti için

  VoiceService({
    this.onStatusChanged, 
    this.onDisconnected, 
    this.onAmplitudeChanged
  });

  final AudioRecorder _recorder = AudioRecorder();
  final AudioPlayer _audioPlayer = AudioPlayer();
  WebSocketChannel? _channel;
  StreamSubscription? _wsSubscription;
  StreamSubscription? _audioSubscription;

  bool _isListening = false;
  bool _disposed = false;
  bool _isManualStop = false; // Kullanıcının mı durdurduğunu takip eder
  int _reconnectCount = 0;    // Yeniden bağlanma deneme sayısı
  int? _lastPersonelId;      // Kopma durumunda tekrar bağlanmak için ID

  Future<bool> startStreaming(int personelId) async {
    if (_disposed) return false;
    _lastPersonelId = personelId;
    _isManualStop = false;

    final hasPermission = await _recorder.hasPermission();
    if (!hasPermission) return false;

    try {
      _channel = WebSocketChannel.connect(
        Uri.parse("${AppConfig.wsBase}/$personelId"),
      );

      // WebSocket bağlantısı hazır mı kontrol et
      await _channel!.ready.timeout(
        const Duration(seconds: 5),
        onTimeout: () => throw TimeoutException("Bağlantı zaman aşımı"),
      );

      // Sunucudan gelen mesajları ve sesleri dinle
      _wsSubscription = _channel!.stream.listen(
        (message) {
          if (_disposed) return;
          if (message is Uint8List) {
            _audioPlayer.play(BytesSource(message));
          } else if (message is String) {
            onStatusChanged?.call(message.toUpperCase());
          }
        },
        onError: (e) => _handleDisconnect(),
        onDone: () => _handleDisconnect(),
      );

      // Ses kayıt ayarları
      const config = RecordConfig(
        encoder: AudioEncoder.pcm16bits,
        sampleRate: 16000,
        numChannels: 1,
      );

      final stream = await _recorder.startStream(config);
      _isListening = true;
      _reconnectCount = 0; // Başarılı bağlantıda sayacı sıfırla

      _audioSubscription = stream.listen((data) {
        if (_isListening && !_disposed) {
          _channel?.sink.add(data);
          
          // --- YENİ: ANLIK SES ŞİDDETİ (AMPLITUDE) HESAPLAMA ---
          _calculateAmplitude(data);
        }
      });

      return true;
    } catch (e) {
      await _cleanup();
      return false;
    }
  }

  /// PCM 16-bit veri içinden en yüksek genliği bulur ve 0.0 - 1.0 arasına normalize eder.
  void _calculateAmplitude(Uint8List data) {
    if (onAmplitudeChanged == null) return;
    
    int maxVal = 0;
    // PCM 16-bit veride her 2 byte bir örnek (sample) oluşturur
    for (int i = 0; i < data.length; i += 2) {
      if (i + 1 >= data.length) break;
      
      // Little-endian formatında 2 byte'ı 16-bit signed integer'a çevir
      int sample = ByteData.sublistView(data, i, i + 2).getInt16(0, Endian.little);
      if (sample.abs() > maxVal) maxVal = sample.abs();
    }
    
    // 32768, 16-bit signed tamsayı için maksimum mutlak değerdir
    double normalized = (maxVal / 32768.0).clamp(0.0, 1.0);
    onAmplitudeChanged!(normalized);
  }

  /// Bağlantı koptuğunda otomatik yeniden bağlanma mantığı
  void _handleDisconnect() {
    if (_disposed || _isManualStop) return;

    if (_reconnectCount < 3) {
      _reconnectCount++;
      onStatusChanged?.call("BAĞLANTI KOPTU, DENENİYOR... ($_reconnectCount/3)");
      
      Timer(const Duration(seconds: 2), () {
        if (_lastPersonelId != null) {
          startStreaming(_lastPersonelId!);
        }
      });
    } else {
      onStatusChanged?.call("SUNUCUYA ERİŞİLEMİYOR");
      onDisconnected?.call();
      _cleanup();
    }
  }

  void stopStreaming() {
    _isManualStop = true;
    _cleanup();
  }

  Future<void> _cleanup() async {
    _isListening = false;
    await _audioSubscription?.cancel();
    _audioSubscription = null;
    await _wsSubscription?.cancel();
    _wsSubscription = null;
    await _recorder.stop();
    await _channel?.sink.close();
    _channel = null;
    await _audioPlayer.stop();
    onAmplitudeChanged?.call(0.0); // Şiddeti sıfırla
  }

  Future<void> dispose() async {
    _disposed = true;
    await _cleanup();
    await _recorder.dispose();
    await _audioPlayer.dispose();
  }
}