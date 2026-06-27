import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('87.76.130.180', username='root', password='-aGh9Y!Ver')
stdin, stdout, stderr = ssh.exec_command("journalctl -u capar-backend -n 30 --no-pager")
print(stdout.read().decode())
