// Phase 0 test server: checks that a phone on the PC hotspot can open a page and send a signature.
// No dependencies. Serves no folders. Binds only to the hotspot adapter address.
// Usage: node server.mjs [--host 192.168.137.1] [--port 8765]

import http from 'node:http'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(here, 'out')
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith('--') ? [...acc, [v.slice(2), a[i + 1]]] : acc), [])
)

function findHotspotAddress() {
  const all = []
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) all.push({ name, address: a.address })
    }
  }
  return { hit: all.find((a) => a.address.startsWith('192.168.137.')), all }
}

const { hit, all } = findHotspotAddress()
const host = args.host ?? hit?.address
const port = Number(args.port ?? 8765)

if (!host) {
  console.error('[X] 핫스팟 어댑터 주소(192.168.137.x)를 찾지 못했습니다. 핫스팟이 켜져 있는지 확인하세요.')
  console.error('    현재 IPv4 주소:', all.map((a) => `${a.name}=${a.address}`).join(', ') || '(없음)')
  console.error('    다른 주소로 시험하려면: node server.mjs --host <주소>')
  process.exit(1)
}

// Short token so it can be typed on a phone during the test.
const token = crypto.randomBytes(4).toString('hex').slice(0, 6)
const seen = new Map() // requestId -> response (idempotency)
fs.mkdirSync(outDir, { recursive: true })

const page = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>서명 시험</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; font-family: system-ui, sans-serif; background: #f4f4f5; color: #18181b; }
  main { padding: 16px; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { margin: 0 0 12px; color: #52525b; font-size: 14px; }
  canvas { width: 100%; aspect-ratio: 3 / 1; background: #fff; border: 2px dashed #a1a1aa; border-radius: 8px; touch-action: none; display: block; }
  .row { display: flex; gap: 8px; margin-top: 12px; }
  button { flex: 1; font-size: 18px; padding: 14px; border-radius: 8px; border: 0; }
  #clear { background: #e4e4e7; }
  #send { background: #2563eb; color: #fff; }
  #msg { margin-top: 12px; font-size: 16px; min-height: 24px; }
  .ok { color: #15803d; } .err { color: #b91c1c; }
</style></head>
<body><main>
  <h1>서명 전송 시험</h1>
  <p>아래 칸에 아무 서명이나 하고 [보내기]를 누르세요. 실제 학생 정보는 없습니다.</p>
  <canvas id="c"></canvas>
  <div class="row"><button id="clear">지우기</button><button id="send">보내기</button></div>
  <div id="msg"></div>
</main>
<script>
  const TOKEN = ${JSON.stringify(token)};
  const c = document.getElementById('c'), ctx = c.getContext('2d'), msg = document.getElementById('msg');
  let strokes = [], cur = null, t0 = 0;
  function fit() {
    const r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    c.width = r.width * d; c.height = r.height * d; ctx.setTransform(d, 0, 0, d, 0, 0); redraw();
  }
  function redraw() {
    const r = c.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
    for (const s of strokes) { ctx.beginPath(); s.forEach(([x, y], i) => i ? ctx.lineTo(x * r.width, y * r.height) : ctx.moveTo(x * r.width, y * r.height)); ctx.stroke(); }
  }
  function pt(e) { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, Math.round(performance.now() - t0)]; }
  c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); if (!strokes.length) t0 = performance.now(); cur = [pt(e)]; strokes.push(cur); });
  c.addEventListener('pointermove', (e) => { if (cur) { cur.push(pt(e)); redraw(); } });
  ['pointerup', 'pointercancel'].forEach((n) => c.addEventListener(n, () => { cur = null; }));
  document.getElementById('clear').onclick = () => { strokes = []; redraw(); msg.textContent = ''; };
  function rid() { const b = new Uint8Array(16); crypto.getRandomValues(b); return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''); }
  let pendingId = null;
  document.getElementById('send').onclick = async () => {
    if (!strokes.length) { msg.className = 'err'; msg.textContent = '서명이 비어 있습니다.'; return; }
    pendingId = pendingId || rid();
    const r = c.getBoundingClientRect();
    msg.className = ''; msg.textContent = '보내는 중...';
    try {
      const res = await fetch('/api/signature', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Session-Token': TOKEN },
        body: JSON.stringify({ requestId: pendingId, canvas: { w: Math.round(r.width), h: Math.round(r.height) }, strokes, createdAt: new Date().toISOString() }) });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || res.status);
      msg.className = 'ok'; msg.textContent = 'PC 저장 완료 (' + j.file + ')';
      strokes = []; pendingId = null; redraw();
    } catch (err) { msg.className = 'err'; msg.textContent = '저장 실패: ' + err.message + ' — 다시 보내기를 누르세요.'; }
  };
  window.addEventListener('resize', fit); fit();
