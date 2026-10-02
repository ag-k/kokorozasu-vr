// 開発用の静的ファイルサーバー（依存なし）
//
//   node server.js [port]            http://localhost:8080 だけで配信
//   node server.js [port] --https    さらに https://<このPCのIP>:8443 で同じWi‑Fi内へ配信
//
// Quest をケーブルなしで試すときは --https を付けて起動し、Quest のブラウザで表示された
// https://192.168.x.x:8443 を開く（自己署名証明書なので最初に警告が出る → 詳細 → アクセスする）。
// WebXR は HTTPS か localhost でしか動かないため、LAN からは https の方を使う。
// USB 接続なら `adb reverse tcp:8080 tcp:8080` のうえ Quest で http://localhost:8080 でもよい。
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = __dirname;
const args = process.argv.slice(2);
const port = Number(args.find((a) => /^\d+$/.test(a)) || process.env.PORT || 8080);
const useHttps = args.includes('--https');
const httpsPort = Number(process.env.HTTPS_PORT || 8443);

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.md': 'text/markdown; charset=utf-8',
};
// 配信しないもの（証明書の鍵・設定・開発用ファイル）
const blocked = (rel) => rel.split('/').some((s) => s.startsWith('.')) || /^(tools|node_modules)(\/|$)/.test(rel) || /^(server\.js|package(-lock)?\.json)$/.test(rel);

function handler(req, res) {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(root, p));
  const rel = path.relative(root, file).split(path.sep).join('/');
  if (!file.startsWith(root) || rel.startsWith('..') || blocked(rel)) { res.writeHead(404); return res.end('not found'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal && !/^169\.254\./.test(a.address) && !/vEthernet|WSL|VirtualBox|VMware/i.test(name)) out.push(a.address);
    }
  }
  return out;
}

function findOpenssl() {
  const candidates = ['openssl', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe', 'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe'];
  for (const c of candidates) {
    try { execFileSync(c, ['version'], { stdio: 'ignore' }); return c; } catch { /* 次を試す */ }
  }
  return null;
}

// 自己署名証明書（このPCのIPを含める）。IPが変わったら作り直す
function ensureCert(ips) {
  const dir = path.join(root, '.cert');
  const key = path.join(dir, 'key.pem'), cert = path.join(dir, 'cert.pem'), stamp = path.join(dir, 'ips.txt');
  const want = ['127.0.0.1', ...ips].join(',');
  if (fs.existsSync(key) && fs.existsSync(cert) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === want) {
    return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
  }
  const openssl = findOpenssl();
  if (!openssl) throw new Error('openssl が見つかりません（Git for Windows に含まれています）');
  fs.mkdirSync(dir, { recursive: true });
  const san = ['DNS:localhost', ...want.split(',').map((ip) => 'IP:' + ip)].join(',');
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '825',
    '-keyout', key, '-out', cert, '-subj', '/CN=godaigo-vr-dev', '-addext', 'subjectAltName=' + san], { stdio: 'ignore' });
  fs.writeFileSync(stamp, want);
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

http.createServer(handler).listen(port, '0.0.0.0', () => console.log(`PC:    http://localhost:${port}`));

if (useHttps) {
  const ips = lanAddresses();
  try {
    https.createServer(ensureCert(ips), handler).listen(httpsPort, '0.0.0.0', () => {
      for (const ip of ips) console.log(`Quest: https://${ip}:${httpsPort}   （同じWi‑Fiにつないだ Quest のブラウザで開く）`);
    });
  } catch (e) {
    console.error('HTTPS を開始できませんでした:', e.message);
  }
}
