import paramiko
from scp import SCPClient
import os
import sys
import subprocess

HOST = '87.76.130.180'
USER = 'root'
PASS = '-aGh9Y!Ver'
REMOTE_ANASITE_DIR = '/var/www/caparkuyumculuk/anasite'
LOCAL_ANASITE_DIR = 'C:\\Users\\bidir\\Desktop\\caparkuyumculuk\\caparkuyumculukanasite'

def execute_command(ssh, command):
    print(f"Calistiriliyor: {command}")
    stdin, stdout, stderr = ssh.exec_command(command)
    exit_status = stdout.channel.recv_exit_status()
    out_str = stdout.read().decode()
    err_str = stderr.read().decode()
    if exit_status == 0:
        print("Bitti")
        return True, out_str
    else:
        print(f"HATA: {err_str}")
        return False, err_str

def build_locally():
    print("Yerelde (bilgisayarinizda) Next.js build aliniyor...")
    try:
        # npm run build komutunu local klasorde calistir
        result = subprocess.run("npm run build", shell=True, cwd=LOCAL_ANASITE_DIR, check=True)
        if result.returncode == 0:
            print("Yerel build basariyla tamamlandi!")
            return True
    except Exception as e:
        print(f"Yerel build hatasi: {e}")
    return False

def main():
    # 1. Bilgisayarda local build al
    if not build_locally():
        print("Yerel build basarisiz oldugu icin yayinlama iptal edildi.")
        sys.exit(1)

    print("VDS'e baglaniliyor...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(HOST, username=USER, password=PASS)
        print("Baglanti basarili!")
    except Exception as e:
        print(f"Baglanti hatasi: {e}")
        sys.exit(1)

    # 2. Node.js ve npm kurulu mu kontrol et, degilse kur
    # (Derlenmis dosyayi calistirmak icin sunucuda Node.js kurulu olmak zorundadir)
    print("Sunucuda Node.js kontrol ediliyor...")
    success, out = execute_command(ssh, "node -v")
    if not success:
        print("VDS'te Node.js bulunamadi, kuruluyor...")
        execute_command(ssh, "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -")
        execute_command(ssh, "apt-get install -y nodejs")
    else:
        print(f"VDS Node.js surumu: {out.strip()}")

    # 3. Klasoru temizle ve olustur
    execute_command(ssh, f'rm -rf {REMOTE_ANASITE_DIR}')
    execute_command(ssh, f'mkdir -p {REMOTE_ANASITE_DIR}')

    # 4. Derlenmis dosyalari SCP ile gonder
    # Gonderilecekler: .next (cache haric), public, package.json, package-lock.json
    print("Derlenmis Next.js dosyalari VDS'e gonderiliyor...")
    with SCPClient(ssh.get_transport()) as scp:
        # A. Temel dosyalari gonder
        for file in ['package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json']:
            local_file = os.path.join(LOCAL_ANASITE_DIR, file)
            if os.path.exists(local_file):
                scp.put(local_file, os.path.join(REMOTE_ANASITE_DIR, file).replace('\\', '/'))
        
        # B. .next klasorunu gonder (.next/cache klasorunu atla - cok buyuktur)
        local_next_dir = os.path.join(LOCAL_ANASITE_DIR, '.next')
        for root, dirs, files in os.walk(local_next_dir):
            if 'cache' in root.split(os.path.sep):
                continue
            rel_path = os.path.relpath(root, LOCAL_ANASITE_DIR)
            remote_path = os.path.join(REMOTE_ANASITE_DIR, rel_path).replace('\\', '/')
            execute_command(ssh, f'mkdir -p {remote_path}')
            for file in files:
                local_file = os.path.join(root, file)
                remote_file = os.path.join(remote_path, file).replace('\\', '/')
                scp.put(local_file, remote_file)

        # C. public klasorunu gonder (varsa)
        local_public_dir = os.path.join(LOCAL_ANASITE_DIR, 'public')
        if os.path.exists(local_public_dir):
            for root, dirs, files in os.walk(local_public_dir):
                rel_path = os.path.relpath(root, LOCAL_ANASITE_DIR)
                remote_path = os.path.join(REMOTE_ANASITE_DIR, rel_path).replace('\\', '/')
                execute_command(ssh, f'mkdir -p {remote_path}')
                for file in files:
                    local_file = os.path.join(root, file)
                    remote_file = os.path.join(remote_path, file).replace('\\', '/')
                    scp.put(local_file, remote_file)

    # 5. Sunucuda sadece production bagimliliklarini yukle (cok daha hizli ve hafiftir)
    print("Sunucuda production paketleri yukleniyor...")
    execute_command(ssh, f'cd {REMOTE_ANASITE_DIR} && npm install --production')

    # 6. Systemd servisini olustur
    print("Systemd servisi ayarlaniyor...")
    service_content = f"""[Unit]
Description=Capar Kuyumculuk Anasite Next.js
After=network.target

[Service]
User=root
Group=www-data
WorkingDirectory={REMOTE_ANASITE_DIR}
Environment=NODE_ENV=production PORT=3000
ExecStart=/usr/bin/npm start

[Install]
WantedBy=multi-user.target
"""
    execute_command(ssh, f"echo '{service_content}' > /etc/systemd/system/capar-anasite.service")
    execute_command(ssh, 'systemctl daemon-reload')
    execute_command(ssh, 'systemctl enable capar-anasite')
    execute_command(ssh, 'systemctl restart capar-anasite')

    # 7. Nginx ayarlarini guncelle
    print("Nginx anasite konfigurasyonu olusturuluyor...")
    nginx_content = """server {
    listen 80;
    server_name caparkuyumculuk.com www.caparkuyumculuk.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
"""
    execute_command(ssh, f"cat > /etc/nginx/sites-available/capar-anasite << 'NGINXEOF'\n{nginx_content}\nNGINXEOF")
    execute_command(ssh, "ln -sf /etc/nginx/sites-available/capar-anasite /etc/nginx/sites-enabled/capar-anasite")
    execute_command(ssh, "nginx -t")
    execute_command(ssh, "systemctl restart nginx")

    # 8. SSL kurulumu (Certbot)
    print("Certbot ile SSL sertifikasi aliniyor...")
    execute_command(ssh, "certbot --nginx -d caparkuyumculuk.com -d www.caparkuyumculuk.com --non-interactive --agree-tos -m admin@caparkuyumculuk.com --redirect")

    print("\n-------------------------------------------------------------")
    print("Capar Kuyumculuk Ana Site kurulumu ve SSL basariyla tamamlandi!")
    print("Yerel derleme (Local build) kullanilarak VDS kaynaklari korunmustur.")
    print("-------------------------------------------------------------")
    
    ssh.close()

if __name__ == '__main__':
    main()
