import { expect, test, type Page } from '@playwright/test'

/**
 * Responsive + theme coverage for the three public, backend-free pages.
 * These render without a session, so the only external request to neutralise is
 * the Google Fonts stylesheet.
 */

const PATHS = ['/support', '/privacy', '/terms'] as const
const THEMES = ['light', 'dark'] as const
const WIDTHS = [320, 390, 768, 1280, 1920] as const

/** Matches the `max-width: 767px` chip-row breakpoint in LegalLayout.css. */
const CHIP_ROW_MAX_WIDTH = 767
/** Matches `.legal-nav__inner { height: 64px }`. */
const NAV_HEIGHT = 64

async function openPage(page: Page, path: string, theme: string, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 800 })
  await page.addInitScript(value => {
    window.localStorage.setItem('theme', value)
  }, theme)
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({
    status: 200,
    contentType: 'text/css; charset=utf-8',
    body: '',
  }))
  await page.goto(path)
  await expect(page.locator('h1')).toBeVisible()
}

for (const path of PATHS) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`${path} renders at ${width}px in ${theme} theme`, async ({ page }) => {
        await openPage(page, path, theme, width)

        // The resolved theme reaches the DOM before paint via index.html.
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

        // No page may scroll sideways at any width.
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }))
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)

        // Exactly one TOC entry is marked current, and it is a real link.
        const current = page.locator('.legal-toc nav a[aria-current="true"]')
        await expect(current).toHaveCount(1)

        // The dark CTA panel and its decoration render on every page.
        await expect(page.locator('.legal-cta__card')).toBeVisible()
        await expect(page.locator('.legal-cta__glow')).toHaveCount(1)
        await expect(page.locator('.legal-cta__hairline')).toHaveCount(1)
      })
    }
  }
}

for (const path of PATHS) {
  for (const width of WIDTHS) {
    test(`${path} keeps the section nav on screen while scrolling at ${width}px`, async ({ page }) => {
      await openPage(page, path, 'light', width)

      const toc = page.locator('.legal-toc')
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2))
      // Let the scrollspy's rAF settle before measuring.
      await page.waitForTimeout(250)

      await expect(toc).toBeVisible()
      const box = await toc.boundingBox()
      expect(box).not.toBeNull()

      if (width <= CHIP_ROW_MAX_WIDTH) {
        // Chip row: pinned directly under the nav, opaque, full-bleed.
        expect(Math.round(box!.y)).toBe(NAV_HEIGHT)
        expect(Math.round(box!.width)).toBe(width)
        const styles = await toc.evaluate(element => {
          const computed = getComputedStyle(element)
          return {
            position: computed.position,
            flexDirection: getComputedStyle(element.querySelector('nav')!).flexDirection,
            background: computed.backgroundColor,
          }
        })
        expect(styles.position).toBe('sticky')
        expect(styles.flexDirection).toBe('row')
        // Opaque: an rgba() with alpha < 1 would let content show through.
        expect(styles.background).not.toContain('rgba')
      } else {
        // Desktop keeps the vertical sidebar within the content gutters.
        expect(box!.y).toBeGreaterThanOrEqual(0)
        const flexDirection = await toc.locator('nav').evaluate(
          element => getComputedStyle(element).flexDirection,
        )
        expect(flexDirection).toBe('column')
      }
    })
  }
}
