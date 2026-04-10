import whisper
import speech_recognition as sr
import re
import os

MILYEM_MAP = {
    "24_AYAR": 1.0000, "22_AYAR": 0.9160, 
    "18_AYAR": 0.7500, "14_AYAR": 0.5850
}

def metni_temizle(metin: str):
    """Whisper'ın Türkçe formatındaki hatalarını düzeltir."""
    # Virgülleri noktaya çevir (10,5 -> 10.5)
    metin = metin.replace(",", ".")
    # Fazla boşlukları al ve küçük harfe çevir
    return metin.strip().lower()

def sesli_komutu_ayristir(metin: str, personel_id: int):
    metin = metni_temizle(metin)
    
    # Geliştirilmiş Regex: gram/gr/g opsiyonel, virgül/nokta destekli
    # Ayar veya kelime hatalarını tolere etmek için son kısmı esnettik
    pattern = r"(alış|satış)\s+(\d+(?:\.\d+)?)\s*(?:gram|gr|g)?\s*(\d{2})\s*(?:ayar|kez|ay)?"
    match = re.search(pattern, metin)
    
    if match:
        islem_tipi = "ALIS" if match.group(1) == "alış" else "SATIS"
        brut_miktar = float(match.group(2))
        urun_cinsi = f"{match.group(3)}_AYAR"
        milyem = MILYEM_MAP.get(urun_cinsi, 0.0)
        
        return {
            "personel_id": personel_id,
            "islem_tipi": islem_tipi,
            "urun_cinsi": urun_cinsi,
            "brut_miktar": brut_miktar,
            "milyem": milyem,
            "net_has_miktar": round(brut_miktar * milyem, 3)
        }
    return None

def main():
   
    print("AI Modeli yükleniyor (Small Model)...")
    model = whisper.load_model("small") 
    recognizer = sr.Recognizer()

    with sr.Microphone() as source:
        print("\n[Mikrofon Kalibrasyonu Yapılıyor... Ses Çıkarmayın]")
        recognizer.adjust_for_ambient_noise(source, duration=1)
        
        print("\n>>> LÜTFEN KONUŞUN (Örn: 'Satış 10 gram 22 ayar') <<<")
        try:
            audio = recognizer.listen(source, timeout=5, phrase_time_limit=5)
            print("Ses yakalandı, Whisper metne döküyor...")
            
            temp_file = "temp_ses.wav"
            with open(temp_file, "wb") as f:
                f.write(audio.get_wav_data())
            
           
            prompt = "Kuyumcu işlemleri: Satış 10 gram 22 ayar. Alış 5.5 gram 14 ayar."
            
            result = model.transcribe(
                temp_file, 
                language="tr", 
                fp16=False,
                initial_prompt=prompt
            )
            
            ham_metin = result["text"].strip()
            print(f"\n[AI Ham Algılaması]: {ham_metin}")
            
            json_veri = sesli_komutu_ayristir(ham_metin, personel_id=1)
            
            if json_veri:
                print(f"[Başarılı JSON Ayrıştırma]: {json_veri}")
            else:
                print(f"[HATA]: Anlaşılan metin format dışı: '{metni_temizle(ham_metin)}'")
                
            if os.path.exists(temp_file):
                os.remove(temp_file)
                
        except sr.WaitTimeoutError:
            print("Zaman aşımı: Ses algılanmadı.")
        except Exception as e:
            print(f"Kritik hata: {e}")

if __name__ == "__main__":
    main()