import paramiko
import sys

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('87.76.130.180', username='root', password='-aGh9Y!Ver')
    
    stdin, stdout, stderr = ssh.exec_command('journalctl -u capar-backend -n 100 --no-pager')
    print("--- LOGS ---")
    logs = stdout.read().decode('utf-8', errors='ignore')
    # Print encoding-safe
    sys.stdout.buffer.write(logs.encode('utf-8'))
    print("\n--- ERRORS ---")
    errors = stderr.read().decode('utf-8', errors='ignore')
    sys.stdout.buffer.write(errors.encode('utf-8'))
    ssh.close()

if __name__ == '__main__':
    main()
