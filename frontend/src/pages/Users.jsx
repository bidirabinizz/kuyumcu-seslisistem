import React, { useState, useEffect } from 'react';
import { UserPlus, MoreVertical, Shield } from 'lucide-react';

export const Users = () => {
  const [personeller, setPersoneller] = useState([
    { id: 1, ad_soyad: 'Ahmet Çapar', tetikleme_kelimesi: 'ahmet', rol: 'Yönetici' },
    { id: 2, ad_soyad: 'Zeynep Yılmaz', tetikleme_kelimesi: 'zeynep', rol: 'Tezgahtar' }
  ]);

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800">Kullanıcı Yönetimi</h1>
          <p className="text-slate-500">Sistemi sesli komutla yönetebilen personeller</p>
        </div>
        <button className="bg-kuyumcu-dark text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-slate-800 transition-all">
          <UserPlus size={20} /> Yeni Personel Ekle
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {personeller.map((p) => (
          <div key={p.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-slate-100 p-4 rounded-2xl">
                <Shield className="text-kuyumcu-dark" size={24} />
              </div>
              <button className="text-slate-400 hover:text-slate-600">
                <MoreVertical size={20} />
              </button>
            </div>
            <h3 className="text-xl font-bold text-slate-800">{p.ad_soyad}</h3>
            <p className="text-sm text-slate-400 mb-4">{p.rol}</p>
            <div className="bg-slate-50 p-3 rounded-xl border border-dashed border-slate-200">
              <span className="text-xs font-bold text-slate-400 uppercase block">Sesli Tetikleme</span>
              <span className="text-kuyumcu-dark font-mono font-bold italic">"{p.tetikleme_kelimesi}"</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};