import React from 'react';
import NetworkInfo from '../components/NetworkInfo';
import { Settings } from 'lucide-react';

const Ayarlar = () => {
    return (
        <div className="p-8">
            <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-yellow-600/20 rounded-xl">
                    <Settings className="text-yellow-500 w-8 h-8" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold text-black tracking-tight">Sistem Ayarları</h1>
                    <p className="text-gray-400 text-sm">Cihaz bağlantıları ve teknik yapılandırmalar</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Bağlantı Bilgileri Bölümü */}
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold text-white/90 border-b border-white/10 pb-2">
                        Mobil Bağlantı
                    </h2>
                    <NetworkInfo />
                </div>

            </div>
        </div>
    );
};

export default Ayarlar;