// The signing page served to the teacher's phone. Self-contained apart from the app's own font files, which the
// same local server serves (no external files, no CDN).
// The phone only ever receives: a class/number/masked-name label, the canvas shape, the student's own row cut
// from the original 일람표 (as an image, kept in memory only), status messages, and the app's two font files.

export function phonePage(token: string): string {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="referrer" content="no-referrer">
<title>서명</title>
<style>
  /* Same font as the PC app (학교안심 산뜻돋움): L for normal text, M for bold. */
  @font-face { font-family: 'Hakgyoansim Santteutdotum'; src: url('/s/${token}/font/L.otf') format('opentype'); font-weight: 100 450; font-display: swap; }
  @font-face { font-family: 'Hakgyoansim Santteutdotum'; src: url('/s/${token}/font/M.otf') format('opentype'); font-weight: 451 900; font-display: swap; }
  /* Same color tokens as the PC app (src/renderer/src/styles.css). */
  :root { color-scheme: light; --primary: #635bff; --ink: #0a2540; --ink-2: #425466; --muted: #8792a2; --line: #e3e8ee; --surface: #f6f9fc; --ok: #0e8a5f; --ok-soft: #e3f6ee; --err: #c0263b; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: var(--surface); color: var(--ink); font-family: 'Hakgyoansim Santteutdotum', system-ui, -apple-system, 'Malgun Gothic', sans-serif; -webkit-user-select: none; user-select: none; overscroll-behavior: none; word-break: keep-all; overflow-wrap: anywhere; }
  main { min-height: 100%; display: flex; flex-direction: column; padding: 14px 16px calc(14px + env(safe-area-inset-bottom)); gap: 12px; }
  .bar { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--muted); }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #c4cdd8; margin-right: 6px; }
  .dot.on { background: #12b886; box-shadow: 0 0 0 3px rgba(18, 184, 134, 0.15); }
  .center { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; gap: 10px; }
  .center p { margin: 0; font-size: 18px; line-height: 1.6; }
  .center small { color: var(--muted); font-size: 14px; }
  .who { font-size: 22px; font-weight: 700; }
  .pad { position: relative; width: 100%; background: #fff; border: 2px dashed #c4cdd8; border-radius: 14px; touch-action: none; }
  .pad canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
  .pad .hint { position: absolute; inset: 0; display: grid; place-items: center; color: #b4bfcc; font-size: 20px; pointer-events: none; }
  .pad .line { position: absolute; left: 6%; right: 6%; bottom: 22%; border-bottom: 1px solid var(--line); pointer-events: none; }
  .row { display: flex; gap: 10px; }
  button { flex: 1; font: inherit; font-size: 18px; padding: 14px; border-radius: 10px; border: 1px solid var(--line); background: #fff; color: var(--ink); }
  button.primary { background: var(--primary); border-color: var(--primary); color: #fff; font-weight: 700; }
  button:disabled { opacity: .45; }
  .msg { min-height: 22px; text-align: center; font-size: 15px; }
  .err { color: var(--err); } .ok { color: var(--ok); }
  /* Signed mark: identical to the PC student screen (.done-mark). */
  .check { width: 76px; height: 76px; border-radius: 50%; background: var(--ok); color: #fff; display: grid; place-items: center; font-size: 38px; }
  .rotate { display: none; color: var(--muted); font-size: 13px; text-align: center; }
  @media (orientation: portrait) { .rotate { display: block; } }
  /* The student's own row of the original 일람표, always the full row (so the dotted 비고 cell is visible).
     min-width: 0 keeps the wide picture from widening the whole page. */
  #v-sign, #rowimg-box { min-width: 0; max-width: 100%; }
  .rowimg { min-width: 0; max-width: 100%; background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 6px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .rowimg img { display: block; width: 100%; height: auto; }
  .rowimg-cap { margin: 4px 2px 0; font-size: 13px; color: var(--muted); }
  .signwrap { display: flex; flex-direction: column; gap: 12px; }
  .signcol, .actcol { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  /* Landscape phones are short: the row picture takes the top, so the buttons move beside the pad and the pad
     is capped in height (keeping its shape) to keep everything on one screen. */
  @media (orientation: landscape) {
    main { padding-top: 8px; padding-bottom: calc(8px + env(safe-area-inset-bottom)); gap: 8px; }
    #v-sign { gap: 8px !important; }
    .signwrap { flex-direction: row; align-items: flex-end; }
    .signcol { flex: 1; gap: 6px; }
    .who { font-size: 18px; }
    .pad { width: min(100%, calc(40vh * var(--a, 3))); align-self: center; }
    .actcol { width: 150px; flex: none; gap: 8px; }
    .actcol .row { flex-direction: column; gap: 8px; }
    .actcol button { padding: 12px; }
  }
  [hidden] { display: none !important; }
</style></head>
<body><main>
  <div class="bar"><span><span class="dot" id="dot"></span><span id="conn">PC에 연결 중…</span></span><span>몇점 서명</span></div>

  <section class="center" id="v-wait">
    <p>PC에서 학생이 성적을 확인하고<br><b>[서명하기]</b>를 누르면 여기에 서명 칸이 나타납니다.</p>
    <small>이 화면을 켜 둔 채로 기다려 주세요.</small>
  </section>

  <section id="v-sign" hidden style="display:flex;flex-direction:column;gap:12px;flex:1;justify-content:center">
    <div id="rowimg-box" hidden><div class="rowimg"><img id="rowimg" alt="일람표 원본에서 내 줄"></div><p class="rowimg-cap">일람표 원본의 내 줄입니다. 점선 칸(비고)에 서명이 들어갑니다.</p></div>
    <div class="signwrap">
      <div class="signcol">
        <div class="who" id="who"></div>
        <div class="rotate">가로로 돌리면 더 넓게 쓸 수 있어요.</div>
        <div class="pad" id="pad"><canvas id="c"></canvas><span class="hint" id="hint">여기에 서명하세요</span><span class="line"></span></div>
      </div>
      <div class="actcol">
        <div class="msg" id="msg"></div>
        <div class="row"><button id="clear">지우기</button><button class="primary" id="send">서명 제출</button></div>
      </div>
    </div>
  </section>

  <section class="center" id="v-done" hidden>
    <div class="check">✓</div>
    <p>서명이 저장되었어요.</p>
    <small>휴대폰을 선생님께 돌려주세요.</small>
  </section>

  <section class="center" id="v-blocked" hidden>
    <p>다른 기기가 이미 연결되어 있습니다.</p>
    <small>PC에서 연결을 다시 시작한 뒤 새 QR 코드로 접속하세요.</small>
  </section>
</main>
<script>
(function () {
  var TOKEN = ${JSON.stringify(token)};
  var base = '/s/' + TOKEN;
  var clientId = sessionStorage.getItem('sc-client');
  if (!clientId) { clientId = rid(); try { sessionStorage.setItem('sc-client', clientId); } catch (e) {} }
  var views = ['wait', 'sign', 'done', 'blocked'];
  function show(v) { views.forEach(function (n) { document.getElementById('v-' + n).hidden = n !== v; }); }
  function rid() { var b = new Uint8Array(16); crypto.getRandomValues(b); return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }

  var c = document.getElementById('c'), ctx = c.getContext('2d'), pad = document.getElementById('pad');
  var msg = document.getElementById('msg'), hint = document.getElementById('hint');
  var strokes = [], cur = null, t0 = 0, slot = null, requestId = null, busy = false;

  function fit() {
    var r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    c.width = Math.round(r.width * d); c.height = Math.round(r.height * d); ctx.setTransform(d, 0, 0, d, 0, 0); redraw();
  }
  function redraw() {
    var r = c.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.lineWidth = Math.max(2.5, r.height / 55); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
    strokes.forEach(function (s) {
      ctx.beginPath();
      s.forEach(function (p, i) { var x = p[0] * r.width, y = p[1] * r.height; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      if (s.length === 1) ctx.lineTo(s[0][0] * r.width + 0.1, s[0][1] * r.height);
      ctx.stroke();
    });
    hint.hidden = strokes.length > 0;
    document.getElementById('send').disabled = busy || !strokes.length;
    document.getElementById('clear').disabled = busy || !strokes.length;
  }
  function pt(e) { var r = c.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, Math.round(performance.now() - t0)]; }
  c.addEventListener('pointerdown', function (e) { if (busy) return; try { c.setPointerCapture(e.pointerId); } catch (x) {} if (!strokes.length) t0 = performance.now(); cur = [pt(e)]; strokes.push(cur); requestId = null; msg.textContent = ''; redraw(); });
  c.addEventListener('pointermove', function (e) {
    if (!cur) return;
    var list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    (list.length ? list : [e]).forEach(function (ev) { cur.push(pt(ev)); });
    redraw();
  });
  ['pointerup', 'pointercancel'].forEach(function (n) { c.addEventListener(n, function () { cur = null; }); });
  document.addEventListener('touchmove', function (e) { if (e.target === c) e.preventDefault(); }, { passive: false });

  function ink() { var L = 0; strokes.forEach(function (s) { for (var i = 1; i < s.length; i++) L += Math.hypot(s[i][0] - s[i-1][0], s[i][1] - s[i-1][1]); }); return L; }
  function resetPad() { strokes = []; requestId = null; msg.textContent = ''; msg.className = 'msg'; redraw(); }

  document.getElementById('clear').onclick = resetPad;
  document.getElementById('send').onclick = function () {
    if (!strokes.length || busy) return;
    if (ink() < 0.15) { msg.className = 'msg err'; msg.textContent = '서명이 너무 짧아요. 또박또박 써 주세요.'; return; }
    busy = true; requestId = requestId || rid();
    msg.className = 'msg'; msg.textContent = 'PC에 저장하는 중…'; redraw();
    var r = c.getBoundingClientRect();
    fetch(base + '/signature', {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Client-Id': clientId },
      body: JSON.stringify({ slot: slot, requestId: requestId, canvas: { w: Math.round(r.width), h: Math.round(r.height) }, strokes: strokes })
    }).then(function (res) { return res.json().then(function (j) { return { status: res.status, body: j }; }); })
      .then(function (r) {
        busy = false;
        if (r.body && r.body.ok) { strokes = []; show('done'); }
        else { msg.className = 'msg err'; msg.textContent = (r.body && r.body.error) || '저장하지 못했습니다. 다시 제출해 주세요.'; redraw(); }
      })
      .catch(function () { busy = false; msg.className = 'msg err'; msg.textContent = 'PC와 연결이 끊겼습니다. 잠시 후 다시 제출해 주세요.'; redraw(); });
  };

  function setRowImage(src) {
    var img = document.getElementById('rowimg');
    if (src) img.src = src; else img.removeAttribute('src');
    document.getElementById('rowimg-box').hidden = !src;
  }
  function setConn(on, text) { document.getElementById('dot').className = 'dot' + (on ? ' on' : ''); document.getElementById('conn').textContent = text; }
  function connect() {
    var es = new EventSource(base + '/events?c=' + encodeURIComponent(clientId));
    es.onopen = function () { setConn(true, 'PC에 연결됨'); };
    es.onerror = function () { setConn(false, 'PC와 다시 연결하는 중…'); };
    es.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.type === 'blocked') { es.close(); setConn(false, '연결 거부됨'); show('blocked'); return; }
      if (m.type === 'idle') { slot = null; setRowImage(null); resetPad(); show('wait'); return; }
      if (m.type === 'request') {
        if (slot !== m.slot) { slot = m.slot; resetPad(); }
        document.getElementById('who').textContent = m.label;
        setRowImage(typeof m.image === 'string' && m.image.indexOf('data:image/png;base64,') === 0 ? m.image : null);
        pad.style.aspectRatio = String(m.aspect || 3);
        pad.style.setProperty('--a', String(m.aspect || 3));
        show('sign'); fit(); return;
      }
      if (m.type === 'saved') { show('done'); return; }
    };
  }
  window.addEventListener('resize', function () { if (!document.getElementById('v-sign').hidden) fit(); });
  connect();
})();
</script></body></html>`
}
