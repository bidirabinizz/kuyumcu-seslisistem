import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('87.76.130.180', username='root', password='-aGh9Y!Ver')
stdin, stdout, stderr = ssh.exec_command("sudo -u postgres psql -c \"ALTER USER capar_user WITH PASSWORD 'Capar2026!';\"")
print("OUT:", stdout.read().decode())
print("ERR:", stderr.read().decode())
