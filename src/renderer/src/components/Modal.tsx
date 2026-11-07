import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Display-only overlay. Closes on backdrop click, Escape, or the ✕ button. Locks page scroll while open and
 * restores it on close. Holds no app state, so opening or closing it never touches work data.
 */
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    const prevFocus = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      prevFocus?.focus?.()
    }
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal info-modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <button ref={closeRef} className="modal-close" aria-label="닫기" onClick={onClose}>
          ✕
        </button>
        {children}
      </div>
    </div>
  )
}
