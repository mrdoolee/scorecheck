import { useCallback, useState } from 'react'
import { Modal } from './Modal'
import { PRIVACY_INTRO, PRIVACY_SECTIONS, PRIVACY_TITLE, PRIVACY_VERSION } from '../../../shared/privacy'
import { GUIDE_SECTIONS, GUIDE_TITLE } from '../../../shared/guide'

// The only external pages the app may open. They open in the default browser (see main: setWindowOpenHandler).
const INSTAGRAM = 'https://www.instagram.com/trdoolee'
const BLOG = 'https://blog.naver.com/trdoolee'

function CreditModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="제작자 안내" onClose={onClose}>
      <section className="card modal-card">
        <h3>✨ 제작: 두리쌤</h3>
        <h4>📌 이용 조건</h4>
        <ul>
          <li>교육 목적으로 자유롭게 사용하실 수 있습니다.</li>
          <li>재배포 시 출처(제작자 표기)를 유지해 주세요.</li>
          <li>코드를 임의로 수정한 버전을 다시 배포하지 말아 주세요.</li>
          <li>수정이 필요하시면 아래 연락처로 요청해 주세요.</li>
        </ul>
      </section>
      <section className="card modal-card">
        <h4>📷 문의</h4>
        <ul>
          <li>
            Instagram:{' '}
            <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer">
              trdoolee
            </a>
          </li>
          <li>
            Blog:{' '}
            <a href={BLOG} target="_blank" rel="noopener noreferrer">
              blog.naver.com/trdoolee
            </a>
          </li>
        </ul>
        <p className="modal-note">간단한 질문 위주로 답변드리며, 답변이 늦어질 수 있습니다.</p>
      </section>
    </Modal>
  )
}

function PrivacyModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title={PRIVACY_TITLE} onClose={onClose} wide>
      <h3 className="privacy-title">{PRIVACY_TITLE}</h3>
      <p className="muted small">{PRIVACY_VERSION}</p>
      <div className="privacy-body">
        <p>{PRIVACY_INTRO}</p>
        {PRIVACY_SECTIONS.map((s) => (
          <section key={s.title}>
            <h4>{s.title}</h4>
            {s.bullets && (
              <ul>
                {s.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            {s.paragraphs?.map((p) => <p key={p}>{p}</p>)}
          </section>
        ))}
      </div>
    </Modal>
  )
}

function GuideModal({ onClose }: { onClose: () => void }) {
  const jump = (id: string) => document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <Modal title={GUIDE_TITLE} onClose={onClose} wide>
      <h3 className="privacy-title">📖 {GUIDE_TITLE}</h3>
      <p className="muted small">처음 쓰실 때 위에서부터 차례로 따라 하세요.</p>
      <nav className="guide-toc" aria-label="사용 설명 목차">
        {GUIDE_SECTIONS.map((s) => (
          <button key={s.id} className="chip small" onClick={() => jump(s.id)}>
            {s.title}
          </button>
        ))}
      </nav>
      <div className="privacy-body guide-body">
        {GUIDE_SECTIONS.map((s) => (
          <section key={s.id} id={`guide-${s.id}`} className="card modal-card">
            <h4>{s.title}</h4>
            {s.intro && <p>{s.intro}</p>}
            {s.steps && (
              <ol>
                {s.steps.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ol>
            )}
            {s.tips && (
              <ul className="guide-tips">
                {s.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </Modal>
  )
}

export function AppFooter() {
  const [open, setOpen] = useState<'credit' | 'privacy' | 'guide' | null>(null)
  const [diagError, setDiagError] = useState<string | null>(null)
  const close = useCallback(() => setOpen(null), [])

  async function saveDiagnostics() {
    setDiagError(null)
    try {
      const r = await window.api.saveDiagnostics()
      if (r.ok && r.path) window.api.showInFolder(r.path)
      else if (!r.canceled) setDiagError(r.error ?? '진단 정보를 저장하지 못했습니다.')
    } catch {
      setDiagError('진단 정보를 저장하지 못했습니다. 다시 시도하세요.')
    }
  }

  return (
    <footer className="app-foot">
      <button className="foot-guide" onClick={() => setOpen('guide')}>
        📖 사용 설명
      </button>
      <div className="foot-main">
        <p className="foot-links">
          <button className="linklike" onClick={() => setOpen('privacy')}>
            개인정보 처리 안내
          </button>
          <span aria-hidden="true">·</span>
          <button
            className="linklike"
            onClick={saveDiagnostics}
            title="Windows 버전, 핫스팟 지원 여부, 오류 코드만 담습니다. 학생·교사 이름과 파일 경로는 들어가지 않습니다."
          >
            진단 정보 저장
          </button>
          <span aria-hidden="true">·</span>
          <span className="foot-version">버전 {__APP_VERSION__}</span>
        </p>
        {diagError && <p className="error-text small">{diagError}</p>}
        <p className="credit">
          © 2026 Designed &amp; Developed by{' '}
          <button className="linklike credit-link" onClick={() => setOpen('credit')}>
            두리쌤
          </button>
          . All rights reserved.
        </p>
      </div>
      {open === 'guide' && <GuideModal onClose={close} />}
      {open === 'credit' && <CreditModal onClose={close} />}
      {open === 'privacy' && <PrivacyModal onClose={close} />}
    </footer>
  )
}
