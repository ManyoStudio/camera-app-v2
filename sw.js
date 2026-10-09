// =====================================================================
// sw.js — 現場写真撮影アプリ：電波が無くても開ける仕組み（Service Worker。v3.201 から）
//   ・電波があるときは、必ず配信の新しい版を取りに行き、控え（キャッシュ）を新しくする
//   ・電波が無いとき・取りに行って失敗したとき（待っても返事が来ないときを含む）だけ、控えを使う
//   ・控えるのは index.html（アプリ）と diag.html（救出ページ）の2つだけ。撮影データ（データベース）には触らない
//   ・控えの名前に版を入れる。新しい版の sw.js が動き始めたら、古い版の控えを消す（2つの版が混ざらないように）
//   ・アプリの版を上げるときは、この VERSION も同じ版にする
//   ・止めるときは、外すための版（リポジトリの sw-off\sw.js）を、この sw.js と入れ替えて配信する
// =====================================================================
var VERSION = 'v3.201';
var PREFIX = 'camera-app-';
var CACHE = PREFIX + VERSION;
var WAIT_MS = 8000;   // 弱い電波で返事が来ないとき、控えに切り替えるまで待つ時間
var BASE = new URL('./', self.location).href;
var FILES = { app: BASE + 'index.html', diag: BASE + 'diag.html' };

// 控える2つのどちらかなら、その控えの名前（住所）を返す。それ以外は null（触らない）
function keyOf(url) {
  var u = new URL(url);
  u.search = ''; u.hash = '';
  var h = u.href;
  if (h === BASE || h === FILES.app) return FILES.app;
  if (h === FILES.diag) return FILES.diag;
  return null;
}
// 配信を直接見る（ブラウザの一時保存を使わない）
function fetchFresh(url) {
  return fetch(url, { cache: 'no-store', credentials: 'same-origin' });
}
function withTimeout(p, ms) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error('timeout')); }, ms);
    p.then(function (v) { clearTimeout(timer); resolve(v); }, function (e) { clearTimeout(timer); reject(e); });
  });
}

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all([FILES.app, FILES.diag].map(function (u) {
      return fetchFresh(u).then(function (r) { if (r && r.ok) return c.put(u, r); }).catch(function () {});
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(PREFIX) === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var key = keyOf(req.url);
  if (!key) return;   // 控える2つ以外は、今までどおり（触らない）
  e.respondWith(
    withTimeout(fetchFresh(req.url), WAIT_MS).then(function (r) {   // 1. 電波があるときは、必ず配信を先に見る
      if (r && r.ok) {
        var copy = r.clone();
        caches.open(CACHE).then(function (c) { return c.put(key, copy); }).catch(function () {});
      }
      return r;
    }).catch(function () {                                            // 2. 取りに行けなかったときだけ、控えを使う
      return caches.open(CACHE).then(function (c) { return c.match(key); }).then(function (hit) {
        return hit || Response.error();
      });
    })
  );
});
