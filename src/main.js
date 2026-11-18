import { createViewer } from './viewer.js'

const $ = (sel, root = document) => root.querySelector(sel)
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

const loader = $('#loader')
const bar = $('#load-bar')
const pctEl = $('#load-pct')
const noteEl = $('#load-note')
const canvas = $('#viewer')

let viewer = null
let progressShown = 0

function setProgress(pct, note) {
  progressShown = Math.max(progressShown, pct)
  if (bar) bar.style.width = `${progressShown}%`
  if (pctEl) pctEl.textContent = String(Math.round(progressShown)).padStart(3, '0')
  if (note && noteEl) noteEl.textContent = note
}

function fail(message) {
  loader.classList.remove('is-done')
  const word = $('.loader__word')
  if (word) word.textContent = '读取失败'
  if (noteEl) {
    noteEl.innerHTML = `${message} · <a href="./models/study-01.glb" style="border-bottom:1px solid">直接下载 GLB</a>`
  }
  setProgress(0, '')
}

function formatBuild() {
  const d = new Date(__BUILD_TIME__)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
}

function setBuildInfo() {
  const commit = __COMMIT__
  const short = commit === 'local' ? 'local build' : commit
  const date = formatBuild()
  const commitEl = $('#build-commit')
  const timeEl = $('#build-time')
  const foot = $('#foot-build')
  if (commitEl) commitEl.textContent = short
  if (timeEl) timeEl.textContent = date
  if (foot) foot.textContent = `SURFACE STUDY 01 / ${short} / ${date}`
}

function setupReveals() {
  document.body.classList.add('reveal-ready')
  const items = $$('[data-reveal]')
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'))
    return
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-visible')
        io.unobserve(entry.target)
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
  )
  items.forEach((el) => io.observe(el))
}

function setupNav() {
  const links = $$('.site-nav a')
  const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]))
  const sections = ['observe', 'capture', 'plates', 'file'].map((id) => document.getElementById(id))
  if (!('IntersectionObserver' in window)) return
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        links.forEach((l) => l.classList.remove('is-active'))
        const link = map.get(entry.target.id)
        if (link) link.classList.add('is-active')
      }
    },
    { rootMargin: '-40% 0px -52% 0px' },
  )
  sections.forEach((s) => s && io.observe(s))
}

function setupScroll() {
  const capture = $('#capture')
  const heroBody = $('.hero__body')
  let ticking = false

  function update() {
    const y = window.scrollY || 0
    const vh = window.innerHeight
    const p = clamp(y / vh, 0, 1)
    document.body.classList.toggle('is-scrolled', y > 40)
    if (viewer) {
      viewer.setScroll(p)
      let paused = false
      if (capture) {
        const r = capture.getBoundingClientRect()
        document.body.classList.toggle('is-dark', r.top < 90 && r.bottom > 90)
        document.body.classList.toggle('stage-off', r.bottom < 90)
        paused = r.top <= 0 && r.bottom >= vh
      }
      viewer.setPaused(paused || document.hidden)
    }
    if (heroBody && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      heroBody.style.transform = `translateY(${p * 40}px)`
      heroBody.style.opacity = String(1 - p * 0.9)
    }
    ticking = false
  }

  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(update)
    },
    { passive: true },
  )
  document.addEventListener('visibilitychange', () => {
    if (viewer) viewer.setPaused(document.hidden)
  })
  update()
}

function setupControls() {
  const lightButtons = $$('[data-light]')
  const bedButtons = $$('[data-bed]')
  const cloudButtons = $$('[data-cloud]')
  const viewButtons = $$('[data-view]')

  lightButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      lightButtons.forEach((b) => {
        b.classList.toggle('is-active', b === btn)
        b.setAttribute('aria-pressed', String(b === btn))
      })
      viewer?.setLight(btn.dataset.light)
    })
  })

  bedButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      bedButtons.forEach((b) => {
        b.classList.toggle('is-active', b === btn)
        b.setAttribute('aria-pressed', String(b === btn))
      })
      viewer?.setBed(btn.dataset.bed === 'on')
    })
  })

  cloudButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      cloudButtons.forEach((b) => {
        b.classList.toggle('is-active', b === btn)
        b.setAttribute('aria-pressed', String(b === btn))
      })
      viewer?.setCloud(btn.dataset.cloud === 'on')
    })
  })

  viewButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.view
      if (name === 'reset') {
        viewer?.reset()
      } else {
        viewer?.setView(name)
      }
      viewButtons.forEach((b) => b.classList.toggle('is-active', b === btn && name !== 'reset'))
    })
  })

  const hit = document.getElementById('stage-hit')
  hit?.addEventListener('pointerdown', () => hit.classList.add('is-grabbing'))
  window.addEventListener('pointerup', () => hit?.classList.remove('is-grabbing'))
}

async function boot() {
  setBuildInfo()
  setupControls()
  setupScroll()
  setupNav()

  if (!canvas) {
    fail('没有找到画布')
    return
  }

  try {
    viewer = createViewer(canvas)
  } catch (err) {
    console.error(err)
    fail('浏览器没有可用的 WebGL')
    return
  }

  setProgress(2, 'STUDY 01 / CONNECTING')

  try {
    await viewer.load((ev) => {
      const total = ev.total || 3_800_000
      const pct = clamp((ev.loaded / total) * 100, 0, 99)
      setProgress(pct, `STUDY 01 / ${(ev.loaded / 1_000_000).toFixed(1)} MB`)
    })
  } catch (err) {
    console.error(err)
    fail('模型没有加载成功')
    return
  }

  setProgress(100, 'STUDY 01 / READY')
  await new Promise((r) => setTimeout(r, 380))
  loader.classList.add('is-done')
  document.body.classList.add('is-loaded')
  setupReveals()
  // Run the scroll state once more now that the scene exists.
  window.dispatchEvent(new Event('scroll'))
}

boot()
