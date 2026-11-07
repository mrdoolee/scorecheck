import { useState } from 'react'
import type { PhoneStartResult } from '../../../shared/ipc'

/** Masks the middle of a Korean name for the phone label: 홍길동 → 홍○동, 남궁민수 → 남○○수. */
export function maskName(name: string) {
  const chars = [...name]
  if (chars.length <= 1) return name
  if (chars.length === 2) return `${chars[0]}○`
  return chars[0] + '○'.repeat(chars.length - 2) + chars[chars.length - 1]
}

export type PhoneInfo = Extract<PhoneStartResult, { ok: true }>

/** `info` lives in the parent: this panel unmounts while a student screen is open, and the QR must still be there after. */
export function PhonePanel({ connected, info, onInfoChange }: { connected: boolean; info: PhoneInfo | null; onInfoChange: (i: PhoneInfo | null) => void }) {
  const running = info !== null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  async function start() {
    setBusy(true)
    setError(null)
    try {
      const r = await window.api.phoneStart()
      if (r.ok) {
        onInfoChange(r)
        setOpen(true)
      } else setError(r.error)
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    await window.api.phoneStop()
    onInfoChange(null)
    setOpen(false)
  }

  return (
    <div className="phone-panel">
      <div className="phone-status">
        <span className={`dot ${connected ? 'on' : running ? 'wait' : ''}`} />
        {connected ? '휴대폰 연결됨' : running ? '휴대폰 연결 대기 중' : '휴대폰 연결 안 됨'}
      </div>
      {!running ? (
        <button className="btn primary" onClick={start} disabled={busy}>
          {busy ? '핫스팟 켜는 중…' : '휴대폰 연결'}
        </button>
      ) : (
        <div className="row">
          <button className="btn" onClick={() => setOpen(true)}>
            QR 다시 보기
          </button>
          <button className="btn ghost" onClick={stop}>
            연결 끊기
          </button>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}

      {open && info && (
        <div className="modal-backdrop">
          <div className="modal wide">
            <h3>교사 휴대폰 연결</h3>
            <div className="qr-steps">
              <div className="qr-step">
                <div className="qr-num">1</div>
                <img src={info.wifiQr} alt="Wi-Fi 연결 QR" />
                <p>
                  휴대폰 카메라로 찍어 <b>PC 핫스팟</b>에 연결
                </p>
                <p className="muted small">
                  이름 {info.ssid}
                  <br />
                  비밀번호 {info.passphrase}
                </p>
              </div>
              <div className="qr-step">
                <div className="qr-num">2</div>
                <img src={info.pageQr} alt="서명 페이지 QR" />
                <p>
                  <b>서명 페이지</b> 열기
                </p>
                <p className="muted small mono">{info.url}</p>
              </div>
            </div>
            <div className="notice">
              <b>처음 한 번만:</b> 안드로이드 휴대폰은 <b>설정 → 애플리케이션 → Chrome → 권한 → 근처 기기</b>를 <b>허용</b>해야 PC에
              접속됩니다. 허용하지 않으면 &ldquo;ERR_TOO_MANY_RETRIES&rdquo; 오류가 납니다.
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className={connected ? 'ok' : 'muted'}>{connected ? '✓ 휴대폰이 연결되었습니다.' : '휴대폰 연결을 기다리는 중…'}</span>
              <button className="btn primary" onClick={() => setOpen(false)}>
                {connected ? '완료' : '닫기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
