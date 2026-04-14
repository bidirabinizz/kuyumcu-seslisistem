import React from 'react';
import { Mic, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export const VoiceAssistantUI = ({ voiceState }) => {
  if (!voiceState || voiceState.state === 'IDLE') return null;

  return (
    <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end animate-fadeUp">
      {/* 1. DURUM: DİNLİYOR */}
      {voiceState.state === 'LISTENING' && (
        <div className="flex items-center gap-3 bg-blue-600 text-white px-5 py-3 rounded-full shadow-lg shadow-blue-600/30">
          <Mic className="animate-pulse" size={20} />
          <span className="font-bold text-sm tracking-wide">Asistan Dinliyor...</span>
        </div>
      )}

      {/* 2. DURUM: İŞLİYOR / DÜŞÜNÜYOR */}
      {voiceState.state === 'THINKING' && (
        <div className="flex items-center gap-3 bg-amber-500 text-white px-5 py-3 rounded-full shadow-lg shadow-amber-500/30">
          <Loader2 className="animate-spin" size={20} />
          <span className="font-bold text-sm tracking-wide">Ses İşleniyor...</span>
        </div>
      )}

      {/* 3. DURUM: ONAY BEKLİYOR */}
      {voiceState.state === 'CONFIRMING' && voiceState.islem && (
        <div className="bg-white border-2 border-indigo-500 p-5 rounded-2xl shadow-2xl w-72 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-ink-100 pb-2">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1">
               <span className="animate-ping w-2 h-2 rounded-full bg-indigo-500 inline-block"></span>
               Sesli Komut Algılandı
            </span>
          </div>
          <div>
            <p className="font-display font-black text-2xl text-ink-900 leading-tight">
              {voiceState.islem.brut_miktar} gr
            </p>
            <p className="text-sm font-bold text-ink-500 mt-1">
              {voiceState.islem.urun_cinsi.replace('_AYAR', ' Ayar')} · {voiceState.islem.islem_tipi}
            </p>
          </div>
          <div className="bg-ink-50 rounded-lg p-3 text-center mt-1">
             <p className="text-xs font-bold text-ink-600 animate-pulse">Lütfen "Onaylıyorum" veya "İptal" diyerek işlemi sonlandırın.</p>
          </div>
        </div>
      )}

      {/* 4. DURUM: HATA */}
      {voiceState.state === 'ERROR' && (
        <div className="flex items-center gap-3 bg-red-600 text-white px-5 py-3 rounded-full shadow-lg shadow-red-600/30">
          <AlertCircle size={20} />
          <span className="font-bold text-sm tracking-wide">{voiceState.mesaj || 'Komut Anlaşılamadı'}</span>
        </div>
      )}
    </div>
  );
};