// Measures text and UI-component contrast from computed styles (WCAG 2.x formula),
// on every route, in empty and populated states, at rest and on hover.
//
//   npx vite                                   # :5173, signed-out routes
//   VITE_DEV_BYPASS=true npx vite --port 5180  # signed-in routes (second terminal)
//   node qa/tools/contrast-audit.mjs                 # light theme
//   node qa/tools/contrast-audit.mjs --theme dark
//   node qa/tools/contrast-audit.mjs --no-hover      # skip the hover pass (much faster)
//
// Options: --public <url> (default http://localhost:5173), --bypass <url> (default
// http://localhost:5180), --out <dir> (default .qa-artifacts/contrast, gitignored).
//
// Three passes, Chromium via Playwright, desktop 1280x900 and mobile 390x844:
//   1. every route in App.tsx as it renders with no data (signed-in routes under the
//      dev bypass, where the real API answers 401);
//   2. History, Tracker, Interview History, Results, Interview Results and the
//      interview setup, populated from the repo's own demo fixtures (demoAnalyses,
//      SAMPLE_INTERVIEW_SESSION, SAMPLE_DATA) served as mocked API responses. Every
//      request that is not the dev server is answered or aborted, so nothing leaves
//      the machine;
//   3. desktop only: each visible button and link on the populated pages is hovered
//      and its subtree measured again.
//
// Colour handling: translucent backgrounds are composited up the ancestor chain onto
// the first opaque one; the ancestor opacity chain is applied to the text colour; a
// CSS filter: brightness(k) scales both text and background, as it does on screen.
// Large text is >=24px, or >=18.66px at weight >=700. Thresholds: 4.5 text, 3 large
// text, 3 for form-field borders and explicitly coloured SVG shapes.
//
// Limits, stated so a clean run is not over-read: backgrounds come from the DOM
// ancestor chain, so text over an absolutely positioned sibling or an image is not
// resolved (gradients are flagged, not measured); focus states are not exercised;
// /dashboard (owner-only) and a live interview are not reached.
//
// Output: one JSON with every measured row, and a table of failures on stdout. The
// failure table does not decide exemptions: disabled controls, aria-hidden art and
// single punctuation characters are marked, and judging them is left to the reader.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}
const THEME = option('--theme', 'light')
const PUBLIC = option('--public', 'http://localhost:5173')
const BYPASS = option('--bypass', 'http://localhost:5180')
const OUT = path.resolve(repositoryRoot, option('--out', '.qa-artifacts/contrast'))
const HOVER = !args.includes('--no-hover')
if (!['light', 'dark'].includes(THEME)) throw new Error(`--theme must be light or dark, got ${THEME}`)

const EMPTY_ROUTES = [
  [PUBLIC, '/'], [PUBLIC, '/login'], [PUBLIC, '/signup'], [PUBLIC, '/forgot-password'],
  [PUBLIC, '/privacy'], [PUBLIC, '/terms'], [PUBLIC, '/support'], [PUBLIC, '/sample'],
  [BYPASS, '/upload'], [BYPASS, '/history'], [BYPASS, '/dashboard'], [BYPASS, '/tracker'],
  [BYPASS, '/interview'], [BYPASS, '/interview/history'],
  [BYPASS, '/results/does-not-exist'], [BYPASS, '/interview/results/does-not-exist'],
]
const VIEWPORTS = [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }]

