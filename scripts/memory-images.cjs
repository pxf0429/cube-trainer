const http = require('node:http');
const https = require('node:https');
const tls = require('node:tls');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { searchImages } = require('./image-search.cjs');
const ALLOWED_HOSTS = new Set(['commons.wikimedia.org', 'upload.wikimedia.org', 'thumb.wikimedia.org', 'www.wikidata.org']);
ALLOWED_HOSTS.add('www.bing.com');
ALLOWED_HOSTS.add('cn.bing.com');
for (const prefix of ['ts','tse']) for (let i=1;i<=4;i++) ALLOWED_HOSTS.add(prefix+i+'.mm.bing.net');
const imageHost = host => ['upload.wikimedia.org','thumb.wikimedia.org'].includes(host) || /^(?:tse|ts)[1-4]\.mm\.bing\.net$/.test(host);
const cache = new Map();
const diskCache = path.resolve(__dirname, '..', '.cache', 'memory-images');
function cachedImageFile(url) {
  return path.join(diskCache, crypto.createHash('sha256').update(url).digest('hex'));
}
function loadCachedImage(url) {
  if (!imageHost(url.hostname)) return null;
  try {
    const file = cachedImageFile(url.href), type = fs.readFileSync(file + '.type', 'utf8');
    if (!/^image\/(jpeg|png|webp)(?:;|$)/.test(type)) return null;
    const body = fs.readFileSync(file + '.bin');
    return body.length > 0 && body.length <= 4 * 1024 * 1024 ? { body, type, expires: Infinity } : null;
  } catch { return null; }
}
function saveCachedImage(url, result) {
  if (!imageHost(url.hostname) || !/^image\/(jpeg|png|webp)(?:;|$)/.test(result.type)) return;
  try {
    fs.mkdirSync(diskCache, { recursive: true });
    const file = cachedImageFile(url.href);
    fs.writeFileSync(file + '.bin', result.body);
    fs.writeFileSync(file + '.type', result.type);
  } catch { /* The request can still succeed when disk storage is unavailable. */ }
}
let sharedAgent;
let apiQueue = Promise.resolve();
let nextApiAt = 0;
let apiBlockedUntil = 0;

function proxyUrl() {
  const configured = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
  if (configured) { try { return new URL(configured); } catch { return null; } }
  if (process.platform === 'win32') {
    try {
      const value = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        "[System.Net.WebRequest]::GetSystemWebProxy().GetProxy([uri]'https://commons.wikimedia.org').AbsoluteUri"],
        { encoding: 'utf8', timeout: 5000, windowsHide: true }).trim();
      const url = new URL(value);
      return ALLOWED_HOSTS.has(url.hostname) ? null : url;
    } catch { return null; }
  }
  return null;
}

function agent() {
  if (sharedAgent) return sharedAgent;
  const proxy = proxyUrl();
  sharedAgent = new https.Agent({ keepAlive: true, maxSockets: 6 });
  if (!proxy || !['http:', 'https:'].includes(proxy.protocol)) return sharedAgent;
  sharedAgent.createConnection = (options, callback) => {
    let completed = false;
    const finish = (error, socket) => { if (!completed) { completed = true; callback(error, socket); } };
    const headers = { Host: options.host + ':443' };
    if (proxy.username) headers['Proxy-Authorization'] = 'Basic ' + Buffer.from(decodeURIComponent(proxy.username) + ':' + decodeURIComponent(proxy.password)).toString('base64');
    const connect = (proxy.protocol === 'https:' ? https : http).request(proxy, { method: 'CONNECT', path: options.host + ':443', headers, agent: false });
    connect.setTimeout(12000, () => connect.destroy(new Error('图片连接超时')));
    connect.once('connect', (response, socket, head) => {
      if (response.statusCode !== 200) { socket.destroy(); finish(new Error('图片网络连接失败')); return; }
      if (head.length) socket.unshift(head);
      const secure = tls.connect({ socket, servername: options.host }, () => finish(null, secure));
      secure.once('error', error => finish(error));
    });
    connect.once('error', error => finish(error));
    connect.end();
  };
  return sharedAgent;
}

function allowedUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname) && !url.username && !url.password && (!url.port || url.port === '443') ? url : null; }
  catch { return null; }
}
function requestRemote(value, redirects = 0, queued = false) {
  const url = allowedUrl(value);
  if (!url || redirects > 3) return Promise.reject(new Error('不支持的图片地址'));
  const cached = cache.get(url.href);
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached);
  const saved = loadCachedImage(url);
  if (saved) return Promise.resolve(saved);
  if (url.pathname.endsWith('/api.php') && !queued) {
    const task = apiQueue.then(async () => {
      if (apiBlockedUntil > Date.now()) { const error = new Error('图片服务请求较多，请稍后再试'); error.status = 429; throw error; }
      const delay = nextApiAt - Date.now();
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      nextApiAt = Date.now() + 1000;
      return requestRemote(value, redirects, true);
    });
    apiQueue = task.catch(() => {});
    return task;
  }
  return new Promise((resolve, reject) => {
    const request = https.get(url, { agent: agent(), headers: { 'User-Agent': 'CubeStudio/1.0 (local personal mnemonic trainer)', 'Accept-Encoding': 'identity' } }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume(); requestRemote(new URL(response.headers.location, url).href, redirects + 1).then(resolve, reject); return;
      }
      if (response.statusCode !== 200) {
        const error = new Error('图片服务响应异常（' + response.statusCode + '），请稍后重试'); error.status = response.statusCode;
        if (response.statusCode === 429) {
          const after = Number(response.headers['retry-after']);
          apiBlockedUntil = Date.now() + (Number.isFinite(after) && after > 0 ? Math.min(after, 60) : 5) * 1000;
        }
        response.resume(); reject(error); return;
      }
      const type = String(response.headers['content-type'] || '');
      const searchHtml = ['www.bing.com','cn.bing.com'].includes(url.hostname) && url.pathname === '/images/search' && type.startsWith('text/html');
      if (!/^application\/json|^image\/(jpeg|png|webp)/.test(type) && !searchHtml) { response.resume(); reject(new Error('图片服务返回了无法识别的内容')); return; }
      const chunks = []; let size = 0;
      response.on('data', chunk => { size += chunk.length; if (size > 4 * 1024 * 1024) request.destroy(new Error('图片过大')); else chunks.push(chunk); });
      response.once('error', reject);
      response.once('end', () => {
        if (size > 4 * 1024 * 1024) return;
        const result = { body: Buffer.concat(chunks), type, expires: Date.now() + 3600000 };
        saveCachedImage(url, result);
        if (cache.size >= 80) cache.delete(cache.keys().next().value);
        cache.set(url.href, result); resolve(result);
      });
    });
    request.setTimeout(15000, () => request.destroy(new Error('图片搜索超时，请换个关键词重试')));
    request.once('error', reject);
  });
}
async function handleMemoryImages(request, response) {
  const url = new URL(request.url, 'http://localhost');
  if (!['/api/memory-images', '/api/memory-image'].includes(url.pathname)) return false;
  if (request.method !== 'GET') { response.writeHead(405); response.end(); return true; }
  try {
    let remote;
    if (url.pathname === '/api/memory-images') {
      const query = (url.searchParams.get('q') || '').trim();
      if (!query || query.length > 100) { response.writeHead(400); response.end('Invalid keyword'); return true; }
      const result = await searchImages(query, async address => JSON.parse((await requestRemote(address)).body.toString('utf8')), url.searchParams.get('more') === '1', async address => (await requestRemote(address)).body.toString('utf8'));
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(result));
      return true;
    } else {
      remote = url.searchParams.get('url') || '';
      if (!allowedUrl(remote) || !imageHost(new URL(remote).hostname)) { response.writeHead(400); response.end('Invalid image'); return true; }
    }
    const result = await requestRemote(remote);
    if (url.pathname === '/api/memory-image' && !result.type.startsWith('image/')) throw new Error('无法读取此图片');
    response.writeHead(200, { 'Content-Type': result.type, 'Cache-Control': url.pathname === '/api/memory-image' ? 'private, max-age=3600' : 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(result.body);
  } catch (error) {
    response.writeHead(error.status === 429 ? 429 : 502, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: { info: error.status === 429 ? '图片服务请求较多，请稍后重试。' : '图片服务暂时无法连接，请重试或使用外部图片搜索。' } }));
  }
  return true;
}
module.exports = { handleMemoryImages, allowedUrl, requestRemote };
