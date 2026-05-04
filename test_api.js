// 测试注册API
fetch('/api/user/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'test_api_' + Date.now(),
    password: 'test123',
    nickname: 'API测试'
  })
}).then(r => r.json()).then(data => {
  console.log('注册返回:', JSON.stringify(data, null, 2));
  if (data.ok) {
    console.log('token:', data.data.token);
    console.log('username:', data.data.username);
  }
});
