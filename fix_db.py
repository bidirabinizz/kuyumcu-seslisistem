import paramiko

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('87.76.130.180', username='root', password='-aGh9Y!Ver')
    
    service_content = """[Unit]
Description=Capar Kuyumculuk FastAPI Backend
After=network.target

[Service]
User=root
Group=www-data
WorkingDirectory=/var/www/caparkuyumculuk/backend
Environment="PATH=/var/www/caparkuyumculuk/backend/venv/bin"
Environment="DATABASE_URL=postgresql://capar_user:Bahadir0327.@localhost:5432/capar_db"
ExecStart=/var/www/caparkuyumculuk/backend/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000

[Install]
WantedBy=multi-user.target
"""
    ssh.exec_command(f"echo '{service_content}' > /etc/systemd/system/capar-backend.service")
    ssh.exec_command("systemctl daemon-reload && systemctl restart capar-backend")
    print("Backend servisi veritabani baglantisi ile yeniden baslatildi.")
    ssh.close()

if __name__ == '__main__':
    main()
