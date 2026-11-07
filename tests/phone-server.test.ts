import http from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { PhoneServer } from '../src/main/phone-server'
import { phonePage } from '../src/main/phone-page'

const CLIENT = 'a'.repeat(32)
const OTHER = 'b'.repeat(32)
const sig = (requestId: string) => ({
  requestId,
  canvas: { w: 300, h: 100 },
  strokes: [[[0.1, 0.5, 0], [0.5, 0.2, 10], [0.9, 0.6, 20]]]
})

function request(srv: PhoneServer, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request({ host: srv.host, port: srv.port, agent: false, method, path, headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
      let b = ''
      res.on('data', (c) => (b += c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: b }))
    })
    req.on('error', reject)
    if (body !== undefined) req.write(JSON.stringify(body))
    req.end()
  })
}

/** Opens the SSE stream and resolves with the first message. Returns the request so it can be closed. */
function openEvents(srv: PhoneServer, client: string) {
  return new Promise<{ first: unknown; req: http.ClientRequest }>((resolve) => {
    const req = http.get({ host: srv.host, port: srv.port, agent: false, path: `/s/${srv.token}/events?c=${client}` }, (res) => {
      res.on('data', (c: Buffer) => {
        const m = /data: (.*)\n/.exec(c.toString())
        if (m) resolve({ first: JSON.parse(m[1]!), req })
      })
    })
    // Closing a stream on purpose resets the socket; that is expected here. (No shared agent: a pooled socket
    // to a stopped server from the previous test would hang the next request.)
    req.on('error', () => {})
  })
}

let server: PhoneServer | null = null
afterEach(() => server?.stop())

describe('PhoneServer', () => {
  it('serves only its routes, saves once per requestId, and blocks a second phone', async () => {
    const saved: string[] = []
    let connections = 0
    server = new PhoneServer({
      onConnection: (c) => void (c && connections++),
      onSignature: async (slot, p) => {
        saved.push(`${slot}:${p.requestId}`)
        return { ok: true, revision: saved.length }
      }
    })
    await server.start('127.0.0.1')

    expect((await request(server, 'GET', `/s/${server.token}`)).status).toBe(200)
    expect((await request(server, 'GET', '/')).status).toBe(404)
    expect((await request(server, 'GET', `/s/${'0'.repeat(32)}`)).status).toBe(404)
    expect((await request(server, 'GET', `/s/${server.token}`, undefined, { Host: 'evil.example' })).status).toBe(404)

    const a = await openEvents(server, CLIENT)
    expect(a.first).toEqual({ type: 'idle' })
    expect(connections).toBe(1)

    const b = await openEvents(server, OTHER)
    expect(b.first).toEqual({ type: 'blocked' })

    // No student requested yet -> 409
    const early = await request(server, 'POST', `/s/${server.token}/signature`, { slot: 'x', ...sig('1'.repeat(32)) }, { 'X-Client-Id': CLIENT })
    expect(early.status).toBe(409)

    server.send({ type: 'request', slot: 'slot1', label: '1반 1번 김○○', aspect: 3 })
    const notOwner = await request(server, 'POST', `/s/${server.token}/signature`, { slot: 'slot1', ...sig('1'.repeat(32)) }, { 'X-Client-Id': OTHER })
    expect(notOwner.status).toBe(403)

    const ok = await request(server, 'POST', `/s/${server.token}/signature`, { slot: 'slot1', ...sig('1'.repeat(32)) }, { 'X-Client-Id': CLIENT })
    expect(ok.status).toBe(200)
    expect(JSON.parse(ok.body)).toMatchObject({ ok: true })
    expect(saved).toEqual(['slot1:' + '1'.repeat(32)])

    const tiny = await request(
      server, 'POST', `/s/${server.token}/signature`,
      { slot: 'slot1', requestId: '2'.repeat(32), canvas: { w: 1, h: 1 }, strokes: [[[0.5, 0.5, 0]]] },
      { 'X-Client-Id': CLIENT }
    )
    expect(tiny.status).toBe(400)

    a.req.destroy()
    b.req.destroy()
  })

  it('sends the row image with a request and replays it to a reconnecting phone; idle drops it', async () => {
    server = new PhoneServer({ onConnection: () => {}, onSignature: async () => ({ ok: true, revision: 1 }) })
    await server.start('127.0.0.1')
    const image = 'data:image/png;base64,iVBORw0KGgo='
    server.send({ type: 'request', slot: 's', label: '2반 3번 이○○', aspect: 3, image })
    const a = await openEvents(server, CLIENT)
    expect(a.first).toEqual({ type: 'request', slot: 's', label: '2반 3번 이○○', aspect: 3, image })
    a.req.destroy()
    server.send({ type: 'idle' })
    const b = await openEvents(server, CLIENT)
    expect(b.first).toEqual({ type: 'idle' })
    b.req.destroy()
    // The page shows the picture only from a PNG data URL and clears it on idle.
    const page = phonePage('t')
    expect(page).toContain("m.image.indexOf('data:image/png;base64,') === 0")
    expect(page).toContain("setRowImage(null)")
  })

  it('serves the bundled font files only under the session token', async () => {
    server = new PhoneServer({ onConnection: () => {}, onSignature: async () => ({ ok: true }) }, { L: Buffer.from('font-L') })
    await server.start('127.0.0.1')
    const l = await request(server, 'GET', `/s/${server.token}/font/L.otf`)
    expect(l).toEqual({ status: 200, body: 'font-L' })
    expect((await request(server, 'GET', `/s/${server.token}/font/M.otf`)).status).toBe(404) // not loaded -> phone falls back
    expect((await request(server, 'GET', `/s/${'0'.repeat(32)}/font/L.otf`)).status).toBe(404)
    expect((await request(server, 'GET', `/s/${server.token}/font/X.otf`)).status).toBe(404)
    expect(phonePage(server.token)).toContain(`/s/${server.token}/font/M.otf`)
  })
})
