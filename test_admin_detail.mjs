import http from 'http';

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/admin/user/u_mooffa5o538/detail',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-admin-token': Buffer.from(JSON.stringify({id:'test',loginAt:Date.now()})).toString('base64')
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data.substring(0, 500));
    process.exit(0);
  });
});
req.on('error', (e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
req.end();
