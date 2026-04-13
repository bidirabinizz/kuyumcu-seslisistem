import queue
import sys
import sounddevice as sd
from vosk import Model, KaldiRecognizer
import json

# Ses verilerini tutacağımız kuyruk (Asenkron gecikmeyi önler)
q = queue.Queue()

def ses_kuyrugu_callback(indata, frames, time, status):
    """Mikrofondan gelen sesi anlık olarak kuyruğa aktarır"""
    if status:
        print(status, file=sys.stderr)
    q.put(bytes(indata))

def main():
    print("Vosk Türkçe Modeli yükleniyor... (Birkaç saniye sürebilir)")
    
    try:
        # 'model' klasörünü arar. Bulamazsa hata fırlatır.
        model = Model("model")
    except Exception as e:
        print("\n[KRİTİK HATA]: 'model' klasörü bulunamadı!")
        print("Lütfen indirdiğiniz zip dosyasını klasöre çıkarıp adını 'model' yapın ve bu kodun yanına koyun.")
        return

    # Sesi 16000 Hz'de işlemek için tanıyıcıyı başlat
    recognizer = KaldiRecognizer(model, 16000)

    # TETİKLEME KELİMELERİMİZ (Küçük harfle yazılmalı)
    WAKE_WORDS = ["ahmet", "zeynep", "sistem", "kasa"]

    print("\n[SİSTEM UYKUDA]: Arka planda sıfır gecikmeyle dinleniyor...")
    print(f">>> Uyanmak için şu kelimelerden birini söyleyin: {WAKE_WORDS} (Çıkmak için Ctrl+C) <<<")

    try:
        # Mikrofonu sürekli ve asenkron dinleme modunda aç
        with sd.RawInputStream(samplerate=16000, blocksize=8000, device=None, dtype='int16',
                               channels=1, callback=ses_kuyrugu_callback):
            while True:
                data = q.get()
                
                # Vosk, sesi alır almaz analiz etmeye başlar
                if recognizer.AcceptWaveform(data):
                    sonuc = json.loads(recognizer.Result())
                    metin = sonuc.get("text", "")
                else:
                    # Sıfır gecikme (Low-Latency) için henüz cümle bitmeden anlık kelime yakalama
                    kismi_sonuc = json.loads(recognizer.PartialResult())
                    metin = kismi_sonuc.get("partial", "")

                # Yakalanan anlık metnin içinde tetikleme kelimelerimizden biri var mı?
                for kelime in WAKE_WORDS:
                    if kelime in metin:
                        print(f"\n[BİİP!] UYANDIRMA KELİMESİ ALGILANDI: ==> '{kelime.upper()}' <==")
                        print(">>> (Burada Whisper devreye girip 5 saniyelik satış komutunu dinleyecek) <<<")
                        
                        # Sistemi tetikledikten sonra geçmiş hafızayı temizle ki art arda tetiklenmesin
                        recognizer.Reset()
                        
                        # 5 saniyelik Whisper dinlemesi bittiğini varsayalım
                        print("\n[SİSTEM UYKUDA]: Tekrar dinleniyor...\n")
                        break # İç döngüden çık, yeniden dinlemeye başla

    except KeyboardInterrupt:
        print("\nSistem manuel olarak kapatılıyor...")
    except Exception as e:
        print(f"\nBeklenmeyen bir hata oluştu: {e}")

if __name__ == '__main__':
    main()