const http = require('http');

const CORE_HOST = process.env.OPENWA_HOST || '127.0.0.1';
const CORE_PORT = parseInt(process.env.OPENWA_PORT || '2785', 10);
const API_KEY = process.env.OPENWA_API_KEY || '6sdu75mj1fz82rgxbyponq4kvtc9hal0';
const PREFIX = '/api';

async function request(method, p, body, timeout = 60000, retries = 5) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await new Promise((resolve, reject) => {
        const path = `${PREFIX}${p}`;
        const payload = body !== undefined ? JSON.stringify(body) : null;
        const req = http.request(
          {
            host: CORE_HOST,
            port: CORE_PORT,
            method,
            path,
            headers: {
              'X-API-Key': API_KEY,
              'Content-Type': 'application/json',
              'Content-Length': payload ? Buffer.byteLength(payload) : 0,
            },
            timeout,
          },
          (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
              const raw = Buffer.concat(chunks).toString('utf8');
              let json = null;
              try {
                json = raw ? JSON.parse(raw) : null;
              } catch {
                json = raw;
              }
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve(json);
              } else {
                const err = new Error(`OpenWA ${method} ${path} -> ${res.statusCode}`);
                err.statusCode = res.statusCode;
                err.body = json;
                reject(err);
              }
            });
          },
        );
        req.on('error', (err) => {
          reject(err);
        });
        req.on('timeout', () => {
          req.destroy(new Error(`OpenWA request timed out: ${method} ${path}`));
        });
        if (payload) req.write(payload);
        req.end();
      });
    } catch (err) {
      attempt++;
      if (err && err.code === 'ECONNREFUSED' && attempt < retries) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      throw err;
    }
  }
}

function get(p) {
  return request('GET', p);
}
function post(p, body) {
  return request('POST', p, body);
}
function del(p) {
  return request('DELETE', p);
}

function checkAlive() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: CORE_HOST, port: CORE_PORT, path: `${PREFIX}/health/ready`, timeout: 3000 },
      (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

module.exports = { request, get, post, del, checkAlive, CORE_PORT, CORE_HOST };
