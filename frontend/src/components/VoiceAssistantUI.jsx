import React from 'react';
import { Mic, Loader2, AlertCircle, CreditCard, Banknote } from 'lucide-react';

// Ürün cinsi → okunabilir etiket
const URUN_LABEL = {
  '24_AYAR': '24 Ayar',  '22_AYAR': '22 Ayar', '18_AYAR': '18 Ayar', '14_AYAR': '14 Ayar',
  'CEYREK_ALTIN': 'Çeyrek Altın', 'YARIM_ALTIN': 'Yarım Altın',
  'TAM_ALTIN': 'Tam Altın', 'ATA_ALTIN': 'Ata Altın', 'PIRLANTA': 'Pırlanta',
};

export const VoiceAssistantUI = ({ voiceState }) => {
  if (!voiceState || voiceState.state === 'IDLE') return null;

  const islem     = voiceState.islem;
  const odemeTipi = islem?.odeme_tipi ?? 'NAKIT';
  const kategori  = islem?.urun_kategorisi ?? 'ALTIN';

  const islemOzetStr = (() => {
    if (!islem) return null;
    const tipStr = islem.islem_tipi === 'ALIS' ? 'ALIŞ' : 'SATIŞ';
    if (kategori === 'SARRAFIYE') {
      const ad = URUN_LABEL[islem.urun_cinsi] ?? islem.urun_cinsi;
      return `${islem.miktar ?? 1} Adet ${ad} · ${tipStr}`;
    }
    if (kategori === 'PIRLANTA') {
      return `${islem.miktar ?? 1} Adet Pırlanta · ${tipStr}`;
    }
    const ayar = (islem.urun_cinsi ?? '').replace('_AYAR', ' Ayar');
    return `${islem.brut_miktar ?? islem.miktar} gr ${ayar} · ${tipStr}`;
  })();

  return (
    <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end animate-fadeUp gap-2">

      {/* DİNLİYOR */}
      {voiceState.state === 'LISTENING' && (
        <div className="flex items-center gap-3 bg-blue-600 text-white px-5 py-3 rounded-full shadow-lg shadow-blue-600/30">
          <Mic className="animate-pulse" size={20} />
          <span className="font-bold text-sm tracking-wide">Asistan Dinliyor...</span>
        </div>
      )}

      {/* DÜŞÜNÜYOR */}
      {voiceState.state === 'THINKING' && (
        <div className="flex items-center gap-3 bg-amber-500 text-white px-5 py-3 rounded-full shadow-lg shadow-amber-500/30">
          <Loader2 className="animate-spin" size={20} />
          <span className="font-bold text-sm tracking-wide">Ses İşleniyor...</span>
        </div>
      )}

      {/* ONAY BEKLIYOR — Genişletilmiş Preview */}
      {voiceState.state === 'CONFIRMING' && islem && (
        <div className="bg-white border-2 border-indigo-500 p-5 rounded-2xl shadow-2xl w-80 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-ink-100 pb-2">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1.5">
              <span className="animate-ping w-2 h-2 rounded-full bg-indigo-500 inline-block" />
              Sesli Komut Algılandı
            </span>
          </div>

          {/* İşlem özeti */}
          <div>
            <p className="font-display font-black text-2xl text-ink-900 leading-tight">
              {islemOzetStr}
            </p>
            {islem.net_has > 0 && (
              <p className="text-xs text-amber-600 font-semibold mt-1">
                ≈ {Number(islem.net_has).toFixed(4)} gr has altın
              </p>
            )}
          </div>

          {/* Ödeme tipi rozeti */}
          <div className="flex items-center gap-2">
            {odemeTipi === 'KART' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                <CreditCard size={13} /> Kartlı Ödeme
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Banknote size={13} /> Nakit Ödeme
              </span>
            )}
          </div>

          {/* Uyarı (adet bulunamadı vs.) */}
          {islem.uyari && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs font-semibold text-amber-700">
              ⚠ {islem.uyari}
            </div>
          )}

          <div className="bg-ink-50 rounded-lg p-3 text-center">
            <p className="text-xs font-bold text-ink-600 animate-pulse">
              "Onaylıyorum" veya "İptal" diyerek işlemi sonlandırın
            </p>
          </div>
        </div>
      )}

      {/* HATA */}
      {voiceState.state === 'ERROR' && (
        <div className="flex items-center gap-3 bg-red-600 text-white px-5 py-3 rounded-full shadow-lg shadow-red-600/30">
          <AlertCircle size={20} />
          <span className="font-bold text-sm tracking-wide">{voiceState.mesaj || 'Komut Anlaşılamadı'}</span>
        </div>
      )}
    </div>
  );
};