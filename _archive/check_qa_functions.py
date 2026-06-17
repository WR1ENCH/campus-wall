import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Check QA function definitions in server.js
print('=== QA functions in server.js ===')
si, so, se = c.exec_command("grep -n 'function readQA\\|function writeQA\\|function hasAdmins\\|function readCreditCards\\|function writeCreditCards\\|function readPickupAuctions\\|function readPickupReports' /www/wwwroot/campus-wall/server.js", timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out)

# Check lines around settleExpiredQuestions  
print()
print('=== Lines around settleExpiredQuestions ===')
si, so, se = c.exec_command("sed -n '3590,3620p' /www/wwwroot/campus-wall/server.js", timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out)

c.close()
