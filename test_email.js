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
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email: 'admin@company.com', password: 'password123' }); // default admin seeded?
    
    let token;
    try { token = JSON.parse(loginRes.body).token; } catch(e) {}
    if(!token) { console.log('Login failed', loginRes.body); return; }
    
    const candRes = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/candidates?limit=1',
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    
    const cands = JSON.parse(candRes.body).candidates;
    if(!cands || !cands.length) { console.log('no candidates'); return; }
    const candId = cands[0]._id;
    console.log('Testing email for candidate', candId);

    const emailRes = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/candidates/' + candId + '/email-template',
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
    }, { type: 'screening' });
    
    console.log('Email Status:', emailRes.status);
    console.log('Response:', emailRes.body);
  } catch (err) {
    console.error(err);
  }
}

test();
