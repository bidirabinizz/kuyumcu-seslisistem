import React, { useState, useEffect } from 'react';
import { Wifi, Copy, CheckCircle } from 'lucide-react';

const NetworkInfo = () => {
    const [ip, setIp] = useState('Yükleniyor...');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        // Backend'den IP adresini çek
        fetch('http://localhost:8000/sistem/ip')
            .then(res => res.json())
            .then(data => setIp(data.ip))
            .catch(err => setIp('Hata!'));
    }, []);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(ip);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-slate-900/50 border border-yellow-600/20 rounded-2xl p-6 backdrop-blur-sm shadow-xl">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-yellow-600/10 rounded-lg">
                        <Wifi className="text-yellow-500 w-5 h-5" />
                    </div>
                    <h3 className="text-white font-semibold tracking-wide">MOBİL BAĞLANTI ADRESİ</h3>
                </div>
                <button 
                    onClick={copyToClipboard}
                    className="text-gray-400 hover:text-yellow-500 transition-colors"
                    title="IP Adresini Kopyala"
                >
                    {copied ? <CheckCircle className="text-green-500 w-5 h-5" /> : <Copy size={18} />}
                </button>
            </div>

            <div className="space-y-3">
                <div className="bg-black/40 rounded-xl p-4 flex items-center justify-center">
                    <span className="text-yellow-500 font-mono text-2xl tracking-widest leading-none">
                        {ip}
                    </span>
                </div>
                
                <p className="text-gray-400 text-xs text-center leading-relaxed">
                    Tezgahtar telefonlarını sisteme bağlamak için <br /> 
                    bu IP adresini kullanın.
                </p>
            </div>
        </div>
    );
};

export default NetworkInfo;