import 'dart:async';
import 'dart:typed_data';
import 'package:record/record.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:audioplayers/audioplayers.dart';

import 'config.dart';

class VoiceService {
  // Callback'ler: dışarıya durum bildirimi
  final void Function(String message)? onStatusChanged;
  final void Function()? onDisconnected;

  VoiceService({this.onStatusChanged, this.onDisconnected});

  // Tek bir instance, dispose edilebilir
  final AudioRecorder _recorder = AudioRecorder();
  final AudioPlayer _audioPlayer = AudioPlayer();
  WebSocketChannel? _channel;
  StreamSubscription? _wsSubscription;
  StreamSubscription? _audioSubscription;

  bool _isListening = false;
  bool _disposed = false;

  // Başarı/başarısızlık dönüyor artık
  Future<bool> startStreaming(int personelId) async {
    if (_disposed) return false;

    final hasPermission = await _recorder.hasPermission();
    if (!hasPermission) return false;

    try {
      _channel = WebSocketChannel.connect(
        Uri.parse("${AppConfig.wsBase}/$personelId"),
      );

      // WebSocket bağlantısı kuruldu mu kontrol et
      await _channel!.ready.timeout(
        const Duration(seconds: 5),
        onTimeout: () => throw TimeoutException("WebSocket bağlantı zaman aşımı"),
      );

      // Sunucudan gelen mesajları dinle
      _wsSubscription = _channel!.stream.listen(
        (message) {
          if (_disposed) return;
          if (message is Uint8List) {
            // Onay sesini çal
            _audioPlayer.play(BytesSource(message));
          } else if (message is String) {
            // Sunucudan gelen durum mesajını UI'ya ilet
            onStatusChanged?.call(message.toUpperCase());
          }
        },
        onError: (e) {
          if (!_disposed) onDisconnected?.call();
        },
        onDone: () {
          if (!_disposed && _isListening) onDisconnected?.call();
        },
      );

      // Ses akışını başlat
      const config = RecordConfig(
        encoder: AudioEncoder.pcm16bits,
        sampleRate: 16000,
        numChannels: 1,
      );

      final stream = await _recorder.startStream(config);
      _isListening = true;

      _audioSubscription = stream.listen((data) {
        if (_isListening && !_disposed) {
          _channel?.sink.add(data);
        }
      });

      return true;
    } catch (e) {
      await _cleanup();
      return false;
    }
  }

  void stopStreaming() {
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
  }

  // Widget dispose edilince çağır
  Future<void> dispose() async {
    _disposed = true;
    await _cleanup();
    await _recorder.dispose();
    await _audioPlayer.dispose();
  }
}