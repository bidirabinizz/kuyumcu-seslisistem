import paramiko

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('87.76.130.180', username='root', password='-aGh9Y!Ver')
    
    nginx_content = """server {
    listen 80;
    server_name 87.76.130.180;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
"""
    ssh.exec_command(f"echo '{nginx_content}' > /etc/nginx/sites-available/capar")
    ssh.exec_command("systemctl restart nginx")
    ssh.close()

if __name__ == '__main__':
    main()
