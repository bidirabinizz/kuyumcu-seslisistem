import paramiko
from scp import SCPClient
import os

def put_dir(scp, source, dest):
    for item in os.listdir(source):
        s = os.path.join(source, item)
        d = dest + "/" + item
        if os.path.isdir(s):
            # scp client doesn't recursively create dirs if target parent doesn't exist, but it can put dirs
            scp.put(s, recursive=True, remote_path=dest)
        else:
            scp.put(s, d)

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('87.76.130.180', username='root', password='-aGh9Y!Ver')
    
    # Create the target directory if it doesn't exist, and clear the dist folder
    ssh.exec_command('rm -rf /var/www/caparkuyumculuk/frontend/dist/*')
    ssh.exec_command('mkdir -p /var/www/caparkuyumculuk/frontend/dist')
    
    with SCPClient(ssh.get_transport()) as scp:
        # scp.put directory puts the directory itself, so we put contents or let it recreate 'dist'
        scp.put('C:\\Users\\bidir\\Desktop\\caparkuyumculuk\\frontend\\dist', '/var/www/caparkuyumculuk/frontend', recursive=True)
        
    ssh.exec_command('systemctl restart nginx')
    ssh.close()
    print("Frontend deploy edildi ve Nginx yeniden baslatildi.")

if __name__ == '__main__':
    main()
