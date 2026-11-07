// Local HTTP server for the teacher's phone. Bound only to the hotspot address, serves no folders,
// and exposes only its own routes under a random session token (page, events, signature, the two bundled
// font files). Everything else is 404.
import crypto from 'node:crypto'
import http from 'node:http'
import os from 'node:os'
import { isValidSignature, hasEnoughInk, type SignaturePayload } from '../core/signature/signature'
import { phonePage } from './phone-page'

export type PhoneMessage =
  | { type: 'idle' }
  /** `image`: PNG data URL of the student's own row cut from the original 일람표 (shown above the pad). */
  | { type: 'request'; slot: string; label: string; aspect: number; image?: string }
  | { type: 'saved' }

export interface PhoneServerEvents {
  onConnection(connected: boolean): void
  /** Saves the signature for the student behind `slot`. Must resolve only after the data is on disk. */
  onSignature(slot: string, payload: SignaturePayload): Promise<{ ok: boolean; revision?: number; error?: string }>
}

const MAX_BODY = 256 * 1024

/** The app's bundled font files (학교안심 산뜻돋움 L·M, OTF). Missing ones are 404 and the phone uses its own font. */
export interface PhoneFonts {
  L?: Buffer
  M?: Buffer
}

export function hotspotAddress(): string | null {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) if (a.family === 'IPv4' && a.address.startsWith('192.168.137.')) return a.address
  }
  return null
}

export class PhoneServer {
  readonly token = crypto.randomBytes(16).toString('hex')
  private server: http.Server | null = null
  private stream: http.ServerResponse | null = null
  private ownerId: string | null = null
  private current: PhoneMessage = { type: 'idle' }
  private heartbeat: NodeJS.Timeout | null = null
  host = ''
  port = 0

  constructor(
    private events: PhoneServerEvents,
    private fonts: PhoneFonts = {}
  ) {}

  get url() {
    return `http://${this.host}:${this.port}/s/${this.token}`
  }

  get connected() {
    return !!this.stream
  }

  async start(host: string): Promise<void> {
    this.host = host
    for (let port = 8765; port <= 8785; port++) {
      try {
        await this.listen(host, port)
        this.port = port
        this.heartbeat = setInterval(() => this.stream?.write(': ping\n\n'), 15000)
        return
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw e
      }
    }
    throw new Error('사용할 수 있는 포트가 없습니다.')
  }

  private listen(host: string, port: number) {
    return new Promise<void>((resolve, reject) => {
      const s = http.createServer((req, res) => this.handle(req, res))
      s.once('error', reject)
      s.listen(port, host, () => {
        s.off('error', reject)
        this.server = s
        resolve()
      })
    })
  }

  stop() {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.stream?.end()
    this.stream = null
    this.ownerId = null
    this.server?.closeAllConnections?.()
    this.server?.close()
    this.server = null
  }

  /** Sends the current state to the phone (and remembers it for reconnects). */
  send(msg: PhoneMessage) {
    this.current = msg
    this.stream?.write(`data: ${JSON.stringify(msg)}\n\n`)
  }

  private reply(res: http.ServerResponse, status: number, type: string, body: string) {
    res.writeHead(status, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'"
    })
    res.end(body)
  }

  /** Font files are the same for every student, so the phone may cache them (no student data in them). */
  private sendFont(res: http.ServerResponse, weight: keyof PhoneFonts) {
    const data = this.fonts[weight]
    if (!data) return this.reply(res, 404, 'text/plain', 'not found')
    res.writeHead(200, { 'Content-Type': 'font/otf', 'Content-Length': data.length, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' })
    res.end(data)
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse) {
    // Reject requests that were not addressed to this exact host:port (DNS rebinding guard).
    if (req.headers.host !== `${this.host}:${this.port}`) return this.reply(res, 404, 'text/plain', 'not found')
    const url = new URL(req.url ?? '/', 'http://x')
    const base = `/s/${this.token}`

    if (req.method === 'GET' && url.pathname === base) return this.reply(res, 200, 'text/html; charset=utf-8', phonePage(this.token))
    if (req.method === 'GET' && url.pathname === `${base}/events`) return this.openStream(url.searchParams.get('c') ?? '', req, res)
    if (req.method === 'POST' && url.pathname === `${base}/signature`) return this.receive(req, res)
    if (req.method === 'GET' && url.pathname === `${base}/font/L.otf`) return this.sendFont(res, 'L')
    if (req.method === 'GET' && url.pathname === `${base}/font/M.otf`) return this.sendFont(res, 'M')
    return this.reply(res, 404, 'text/plain', 'not found')
  }

  private openStream(clientId: string, req: http.IncomingMessage, res: http.ServerResponse) {
    if (!/^[0-9a-f]{32}$/.test(clientId)) return this.reply(res, 400, 'text/plain', 'bad client')
    // One phone per session. The same phone may reconnect (refresh, network blip).
    if (this.ownerId && this.ownerId !== clientId && this.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' })
      res.end(`data: ${JSON.stringify({ type: 'blocked' })}\n\n`)
      return
    }
    this.ownerId = clientId
    this.stream?.end()
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
    res.write(`retry: 2000\n\ndata: ${JSON.stringify(this.current)}\n\n`)
    this.stream = res
    this.events.onConnection(true)
    req.on('close', () => {
      if (this.stream === res) {
        this.stream = null
        this.events.onConnection(false)
      }
    })
  }

  private receive(req: http.IncomingMessage, res: http.ServerResponse) {
    const json = (status: number, body: object) => this.reply(res, status, 'application/json', JSON.stringify(body))
    if (req.headers['x-client-id'] !== this.ownerId) return json(403, { ok: false, error: '연결된 휴대폰이 아닙니다.' })
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        json(413, { ok: false, error: '서명 데이터가 너무 큽니다.' })
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', async () => {
      if (res.writableEnded) return
      let body: { slot?: unknown } & Record<string, unknown>
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        return json(400, { ok: false, error: '잘못된 요청입니다.' })
      }
      const slot = typeof body.slot === 'string' ? body.slot : ''
      if (this.current.type !== 'request' || this.current.slot !== slot)
        return json(409, { ok: false, error: 'PC에서 학생이 바뀌었습니다. 선생님께 알려 주세요.' })
      const payload = { requestId: body.requestId, canvas: body.canvas, strokes: body.strokes }
      if (!isValidSignature(payload)) return json(400, { ok: false, error: '서명 데이터가 올바르지 않습니다.' })
      if (!hasEnoughInk(payload.strokes)) return json(400, { ok: false, error: '서명이 너무 짧아요. 다시 써 주세요.' })
      try {
        const r = await this.events.onSignature(slot, payload)
        return json(r.ok ? 200 : 500, r)
      } catch {
        return json(500, { ok: false, error: 'PC에 저장하지 못했습니다. 다시 제출해 주세요.' })
      }
    })
  }
}
