import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { expect, test, type BrowserContext, type Page } from '@playwright/test'

import { completedAnalysis, SYNTHETIC_FILE_NAME } from '../../qa/fixtures/data'

const PDF_URL = 'https://s3.qa.invalid/resume-preview.pdf'

async function installResumeRoutes(
  context: BrowserContext,
  analysisId: string,
  startInProgress: boolean,
): Promise<void> {
  let analysisRequests = 0
  const completed = completedAnalysis(analysisId, SYNTHETIC_FILE_NAME)
  const pdf = await readFile(path.join(process.cwd(), 'qa', 'fixtures', SYNTHETIC_FILE_NAME))

  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({
    status: 200,
    contentType: 'text/css; charset=utf-8',
    body: '',
  }))
  await context.route('https://api.qa.invalid/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname === `/analysis/${analysisId}`) {
      analysisRequests += 1
      const analysis = startInProgress && analysisRequests === 1
        ? {
            analysisId,
            status: 'processing',
            createdAt: '2026-01-15T12:00:00Z',
            fileName: SYNTHETIC_FILE_NAME,
          }
        : completed
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analysis) })
    }
    if (url.pathname === `/resume/${analysisId}`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: PDF_URL }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await context.route(PDF_URL, route => route.fulfill({
    status: 200,
    contentType: 'application/pdf',
    body: pdf,
  }))
}

async function makePageScrollableAndOpenResume(page: Page): Promise<void> {
  await page.evaluate(() => {
    const resultsPage = document.querySelector('.results-reading-page')
    const viewResume = [...document.querySelectorAll('button')]
      .find(button => button.textContent?.includes('View Resume'))
    if (!(resultsPage instanceof HTMLElement) || !(viewResume instanceof HTMLButtonElement)) {
      throw new Error('Results page or View Resume button is missing')
    }

    const spacer = document.createElement('div')
    spacer.dataset.qaResumeModalSpacer = 'true'
    spacer.style.height = '1600px'
    resultsPage.append(spacer)
    window.scrollTo(0, 600)
    viewResume.click()
  })
  await expect(page.getByRole('dialog', { name: 'Resume viewer' })).toBeVisible()
  await page.locator('.modal-content').evaluate(element => Promise.all(
    element.getAnimations().map(animation => animation.finished),
  ))
}

async function expectViewportPortal(page: Page): Promise<void> {
  const layout = await page.evaluate(() => {
    const overlay = document.querySelector('.modal-overlay')
    const dialog = document.querySelector('[role="dialog"][aria-label="Resume viewer"]')
    const resultsPage = document.querySelector('.results-reading-page')
    if (!(overlay instanceof HTMLElement) || !(dialog instanceof HTMLElement)) {
      throw new Error('Resume modal is missing')
    }
    const overlayRect = overlay.getBoundingClientRect()
    const dialogRect = dialog.getBoundingClientRect()
    return {
      overlayParent: overlay.parentElement?.tagName,
      resultsPageContainsOverlay: resultsPage?.contains(overlay) ?? false,
      bodyOverflow: document.body.style.overflow,
      scrollY: window.scrollY,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      overlay: {
        left: overlayRect.left,
        top: overlayRect.top,
        right: overlayRect.right,
        bottom: overlayRect.bottom,
      },
      dialogCenter: {
        x: dialogRect.left + dialogRect.width / 2,
        y: dialogRect.top + dialogRect.height / 2,
      },
    }
  })

  expect(layout.overlayParent).toBe('BODY')
  expect(layout.resultsPageContainsOverlay).toBe(false)
  expect(layout.bodyOverflow).toBe('hidden')
  expect(layout.scrollY).toBeGreaterThan(0)
  expect(layout.overlay.left).toBeCloseTo(0, 5)
  expect(layout.overlay.top).toBeCloseTo(0, 5)
  expect(layout.overlay.right).toBeCloseTo(layout.viewport.width, 5)
  expect(layout.overlay.bottom).toBeCloseTo(layout.viewport.height, 5)
  expect(layout.dialogCenter.x).toBeCloseTo(layout.viewport.width / 2, 5)
  expect(layout.dialogCenter.y).toBeCloseTo(layout.viewport.height / 2, 5)
}

async function openResume(page: Page): Promise<void> {
  await page.evaluate(() => {
    const viewResume = [...document.querySelectorAll('button')]
      .find(button => button.textContent?.includes('View Resume'))
    if (!(viewResume instanceof HTMLButtonElement)) throw new Error('View Resume button is missing')
    viewResume.click()
  })
  await expect(page.getByRole('dialog', { name: 'Resume viewer' })).toBeVisible()
  await page.locator('.modal-content').evaluate(element => Promise.all(
    element.getAnimations().map(animation => animation.finished),
  ))
}

test('freshly completed analysis portals the resume modal to the viewport and preserves controls', async ({ context, page }) => {
  const analysisId = 'portal-fresh'
  await installResumeRoutes(context, analysisId, true)
  await page.clock.install({ time: new Date('2026-01-15T12:00:00Z') })
  await page.goto(`/results/${analysisId}`)
  await expect(page.getByRole('status')).toBeVisible()
  await page.clock.runFor(3_100)
  await expect(page.getByRole('heading', { name: 'Analysis complete' })).toBeVisible()
  await page.clock.runFor(1_500)
  await expect(page.getByRole('heading', { name: 'QA Synthetic Software Engineer' })).toBeVisible()
  await expect(page.locator('.results-reading-page')).toHaveClass(/results-reading-page--reveal/)

  await makePageScrollableAndOpenResume(page)
  await expectViewportPortal(page)
  await expect(page.locator('iframe[title="Resume PDF"]')).toHaveAttribute('src', PDF_URL)
  await expect(page.getByTitle('Open in new tab')).toHaveAttribute('href', PDF_URL)
  await expect(page.getByTitle('Open in new tab')).toHaveAttribute('target', '_blank')

  const downloadPromise = page.waitForEvent('download')
  await page.getByTitle('Download PDF').click()
  expect((await downloadPromise).suggestedFilename()).toBe(SYNTHETIC_FILE_NAME)

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Resume viewer' })).toHaveCount(0)
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('')

  await openResume(page)
  await page.locator('.modal-overlay').click({ position: { x: 4, y: 4 } })
  await expect(page.getByRole('dialog', { name: 'Resume viewer' })).toHaveCount(0)
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('')

  await openResume(page)
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog', { name: 'Resume viewer' })).toHaveCount(0)
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
})

test('history or refresh-style completed load uses the same viewport portal', async ({ context, page }) => {
  const analysisId = 'portal-completed'
  await installResumeRoutes(context, analysisId, false)
  await page.goto(`/results/${analysisId}`)
  await expect(page.getByRole('heading', { name: 'QA Synthetic Software Engineer' })).toBeVisible()
  await expect(page.locator('.results-reading-page')).not.toHaveClass(/results-reading-page--reveal/)

  await makePageScrollableAndOpenResume(page)
  await expectViewportPortal(page)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Resume viewer' })).toHaveCount(0)
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
})
