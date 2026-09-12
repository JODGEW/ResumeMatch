import { expect, test, type Page } from '@playwright/test'

/**
 * Landing v2 coverage: responsive + theme, the fixed pricing copy, and the
 * /support links in the nav and footer.
 */

const THEMES = ['light', 'dark'] as const
const WIDTHS = [320, 390, 768, 1280, 1920] as const

/** Matches the `max-width: 880px` collapse in Landing.css. */
const NAV_COLLAPSE_MAX_WIDTH = 880

const PRICING_STRINGS = [
  'Beta',
  'Free while we\'re in beta.',
  'The whole workflow is included during beta, with daily limits. Pricing isn\'t set yet. If that changes, we\'ll say so before it does.',
  'No credit card. Delete your account and data any time by email.',
  'Beta access',
  '$0',
  '10 resume analyses per day',
  '5 mock interview sessions per day',
  'Limits reset daily at 00:00 UTC',
  'Match score and keyword gaps',
  'Rewritten resume (.docx) when safe edits are found',
  'Interview reports and transcripts',
  'Application tracker and saved history',
  'Start free',
]

/**
 * The QA launcher builds with VITE_DEV_BYPASS=true, which seeds a dev user, so
 * RootGate redirects `/` to `/upload`. Sign out first — under dev bypass that
 * is a purely local state reset with no network call — then navigate back to
 * `/` through the History API. A full reload would re-seed the dev user.
 */
async function openSignedOut(page: Page, path: string, theme: string, width: number): Promise<void> {
  await page.addInitScript(value => {
    window.localStorage.setItem('theme', value)
  }, theme)
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({
    status: 200,
    contentType: 'text/css; charset=utf-8',
    body: '',
  }))

  // Sign out at a desktop width, where the control is not behind the hamburger.
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  const signOut = page.getByRole('button', { name: 'Sign out' })
  if (await signOut.count()) {
    await signOut.first().click()
  }

  await page.setViewportSize({ width, height: 800 })
  await page.evaluate(target => {
    window.history.pushState({}, '', target)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

async function openLanding(page: Page, theme: string, width: number): Promise<void> {
  await openSignedOut(page, '/', theme, width)
  await expect(page.locator('.landing-page')).toBeVisible()
}

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test(`/ renders at ${width}px in ${theme} theme`, async ({ page }) => {
      await openLanding(page, theme, width)

      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)

      // The merged product preview replaces the old hero cards + sample panel.
      await expect(page.locator('.landing-preview')).toHaveCount(1)
      await expect(page.locator('.landing-preview__url')).toContainText(
        'resumematchapp.com/results/a3f91c',
      )
    })
  }
}

test('pricing block uses the approved copy and offers no paid tier', async ({ page }) => {
  await openLanding(page, 'light', 1280)

  const pricing = page.locator('#pricing')
  for (const copy of PRICING_STRINGS) {
    await expect(pricing.getByText(copy, { exact: true }).first()).toBeVisible()
  }

  // No upgrade path exists in the frontend, so nothing may imply one.
  await expect(page.getByText(/coming soon/i)).toHaveCount(0)
  await expect(page.getByText(/\bPro\b/)).toHaveCount(0)
  await expect(page.locator('.landing-plan')).toHaveCount(1)
})

test('page makes no claim about how long an analysis takes', async ({ page }) => {
  await openLanding(page, 'light', 1280)
  const body = await page.locator('body').innerText()
  expect(body).not.toMatch(/couple of minutes|30 seconds|in seconds|minutes/i)
})

test('FAQ states the daily limits and the UTC reset', async ({ page }) => {
  await openLanding(page, 'light', 1280)
  await expect(
    page.locator('#faq').getByText(
      'During beta, 10 resume analyses and 5 mock interview sessions per day, per account. Limits reset at 00:00 UTC.',
      { exact: true },
    ),
  ).toBeVisible()
})

test('signed-out primary CTAs open signup, and Sign in stays on /login', async ({ page }) => {
  await openLanding(page, 'light', 1280)

  // A visitor with no account must not be sent to a sign-in form by any primary
  // action: the three "Analyze my resume" buttons, the footer link, or "Start free".
  const primaryCtas = page.getByRole('link', { name: 'Analyze my resume' })
  await expect(primaryCtas).toHaveCount(4) // nav + hero + closing CTA + footer
  for (const cta of await primaryCtas.all()) {
    await expect(cta).toHaveAttribute('href', '/signup')
  }

  await expect(page.getByRole('link', { name: 'Start free' })).toHaveAttribute('href', '/signup')

  // The one deliberate exception.
  await expect(page.locator('.landing-nav__signin')).toHaveAttribute('href', '/login')
})

for (const path of ['/privacy', '/terms', '/support'] as const) {
  test(`legal closing CTA opens signup when signed out on ${path}`, async ({ page }) => {
    await openSignedOut(page, path, 'light', 1280)

    const cta = page.locator('.legal-cta').getByRole('link', { name: 'Analyze my resume' })
    await expect(cta).toHaveCount(1)
    await expect(cta).toHaveAttribute('href', '/signup')

    // The nav button is this page's "Sign in" equivalent and stays on /login.
    await expect(page.locator('.legal-nav .legal-btn--ghost')).toHaveAttribute('href', '/login')

    // Sentence case everywhere: no title-case variant survives.
    await expect(page.getByText('Analyze My Resume', { exact: true })).toHaveCount(0)
  })
}

for (const path of ['/', '/privacy', '/terms', '/support'] as const) {
  test(`footer "Analyze my resume" opens signup when signed out on ${path}`, async ({ page }) => {
    await openSignedOut(page, path, 'light', 1280)

    const footerCta = page.locator('.landing-footer').getByRole('link', { name: 'Analyze my resume' })
    await expect(footerCta).toHaveCount(1)
    await expect(footerCta).toHaveAttribute('href', '/signup')

    // Every other footer link is unchanged.
    await expect(page.locator('.landing-footer a[href="/support"]')).toHaveCount(1)
    await expect(page.locator('.landing-footer a[href="/privacy"]')).toHaveCount(1)
    await expect(page.locator('.landing-footer a[href="/terms"]')).toHaveCount(1)
  })
}

test('closing CTA uses the approved body copy', async ({ page }) => {
  await openLanding(page, 'light', 1280)
  await expect(
    page.locator('.landing-cta').getByText(
      'Upload once, paste the job description, and see where you stand before you apply.',
      { exact: true },
    ),
  ).toBeVisible()
})

for (const width of WIDTHS) {
  test(`nav and footer both link to /support at ${width}px`, async ({ page }) => {
    await openLanding(page, 'light', width)

    await expect(page.locator('.landing-footer a[href="/support"]')).toHaveCount(1)

    if (width > NAV_COLLAPSE_MAX_WIDTH) {
      await expect(page.locator('.landing-nav__links a[href="/support"]')).toHaveCount(1)
    } else {
      // Collapsed: the section links live behind the hamburger.
      await page.locator('.landing-nav__menu-btn').click()
      await expect(page.locator('.landing-nav__mobile a[href="/support"]')).toHaveCount(1)
    }
  })
}
