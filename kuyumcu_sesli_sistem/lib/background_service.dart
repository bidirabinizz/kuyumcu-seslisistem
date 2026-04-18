import 'dart:async';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';

// ─── Foreground Task Başlatıcı ────────────────────────────────────────────────
class BackgroundServiceManager {
  static bool _initialized = false;

  /// Servisi yapılandır (uygulama ilk çalıştığında bir kez çağır)
  static Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'kuyumcu_voice_channel',
        channelName: 'Kuyumcu Sesli Sistem',
        channelDescription: 'Sesli komut servisi arka planda çalışıyor',
        channelImportance: NotificationChannelImportance.LOW,
        priority: NotificationPriority.LOW,
        // Düzeltme: iconData parametresi tamamen kaldırıldı. 
        // Paket varsayılan olarak Android'in 'ic_launcher' ikonunu otomatik bulur.
      ),
      iosNotificationOptions: const IOSNotificationOptions(
        showNotification: true,
        playSound: false,
      ),
      foregroundTaskOptions: ForegroundTaskOptions(
        eventAction: ForegroundTaskEventAction.repeat(5000),
        autoRunOnBoot: false,
        allowWakeLock: true,
        allowWifiLock: true,
      ),
    );
  }

  /// Foreground servisi başlat
  static Future<ServiceRequestResult> start() async {
    if (await FlutterForegroundTask.isRunningService) {
      return FlutterForegroundTask.restartService();
    }
    return FlutterForegroundTask.startService(
      serviceId: 256,
      notificationTitle: 'Kuyumcu Sesli Sistem',
      notificationText: 'Sesli komut dinleniyor...',
      callback: _taskCallback,
    );
  }

  /// Foreground servisi durdur
  static Future<ServiceRequestResult> stop() async {
    return FlutterForegroundTask.stopService();
  }

  /// Bildirim metnini güncelle
  static Future<void> updateNotification(String text) async {
    FlutterForegroundTask.updateService(
      notificationTitle: 'Kuyumcu Sesli Sistem',
      notificationText: text,
    );
  }
}

// ─── Görev Callback'i (Ayrı Isolate'de çalışır) ───────────────────────────────
@pragma('vm:entry-point')
void _taskCallback() {
  FlutterForegroundTask.setTaskHandler(_VoiceTaskHandler());
}

class _VoiceTaskHandler extends TaskHandler {
  @override
  Future<void> onStart(DateTime timestamp, TaskStarter taskStarter) async {
    print('[BackgroundTask] Başlatıldı: $timestamp');
  }

  @override
  void onRepeatEvent(DateTime timestamp) {
    // Her 5 saniyede bir çalışır — watchdog olarak kullanılabilir
    FlutterForegroundTask.sendDataToMain({'event': 'heartbeat', 'ts': timestamp.millisecondsSinceEpoch});
  }

  @override
  Future<void> onDestroy(DateTime timestamp, bool isTimeout) async {
    print('[BackgroundTask] Durduruldu: $timestamp (Timeout mu?: $isTimeout)');
  }
}