// Runs in the page. Measures every element under `rootSelector` (default: body).
function scan(rootSelector) {
  const parse = s => {
    const m = s && s.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  const over = (top, bottom) => {
    const a = top.a + bottom.a * (1 - top.a)
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }
    const c = k => (top[k] * top.a + bottom[k] * bottom.a * (1 - top.a)) / a
    return { r: c('r'), g: c('g'), b: c('b'), a }
  }
  const scale = (c, k) => ({ r: Math.min(255, c.r * k), g: Math.min(255, c.g * k), b: Math.min(255, c.b * k), a: c.a })
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const lum = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
  const show = c => hex(c) + (c.a < 1 ? `@${+c.a.toFixed(3)}` : '')

  // Token lookup: every custom property declared for the active theme, resolved.
  const theme = document.documentElement.getAttribute('data-theme')
  const names = new Set()
  const walk = rules => {
    for (const r of rules) {
      if (r.cssRules) walk(r.cssRules)
      if (r.selectorText && (r.selectorText === ':root' || r.selectorText.includes(`[data-theme="${theme}"]`)) && r.style) {
        for (const p of r.style) if (p.startsWith('--')) names.add(p)
      }
    }
  }
  for (const s of document.styleSheets) { try { walk(s.cssRules) } catch { /* cross-origin sheet */ } }
  const probe = document.createElement('div')
  document.body.appendChild(probe)
  const tokens = {}
  for (const n of names) {
    probe.style.color = ''
    probe.style.color = `var(${n})`
    const c = parse(getComputedStyle(probe).color)
    if (c && getComputedStyle(document.documentElement).getPropertyValue(n).trim()) tokens[n] = c
  }
  probe.remove()
  const tokenFor = c => Object.entries(tokens)
    .filter(([, t]) => Math.abs(t.r - c.r) < 1 && Math.abs(t.g - c.g) < 1 && Math.abs(t.b - c.b) < 1 && Math.abs(t.a - c.a) < 0.01)
    .map(([n]) => n)

  const brightness = el => {
    let k = 1
    for (let e = el; e; e = e.parentElement) {
      const m = getComputedStyle(e).filter.match(/brightness\(([\d.]+)\)/)
      if (m) k *= Number(m[1])
    }
    return k
  }
  const effectiveBg = el => {
    const layers = []
    const flags = []
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e)
      if (cs.backgroundImage.includes('gradient')) flags.push('gradient-bg')
      const bg = parse(cs.backgroundColor)
      if (bg && bg.a > 0) { layers.push(bg); if (bg.a >= 1) break }
    }
    let c = { r: 255, g: 255, b: 255, a: 1 }
    for (let i = layers.length - 1; i >= 0; i--) c = over(layers[i], c)
    return { c, raw: layers[0] || null, flags }
  }
  const opacityChain = el => { let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o }
  const label = el => {
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : ''
    return el.tagName.toLowerCase() + cls
  }
  const marks = el => [
    el.closest(':disabled, [aria-disabled="true"]') ? 'disabled' : null,
    el.closest('[aria-hidden="true"]') ? 'aria-hidden' : null,
  ].filter(Boolean)

  const root = document.querySelector(rootSelector || 'body')
  const rows = []
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility !== 'visible') continue
    const rect = el.getBoundingClientRect()
    if (rect.width <= 1 || rect.height <= 1) continue
    const ownText = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim()
    const isField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
    const k = brightness(el)
    const bg = effectiveBg(el)
    const bgShown = scale(bg.c, k)
    const opacity = opacityChain(el)
    const common = { el: label(el), bgTokens: bg.raw ? tokenFor(bg.raw) : [], opacity: +opacity.toFixed(3), brightness: k, marks: marks(el) }
    if (ownText || (isField && (el.value || el.placeholder))) {
      const fill = cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color ? cs.webkitTextFillColor : cs.color
      const fg0 = parse(fill)
      if (fg0) {
        const fg = scale(over({ ...fg0, a: fg0.a * opacity }, bg.c), k)
        const size = parseFloat(cs.fontSize)
        const weight = Number(cs.fontWeight)
        const large = size >= 24 || (size >= 18.66 && weight >= 700)
        const text = ownText || el.value || el.placeholder || ''
        rows.push({
          kind: 'text', ...common, text: text.slice(0, 60), fg: show(fg0), fgTokens: tokenFor(fg0), bg: hex(bgShown),
          size, weight, large, ratio: +ratio(fg, bgShown).toFixed(2), need: large ? 3 : 4.5,
          flags: [
            ...bg.flags,
            ...(cs.backgroundClip === 'text' ? ['bg-clip-text'] : []),
            ...(isField && !el.value ? ['placeholder'] : []),
            ...(/^[^\p{L}\p{N}]$/u.test(text) ? ['single-punctuation'] : []),
          ],
        })
      }
    }
    if (isField || ['checkbox', 'switch'].includes(el.getAttribute('role'))) {
      const bc = parse(cs.borderTopColor)
      if (bc && parseFloat(cs.borderTopWidth) > 0 && el.type !== 'hidden') {
        const outer = el.parentElement ? effectiveBg(el.parentElement).c : { r: 255, g: 255, b: 255, a: 1 }
        rows.push({
          kind: 'field-border', ...common, text: el.type || el.tagName.toLowerCase(), fg: show(bc), fgTokens: tokenFor(bc),
          bg: hex(outer), ratio: +ratio(over(bc, outer), outer).toFixed(2), need: 3, flags: [],
        })
      }
    }
    if (el instanceof SVGGeometryElement) {
      for (const prop of ['stroke', 'fill']) {
        const c = parse(cs[prop])
        if (!c || c.a === 0) continue
        const b = effectiveBg(el.ownerSVGElement || el)
        const shown = scale(b.c, k)
        rows.push({
          kind: 'svg-' + prop, ...common, el: label(el.ownerSVGElement || el) + ' ' + el.tagName.toLowerCase(),
          text: String(el.closest('[class]')?.className?.baseVal ?? el.closest('[class]')?.className ?? '').slice(0, 60),
          fg: show(c), fgTokens: tokenFor(c), bg: hex(shown), bgTokens: b.raw ? tokenFor(b.raw) : [],
          ratio: +ratio(scale(over({ ...c, a: c.a * opacity }, b.c), k), shown).toFixed(2), need: 3, flags: b.flags,
        })
      }
    }
  }
  return {
    theme, url: location.pathname,
    tokens: Object.fromEntries(Object.entries(tokens).map(([n, c]) => [n, show(c)])),
    rows,
  }
}

