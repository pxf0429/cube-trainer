const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('./build.cjs');
const { handleMemoryImages } = require('./memory-images.cjs');
const root = path.resolve(__dirname, '..', 'dist');
const port = Number(process.env.PORT || 5173);
build();
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer(async (request, response) => {
  if (await handleMemoryImages(request, response)) return;
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400); response.end('Bad request'); return; }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404); response.end('Not found'); return;
  }
  response.writeHead(200, { 'Content-Type': types[path.extname(file)] || (path.basename(file) === 'LICENSE' ? 'text/plain; charset=utf-8' : 'application/octet-stream'),
    'Cache-Control': pathname.startsWith('/assets/memory/') ? 'public, max-age=31536000, immutable' : 'no-store', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(file).pipe(response);
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? '端口 ' + port + ' 已被使用。可设置 PORT 后重试。' : error);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log('\n  CUBE / 魔方训练器\n  Local: http://localhost:' + port + '\n  Ctrl+C 停止\n'));
let timer;
fs.watch(path.resolve(__dirname, '..', 'src'), { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(() => { try { build(); } catch (error) { console.error(error); } }, 180);
});
function stop() { server.close(); process.exit(); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
