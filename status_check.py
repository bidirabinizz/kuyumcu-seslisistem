import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('87.76.130.180', username='root', password='-aGh9Y!Ver')
stdin, stdout, stderr = ssh.exec_command("journalctl -u capar-backend -n 20 --no-pager")
with open('remote_status.txt', 'wb') as f:
    f.write(stdout.read())