async function settle(page) {
  await page.waitForTimeout(800)
  // Scroll through to fire reveal-on-scroll, then wait for every finite animation.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y)
      await new Promise(resolve => setTimeout(resolve, 60))
    }
    window.scrollTo(0, 0)
  })
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations()
      .filter(a => a.effect?.getTiming().iterations !== Infinity)
      .map(a => a.finished.catch(() => {}))),
    new Promise(resolve => setTimeout(resolve, 5000)),
  ]))
  await page.waitForTimeout(1200)
}

async function loadFixtures(page) {
  await page.goto(BYPASS + '/login', { waitUntil: 'networkidle' })
  return page.evaluate(async () => {
    const [demo, session, tracker] = await Promise.all([
      import('/src/types/demoAnalyses.ts'),
      import('/src/types/sampleInterviewSession.ts'),
      import('/src/types/tracker.ts'),
    ])
    const plain = v => JSON.parse(JSON.stringify(v))
    return {
      analyses: plain(Object.values(demo).find(Array.isArray)),
      session: plain(session.SAMPLE_INTERVIEW_SESSION),
      apps: plain(tracker.SAMPLE_DATA),
    }
  })
}

async function mockApi(page, fx) {
  const now = new Date().toISOString()
  const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  const past = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)
  const base = fx.analyses[0]
  // One History card per score band and one per non-scored status.
  const history = [
    ...fx.analyses,
    ...[92, 78, 64, 48, 22].map((matchScore, i) => ({ ...base, analysisId: `band-${i}`, matchScore })),
    ...['processing', 'pending', 'failed', 'completed'].map(status => ({
      ...base, analysisId: `status-${status}`, status, matchScore: undefined, timestamp: now, createdAt: now,
    })),
  ]
  const sessions = [85, 70, 45, 20].map((matchScore, i) => ({
    sessionId: `session-${i}`, interviewType: 'behavioral', companyName: 'Example Co', roleName: 'Engineer',
    jobTitle: 'Engineer', analysisId: base.analysisId, fileName: base.fileName, matchScore,
    status: i === 3 ? 'active' : 'completed', questionCount: 6, totalDuration: 900,
    createdAt: '2026-09-01T10:00:00Z', completedAt: '2026-09-01T10:20:00Z',
  }))
  // Two extra tracker rows whose primary action is Follow Up (warning, then danger).
  const apps = [
    ...fx.apps,
    { ...fx.apps[0], id: 'follow-up-due', outreachStatus: 'sent', followUpDate: soon, followUpSent: false },
    { ...fx.apps[0], id: 'follow-up-overdue', outreachStatus: 'sent', followUpDate: past, followUpSent: false },
  ]
  const json = body => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route(url => url.origin !== BYPASS && !url.hostname.startsWith('fonts.'), route => {
    const p = new URL(route.request().url()).pathname
    if (route.request().method() !== 'GET') return route.abort()
    if (/\/history\//.test(p)) return route.fulfill(json(history))
    if (/\/analysis\//.test(p)) return route.fulfill(json(base))
    if (/\/user\/last-resume$/.test(p)) return route.fulfill(json({ lastResume: null }))
    if (/\/interview\/sessions$/.test(p)) return route.fulfill(json({ sessions }))
    if (/\/interview\/sessions\//.test(p)) return route.fulfill(json({ ...fx.session, sessionId: p.split('/').pop() }))
    if (/\/applications$/.test(p)) {
      return route.fulfill(json({ applications: apps.map(({ id, ...a }) => ({ ...a, applicationId: id })), count: apps.length }))
    }
    return route.abort()
  })
  return base.analysisId
}

async function hoverPass(page, record) {
  const count = await page.evaluate(() => {
    const targets = [...document.querySelectorAll('button, a, [role="button"]')].filter(el => {
      const r = el.getBoundingClientRect()
      return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility === 'visible'
    })
    targets.forEach((el, i) => el.setAttribute('data-contrast-hover', String(i)))
    return targets.length
  })
  for (let i = 0; i < count; i++) {
    const target = page.locator(`[data-contrast-hover="${i}"]`)
    try {
      await target.scrollIntoViewIfNeeded({ timeout: 1000 })
      await target.hover({ timeout: 1000, force: true })
    } catch {
      continue
    }
    await page.waitForTimeout(300)
    const res = await page.evaluate(scan, `[data-contrast-hover="${i}"]`)
    record(res, 'hover')
  }
  await page.mouse.move(0, 0)
}

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
const results = []
const record = (viewport, pass) => (res, state = 'rest') => {
  if (res.theme !== THEME) throw new Error(`${res.url} rendered in ${res.theme}, expected ${THEME}`)
  results.push({ viewport, pass, state, ...res })
}
try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: vp, colorScheme: THEME, permissions: ['microphone'] })
    await context.addInitScript(theme => { try { localStorage.setItem('theme', theme) } catch { /* private mode */ } }, THEME)

    const empty = await context.newPage()
    for (const [origin, route] of EMPTY_ROUTES) {
      await empty.goto(origin + route, { waitUntil: 'networkidle' }).catch(() => {})
      await settle(empty)
      record(vp.name, 'empty')(await empty.evaluate(scan))
      console.log(`${vp.name} empty ${route} -> ${new URL(empty.url()).pathname}`)
    }
    await empty.close()

    const page = await context.newPage()
    const fx = await loadFixtures(page)
    const analysisId = await mockApi(page, fx)
    const populated = ['/history', '/tracker', '/interview/history', `/results/${analysisId}`, '/interview/results/session-0']
    for (const route of populated) {
      await page.goto(BYPASS + route, { waitUntil: 'networkidle' }).catch(() => {})
      await settle(page)
      const log = record(vp.name, 'populated')
      log(await page.evaluate(scan))
      if (HOVER && vp.name === 'desktop') await hoverPass(page, log)
      console.log(`${vp.name} populated ${route} -> ${new URL(page.url()).pathname}`)
    }
    // Interview setup, reached the way a user reaches it: from an analysis.
    await page.goto(`${BYPASS}/results/${analysisId}`, { waitUntil: 'networkidle' })
    const start = page.getByRole('button', { name: /interview/i }).first()
    if (await start.count()) {
      await start.click().catch(() => {})
      await page.waitForTimeout(2500)
      await settle(page)
      record(vp.name, 'populated')(await page.evaluate(scan))
      console.log(`${vp.name} populated interview setup -> ${new URL(page.url()).pathname}`)
    }
    await context.close()
  }
} finally {
  await browser.close()
}

