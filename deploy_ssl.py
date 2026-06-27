import paramiko
from scp import SCPClient
import os

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
    
    # Yeni React buildini gonder (SSL'li)
    print("Yeni React buildi gonderiliyor...")
    execute_command(ssh, f'rm -rf {REMOTE_FRONTEND_DIR}/*')
    with SCPClient(ssh.get_transport()) as scp:
        for root, dirs, files in os.walk(LOCAL_DIST_DIR):
            rel_path = os.path.relpath(root, LOCAL_DIST_DIR)
            remote_path = REMOTE_FRONTEND_DIR if rel_path == '.' else os.path.join(REMOTE_FRONTEND_DIR, rel_path).replace('\\', '/')
            execute_command(ssh, f'mkdir -p {remote_path}')
            for file in files:
                local_file = os.path.join(root, file)
                remote_file = os.path.join(remote_path, file).replace('\\', '/')
                scp.put(local_file, remote_file)

    # Nginx domain ayarini guncelle
    print("Nginx domain ayari guncelleniyor...")
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
    execute_command(ssh, f"echo '{nginx_content}' > /etc/nginx/sites-available/capar")
    execute_command(ssh, 'systemctl restart nginx')

    # Certbot ve SSL kurulumu
    print("Certbot ve SSL kuruluyor...")
    execute_command(ssh, 'export DEBIAN_FRONTEND=noninteractive && apt-get update && apt-get install -y certbot python3-certbot-nginx')
    execute_command(ssh, 'certbot --nginx -d sistem.caparkuyumculuk.com --non-interactive --agree-tos -m admin@caparkuyumculuk.com --redirect')
    
    print("SSL ve Domain baglantisi tamamlandi!")
    ssh.close()

if __name__ == '__main__':
    main()
