import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('87.76.130.180', username='root', password='-aGh9Y!Ver')

# Sed command to insert the new Environment line after the existing Environment line
cmd = "sed -i '/Environment=\"PATH=\\/var\\/www\\/caparkuyumculuk\\/backend\\/venv\\/bin\"/a Environment=\"DATABASE_URL=postgresql://capar_user:Capar2026!@localhost:5432/capar_db\"' /etc/systemd/system/capar-backend.service && systemctl daemon-reload"

stdin, stdout, stderr = ssh.exec_command(cmd)
print("OUT:", stdout.read().decode())
print("ERR:", stderr.read().decode())