</script></body></html>`

function toSvg(body) {
  const w = 600, h = 200
  const paths = body.strokes
    .map((s) => 'M' + s.map(([x, y]) => `${(x * w).toFixed(1)} ${(y * h).toFixed(1)}`).join(' L'))
    .map((d) => `<path d="${d}" fill="none" stroke="#111" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#fff"/>${paths.join('')}</svg>`
}

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(body)
}

function validBody(b) {
  return (
    b && typeof b.requestId === 'string' && /^[0-9a-f]{32}$/.test(b.requestId) &&
    Array.isArray(b.strokes) && b.strokes.length > 0 && b.strokes.length < 500 &&
    b.strokes.every((s) => Array.isArray(s) && s.every((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)))
  )
}

const server = http.createServer((req, res) => {
  const from = req.socket.remoteAddress
  const url = new URL(req.url, 'http://x')

  if (req.method === 'GET' && url.pathname === `/s/${token}`) {
    console.log(`[접속] ${from} 가 서명 페이지를 열었습니다.`)
    return send(res, 200, 'text/html; charset=utf-8', page)
  }

  if (req.method === 'POST' && url.pathname === '/api/signature') {
    if (req.headers['x-session-token'] !== token) return send(res, 403, 'application/json', '{"ok":false,"error":"bad token"}')
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > 256 * 1024) { send(res, 413, 'application/json', '{"ok":false,"error":"too large"}'); req.destroy() }
      else chunks.push(c)
    })
    req.on('end', () => {
      if (res.writableEnded) return
      let body
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return send(res, 400, 'application/json', '{"ok":false,"error":"bad json"}') }
      if (!validBody(body)) return send(res, 400, 'application/json', '{"ok":false,"error":"bad body"}')
      if (seen.has(body.requestId)) {
        console.log(`[중복] 같은 요청이 다시 와서 저장하지 않았습니다.`)
        return send(res, 200, 'application/json', seen.get(body.requestId))
      }
      const name = `sig-${Date.now()}`
      try {
        fs.writeFileSync(path.join(outDir, name + '.json'), JSON.stringify(body))
        fs.writeFileSync(path.join(outDir, name + '.svg'), toSvg(body))
      } catch (e) {
        console.error('[X] 저장 실패:', e.message)
        return send(res, 500, 'application/json', '{"ok":false,"error":"save failed"}')
      }
      const reply = JSON.stringify({ ok: true, file: name })
      seen.set(body.requestId, reply)
      console.log(`[저장] ${from} 의 서명을 저장했습니다: out\\${name}.svg (획 ${body.strokes.length}개)`)
      return send(res, 200, 'application/json', reply)
    })
    return
  }

  send(res, 404, 'text/plain; charset=utf-8', 'not found')
})

// Diagnostics: show every TCP connection and malformed request, so we can tell
// "nothing arrived" (firewall/network) from "arrived but wrong URL/HTTPS".
server.on('connection', (sock) => {
  console.log(`[연결] ${sock.remoteAddress} 에서 TCP 연결이 들어왔습니다.`)
})
server.on('clientError', (err, sock) => {
  const tls = err.code === 'HPE_INVALID_METHOD'
  console.log(tls
    ? `[주의] ${sock.remoteAddress} 가 https 로 접속했습니다. 주소 앞에 http:// 를 붙여 입력하세요.`
    : `[주의] ${sock.remoteAddress} 요청 오류: ${err.code}`)
  sock.destroy()
})
server.on('request', (req) => {
  const u = new URL(req.url, 'http://x')
  if (!u.pathname.startsWith('/s/') && u.pathname !== '/api/signature')
    console.log(`[요청] ${req.socket.remoteAddress} ${req.method} ${u.pathname} → 주소가 다릅니다(404).`)
})

server.on('error', (e) => {
  console.error('[X] 서버 시작 실패:', e.code, e.message)
  process.exit(1)
})

server.listen(port, host, () => {
  console.log('')
  console.log('==============================================')
  console.log(' Phase 0 서명 시험 서버 실행 중')
  console.log('----------------------------------------------')
  console.log(` 폰 브라우저 주소:  http://${host}:${port}/s/${token}`)
  console.log('----------------------------------------------')
  console.log(' - 폰은 PC 핫스팟에 연결된 상태여야 합니다.')
  console.log(' - 이 서버는 폴더를 공개하지 않습니다. 위 주소 외에는 404.')
  console.log(' - 끝내려면 Ctrl+C')
  console.log('==============================================')
})

process.on('SIGINT', () => {
  console.log('\n서버를 종료했습니다. 이제 폰에서 새로고침하면 접속이 안 되어야 정상입니다.')
  server.close(() => process.exit(0))
})
