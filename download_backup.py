import paramiko, sys, io, os, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'
local_dir = r'C:\Users\wyxgg\Desktop\test\backup'

# 创建本地备份目录
os.makedirs(local_dir, exist_ok=True)

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

# SFTP 下载
sftp = client.open_sftp()
remote_file = '/root/campus_wall_backup_20260609_152500.tar.gz'
local_file = os.path.join(local_dir, 'campus_wall_backup_20260609_152500.tar.gz')

print('⬇️ 下载备份文件...')
sftp.get(remote_file, local_file)
size_mb = os.path.getsize(local_file) / 1024 / 1024
print(f'✅ 下载完成: {size_mb:.1f} MB -> {local_file}')

# 也下载一份 data 目录的单独备份
remote_data = '/www/wwwroot/campus-wall/data'
local_data = os.path.join(local_dir, 'data')
os.makedirs(local_data, exist_ok=True)

print('⬇️ 下载 data 目录...')
for f in sftp.listdir(remote_data):
    if f.endswith('.json'):
        try:
            sftp.get(f'{remote_data}/{f}', os.path.join(local_data, f))
        except:
            pass

print(f'✅ data 目录已下载到: {local_data}')
print(f'   文件数: {len(os.listdir(local_data))}')

sftp.close()
client.close()
print('🎉 全部备份完成！')
