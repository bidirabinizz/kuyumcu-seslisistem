import paramiko
from scp import SCPClient

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('87.76.130.180', username='root', password='-aGh9Y!Ver')
    
    with SCPClient(ssh.get_transport()) as scp:
        scp.put('C:\\Users\\bidir\\Desktop\\caparkuyumculuk\\backend\\main.py', '/var/www/caparkuyumculuk/backend/main.py')
        
    ssh.exec_command('systemctl restart capar-backend')
    ssh.close()
    print("main.py guncellendi ve servis yeniden baslatildi.")

if __name__ == '__main__':
    main()
