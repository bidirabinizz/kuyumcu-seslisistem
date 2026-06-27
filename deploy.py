import paramiko
from scp import SCPClient
import os
import sys

# Konfigürasyon
HOST = '87.76.130.180'
USER = 'root'
PASS = '-aGh9Y!Ver'
DB_PASS = 'Bahadir0327.'
REMOTE_DIR = '/var/www/caparkuyumculuk/backend'
LOCAL_DIR = 'C:\\Users\\bidir\\Desktop\\caparkuyumculuk\\backend'

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
    try:
        ssh.connect(HOST, username=USER, password=PASS)
        print("Baglanti basarili!")
    except Exception as e:
        print(f"Baglanti hatasi: {e}")
        sys.exit(1)

    # 1. Guncelleme ve kurulum
    execute_command(ssh, 'export DEBIAN_FRONTEND=noninteractive && apt-get update && apt-get upgrade -y')
    execute_command(ssh, 'export DEBIAN_FRONTEND=noninteractive && apt-get install -y postgresql postgresql-contrib nginx python3-venv python3-pip ufw')

    # 2. Klasorleri olustur
    execute_command(ssh, f'mkdir -p {REMOTE_DIR}')

    # 3. Dosyalari SCP ile gonder
    print("Backend dosyalari gonderiliyor...")
    with SCPClient(ssh.get_transport()) as scp:
        # __pycache__ ve venv haric gonder
        for root, dirs, files in os.walk(LOCAL_DIR):
            if '__pycache__' in root or 'venv' in root:
                continue
            
            # Uzak dizin yolunu hesapla
            rel_path = os.path.relpath(root, LOCAL_DIR)
            remote_path = REMOTE_DIR if rel_path == '.' else os.path.join(REMOTE_DIR, rel_path).replace('\\', '/')
            
            execute_command(ssh, f'mkdir -p {remote_path}')
            
            for file in files:
                local_file = os.path.join(root, file)
                remote_file = os.path.join(remote_path, file).replace('\\', '/')
                try:
                    scp.put(local_file, remote_file)
                except Exception as e:
                    print(f"Dosya gonderilemedi {local_file}: {e}")

    # 4. Veritabani kurulumu
    print("Veritabani ayarlaniyor...")
    db_setup_cmd = f"""
    sudo -u postgres psql -c "CREATE DATABASE capar_db;"
    sudo -u postgres psql -c "CREATE USER capar_user WITH PASSWORD '{DB_PASS}';"
    sudo -u postgres psql -c "ALTER ROLE capar_user SET client_encoding TO 'utf8';"
    sudo -u postgres psql -c "ALTER ROLE capar_user SET default_transaction_isolation TO 'read committed';"
    sudo -u postgres psql -c "ALTER ROLE capar_user SET timezone TO 'UTC';"
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE capar_db TO capar_user;"
    sudo -u postgres psql -c "ALTER DATABASE capar_db OWNER TO capar_user;"
    """
    execute_command(ssh, db_setup_cmd)

    # 5. Python venv kurulumu
    print("Python venv kuruluyor...")
    execute_command(ssh, f'cd {REMOTE_DIR} && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt')

    # 6. Systemd servisi
    print("Systemd servisi ayarlaniyor...")
    service_content = f"""[Unit]
Description=Capar Kuyumculuk FastAPI Backend
After=network.target

[Service]
User=root
Group=www-data
WorkingDirectory={REMOTE_DIR}
Environment="PATH={REMOTE_DIR}/venv/bin"
ExecStart={REMOTE_DIR}/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000

[Install]
WantedBy=multi-user.target
"""
    execute_command(ssh, f"echo '{service_content}' > /etc/systemd/system/capar-backend.service")
    execute_command(ssh, 'systemctl daemon-reload && systemctl start capar-backend && systemctl enable capar-backend')


    # 8. UFW Guvenlik
    print("Guvenlik duvari ayarlaniyor...")
    execute_command(ssh, 'ufw allow 22/tcp')
    execute_command(ssh, 'ufw allow 80/tcp')
    execute_command(ssh, 'ufw allow 443/tcp')
    execute_command(ssh, 'echo "y" | ufw enable')

    print("Kurulum tamamlandi!")
    ssh.close()

if __name__ == '__main__':
    main()
