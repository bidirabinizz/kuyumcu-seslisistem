import paramiko
from scp import SCPClient
import os
import sys

HOST = '87.76.130.180'
USER = 'root'
PASS = '-aGh9Y!Ver'
REMOTE_FRONTEND_DIR = '/var/www/caparkuyumculuk/frontend/dist'
LOCAL_DIST_DIR = 'C:\\Users\\bidir\\Desktop\\caparkuyumculuk\\frontend\\dist'

def execute_command(ssh, command):
    print(f"Calistiriliyor: {command}")
    stdin, stdout, stderr = ssh.exec_command(command)
    exit_status = stdout.channel.recv_exit_status()
    if exit_status == 0:
        print("Bitti")
    else:
        print(f"HATA: {stderr.read().decode()}")

def main():
    print("VDS'e baglaniliyor...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS)
    print("Baglanti basarili!")
    
    # Klasoru temizle ve olustur
    execute_command(ssh, f'rm -rf {REMOTE_FRONTEND_DIR}')
    execute_command(ssh, f'mkdir -p {REMOTE_FRONTEND_DIR}')
    
    # Dist gonder
    print("React dist dosyalari gonderiliyor...")
    with SCPClient(ssh.get_transport()) as scp:
        for root, dirs, files in os.walk(LOCAL_DIST_DIR):
            rel_path = os.path.relpath(root, LOCAL_DIST_DIR)
            remote_path = REMOTE_FRONTEND_DIR if rel_path == '.' else os.path.join(REMOTE_FRONTEND_DIR, rel_path).replace('\\', '/')
            execute_command(ssh, f'mkdir -p {remote_path}')
            for file in files:
                local_file = os.path.join(root, file)
                remote_file = os.path.join(remote_path, file).replace('\\', '/')
                scp.put(local_file, remote_file)
                
    # Nginx guncelle
    print("Nginx güncelleniyor...")
    nginx_content = """server {
    listen 80;
    server_name sistem.caparkuyumculuk.com;
    
    root /var/www/caparkuyumculuk/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
"""
    execute_command(ssh, f"cat > /etc/nginx/sites-available/capar << 'NGINXEOF'\n{nginx_content}\nNGINXEOF")
    execute_command(ssh, 'nginx -t')
    execute_command(ssh, 'systemctl restart nginx')
    # SSL sertifikasını domain'e yeniden bağla (her deploy'da güvenli olsun)
    execute_command(ssh, 'certbot --nginx -d sistem.caparkuyumculuk.com --non-interactive --agree-tos -m admin@caparkuyumculuk.com --redirect 2>&1')
    
    print("Frontend kurulumu tamamlandi!")
    ssh.close()

if __name__ == '__main__':
    main()
