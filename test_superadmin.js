const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function test() {
  try {
    const loginRes = await request({
      hostname: 'localhost',
      port: 5001,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email: 'superadmin@hireiq.app', password: 'SuperAdmin123!' });
    
    const { token } = JSON.parse(loginRes.body);
    console.log('Login Status:', loginRes.status);
    
    const compRes = await request({
      hostname: 'localhost',
      port: 5001,
      path: '/api/superadmin/companies',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('Companies Status:', compRes.status);
    console.log('Response:', compRes.body);
  } catch (err) {
    console.error(err);
  }
}

test();
