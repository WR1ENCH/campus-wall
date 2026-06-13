import paramiko, io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Get first question ID from list
print('=== Get QA list ===')
si, so, se = c.exec_command("curl -s http://localhost:3000/api/qa/questions 2>&1 | python3 -c 'import json,sys; d=json.load(sys.stdin); items=d.get(\"data\",[]); [print(x[\"id\"], x[\"title\"]) for x in items[:5]]'", timeout=15)
out = so.read().decode('utf-8', errors='replace')
err = se.read().decode('utf-8', errors='replace')
print(out)
if err: print('ERR:', err[:300])

# Get a specific question detail
print()
print('=== Get QA detail with first valid ID ===')
si, so, se = c.exec_command("curl -s http://localhost:3000/api/qa/questions/qa_mq61msuahz32 2>&1 | python3 -c 'import json,sys; d=json.load(sys.stdin); print(\"ok:\", d.get(\"ok\"));[print(k, type(v).__name__, \"=\", str(v)[:80]) for k,v in d.get(\"data\",{}).items()[:15]]'", timeout=15)
out = so.read().decode('utf-8', errors='replace')
print(out[:1000])

# Check the raw JSON response
print()
print('=== Raw JSON response (first 500 chars) ===')
si, so, se = c.exec_command("curl -s http://localhost:3000/api/qa/questions/qa_mq61msuahz32 2>&1 | head -c 500", timeout=15)
out = so.read().decode('utf-8', errors='replace')
print(out)

# Also check if the images field is a string or array
print()
print('=== Check images type ===')
si, so, se = c.exec_command("curl -s http://localhost:3000/api/qa/questions/qa_mq61msuahz32 2>&1 | python3 -c 'import json,sys; d=json.load(sys.stdin); img=d.get(\"data\",{}).get(\"images\"); print(\"type:\", type(img).__name__, \"value:\", str(img)[:100])'", timeout=15)
out = so.read().decode('utf-8', errors='replace')
print(out)

c.close()
