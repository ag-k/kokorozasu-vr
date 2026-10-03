// オフラインでも遊べるようにするサービスワーカー
// ・初回に、ゲームに必要なファイル（precache.js の一覧）をすべて端末に保存する
// ・同じサイトのファイル：ネットにつながれば最新を取り、つながらなければ保存したものを使う
// ・フォント（Google Fonts）：一度読んだものを保存して使う
importScripts('precache.js'); // self.PRECACHE（ファイル一覧）と self.VERSION を定義

const APP_CACHE = 'kokorozasu-app-' + self.VERSION;
const FONT_CACHE = 'kokorozasu-fonts-v1';

self.addEventListener('install', (e) => {
  // ブラウザの HTTP キャッシュ（GitHub Pages は最大 10 分）を通さず、必ず最新を取って保存する
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(self.PRECACHE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== APP_CACHE && k !== FONT_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// 一定時間で応答がなければ保存したものを使う（電波の弱い所で待たされないように）
// cache: 'no-cache' … HTTP キャッシュがあってもサーバーに確かめ、更新があれば新しいものを取る
// ページ本体（navigate）の要求には直接オプションを付けられないので、URL から作り直して取る
function fetchWithTimeout(req, ms) {
  const fresh = req.mode === 'navigate'
    ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
    : fetch(req, { cache: 'no-cache' });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    fresh.then((r) => { clearTimeout(t); resolve(r); }, (err) => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(APP_CACHE);
    try {
      const res = await fetchWithTimeout(req, 4000);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const home = await cache.match('./index.html');
        if (home) return home;
      }
      throw err;
    }
  })());
});
