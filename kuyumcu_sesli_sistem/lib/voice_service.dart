import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:record/record.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:audioplayers/audioplayers.dart';

import 'config.dart';

class VoiceService {
  final void Function(String message)? onStatusChanged;
  final void Function()? onDisconnected;
  final void Function(double amplitude)? onAmplitudeChanged;

  VoiceService({
    this.onStatusChanged,
    this.onDisconnected,
    this.onAmplitudeChanged,
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
      print("AudioContext hatası: $e");
    }
  }

  final AudioRecorder _recorder = AudioRecorder();
  final AudioPlayer _audioPlayer = AudioPlayer();
  WebSocketChannel? _channel;
  StreamSubscription? _wsSubscription;
  StreamSubscription? _audioSubscription;

  bool _isListening = false;
  bool _disposed = false;
  bool _isManualStop = false;
  int _reconnectCount = 0;
  int? _lastPersonelId;

  // Mikrofonun kapalı tutulacağı süreyi Timer ile yönet
  // PlayerState yerine kesin süreye dayalı yaklaşım
  Timer? _muteTimer;
  bool _isMuted = false;

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

      await _channel!.ready.timeout(
        const Duration(seconds: 5),
        onTimeout: () => throw TimeoutException("Bağlantı zaman aşımı"),
      );

      _wsSubscription = _channel!.stream.listen(
        (message) {
          if (_disposed) return;

          if (message is Uint8List) {
            // Ses verisi geldi → çal
            _audioPlayer.play(BytesSource(message));
          } else if (message is String) {
            _handleTextMessage(message);
          }
        },
        onError: (e) => _handleDisconnect(),
        onDone: () => _handleDisconnect(),
      );

      const config = RecordConfig(
  encoder: AudioEncoder.pcm16bits,
  sampleRate: 16000,
  numChannels: 1,
  echoCancel: true,   // Hoparlörden konuşuyorsan true, kulaklıkta false yap
  noiseSuppress: true,
  autoGain: true,
  bitRate: 128000,
);

      final stream = await _recorder.startStream(config);
      _isListening = true;
      _reconnectCount = 0;

      _audioSubscription = stream.listen((data) {
        if (!_isListening || _disposed) return;

        if (_isMuted) {
          // Sessizlik gönder — sunucu bağlantıyı kopuk sanmasın
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

  void _handleTextMessage(String message) {
    // "TTS_START:1800" formatı → 1800ms mikrofonu kapat
    if (message.startsWith('TTS_START:')) {
      final msStr = message.substring('TTS_START:'.length);
      final ms = int.tryParse(msStr);
      if (ms != null) {
        _muteMicrophone(Duration(milliseconds: ms + 400)); // +400ms güvenlik payı
      }
      return;
    }

    // JSON mesajlar
    if (message.trim().startsWith('{')) {
      try {
        final data = jsonDecode(message);
        final type = data['type'];
        final state = data['state'];
        if (type == 'VOICE_STATE') {
          if (state == 'CONFIRMING') {
            onStatusChanged?.call("ONAY BEKLENİYOR...");
          } else if (state == 'IDLE') {
            onStatusChanged?.call("UYANIYOR...");
          } else if (state == 'LISTENING') {
            onStatusChanged?.call("DİNLİYOR...");
          } else if (state == 'THINKING') {
            onStatusChanged?.call("DÜŞÜNÜYOR...");
          }
        }
      } catch (_) {}
      return;
    }

    // Düz metin mesajlar
    onStatusChanged?.call(message.toUpperCase());
  }

  /// Mikrofonu belirtilen süre boyunca sessizleştirir.
  /// Birden fazla TTS art arda gelirse timer sıfırlanır.
  void _muteMicrophone(Duration duration) {
    _muteTimer?.cancel();
    _isMuted = true;
    print("🔇 Mikrofon ${duration.inMilliseconds}ms susturuldu");

    _muteTimer = Timer(duration, () {
      if (!_disposed) {
        _isMuted = false;
        print("🎤 Mikrofon tekrar açıldı");
      }
    });
  }

  void _calculateAmplitude(Uint8List data) {
    if (onAmplitudeChanged == null) return;
    int maxVal = 0;
    for (int i = 0; i < data.length; i += 2) {
      if (i + 1 >= data.length) break;
      int sample = ByteData.sublistView(data, i, i + 2).getInt16(0, Endian.little);
      if (sample.abs() > maxVal) maxVal = sample.abs();
    }
    double normalized = (maxVal / 32768.0).clamp(0.0, 1.0);
    onAmplitudeChanged!(normalized);
  }

  void _handleDisconnect() {
    if (_disposed || _isManualStop) return;

    if (_reconnectCount < 3) {
      _reconnectCount++;
      onStatusChanged?.call("BAĞLANTI KOPTU, DENENİYOR... ($_reconnectCount/3)");
      Timer(const Duration(seconds: 2), () {
        if (_lastPersonelId != null) startStreaming(_lastPersonelId!);
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
    _isMuted = false;
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
  }

  Future<void> dispose() async {
    _disposed = true;
    await _cleanup();
    await _recorder.dispose();
    await _audioPlayer.dispose();
  }
}