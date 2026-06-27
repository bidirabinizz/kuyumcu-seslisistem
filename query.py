import paramiko
import sys

HOST = '87.76.130.180'
USER = 'root'
PASS = '-aGh9Y!Ver'

def run(ssh, cmd):
    print(f'\n--- {cmd}')
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    if out: sys.stdout.buffer.write(out.encode('utf-8'))
    if err: sys.stdout.buffer.write(err.encode('utf-8'))
    print(f'[exit={exit_code}]')
    return exit_code

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS)
    print('Baglandi.')

    # Önce mevcut nginx capar config'ini doğru domain'e çevir
    nginx_config = """server {
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
}"""

    # Config dosyasını yaz
    run(ssh, f"cat > /etc/nginx/sites-available/capar << 'NGINXEOF'\n{nginx_config}\nNGINXEOF")
    
    # Nginx test + restart
    run(ssh, 'nginx -t')
    run(ssh, 'systemctl restart nginx')
    
    # Mevcut certbot sertifikasını kontrol et
    run(ssh, 'certbot certificates 2>&1')
    
    # SSL yoksa veya config gerekiyorsa certbot ile düzelt
    print('\nCertbot ile SSL yenileniyor...')
    run(ssh, 'certbot --nginx -d sistem.caparkuyumculuk.com --non-interactive --agree-tos -m admin@caparkuyumculuk.com --redirect 2>&1')
    
    # Son nginx durumu
    run(ssh, 'systemctl status nginx --no-pager -l')
    run(ssh, 'ss -tlnp | grep -E "80|443"')

    ssh.close()
    print('\nTamamlandi.')

if __name__ == '__main__':
    main()
