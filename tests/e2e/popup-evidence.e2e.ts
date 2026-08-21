import { mkdir } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

import { EvidenceCollector } from '../../qa/browser/evidence'

test('new pages receive console and page-error evidence listeners', async ({ context, page }, testInfo) => {
  const runDirectory = testInfo.outputPath('popup-evidence')
  await mkdir(runDirectory, { recursive: true })
  const evidence = new EvidenceCollector('p1-01-00000000-0000-4000-8000-000000000001', 'P1-01', runDirectory)
  await evidence.initialize()
  evidence.attachToContext(context)
  const popupPromise = context.waitForEvent('page')
  await page.evaluate(() => window.open('about:blank'))
  const popup = await popupPromise
  await popup.evaluate(() => {
    console.log('qa-synthetic-popup-console')
    setTimeout(() => { throw new Error('qa-synthetic-popup-error') }, 0)
  })
  await expect.poll(() => evidence.pageErrors).toContain('qa-synthetic-popup-error')
  expect(evidence.consoleEvents).toContainEqual({ type: 'log', text: 'qa-synthetic-popup-console' })
})