mkdirSync(OUT, { recursive: true })
const file = path.join(OUT, `contrast-${THEME}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
writeFileSync(file, JSON.stringify(results, null, 1))

const failures = new Map()
for (const page of results) {
  for (const row of page.rows) {
    if (row.ratio >= row.need) continue
    const key = [row.kind, page.state, row.el, row.fg, row.bg].join('|')
    const entry = failures.get(key) ?? { ...row, state: page.state, where: new Set() }
    entry.where.add(`${page.viewport[0]}:${page.url}`)
    failures.set(key, entry)
  }
}
const sorted = [...failures.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.ratio - b.ratio)
console.log(`\n${THEME}: ${results.reduce((n, p) => n + p.rows.length, 0)} rows, ${sorted.length} distinct failures`)
for (const f of sorted) {
  const notes = [...f.marks, ...f.flags, f.opacity < 1 ? `opacity ${f.opacity}` : null, f.brightness !== 1 ? `brightness ${f.brightness}` : null].filter(Boolean)
  console.log([
    f.kind, f.state, `${f.ratio}/${f.need}`, `${f.fg} ${f.fgTokens.slice(0, 2).join(',')}`.trim(), `on ${f.bg} ${f.bgTokens.slice(0, 2).join(',')}`.trim(),
    f.size ? `${f.size}px/${f.weight}` : '', f.el.slice(0, 70), JSON.stringify(f.text), notes.join(' '), [...f.where].join(' '),
  ].join(' | '))
}
console.log(`\nFull results: ${path.relative(repositoryRoot, file)}`)
