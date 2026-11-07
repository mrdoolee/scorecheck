import { REPO } from './config.js'

// GitHub links. Without JS, or while REPO is still a placeholder, they stay on #install.
if (!REPO.includes('OWNER')) {
  const targets = {
    releases: `${REPO}/releases/latest`,
    repo: REPO
  }
  for (const a of document.querySelectorAll('[data-gh]')) {
    const href = targets[a.dataset.gh]
    if (href) a.href = href
  }
}

// Mock animations pause while they are off screen. Without JS they simply keep running.
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) e.target.classList.toggle('is-paused', !e.isIntersecting)
    },
    { threshold: 0.2 }
  )
  for (const m of document.querySelectorAll('.mock')) io.observe(m)
}
