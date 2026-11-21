import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test'

import { buildSampleData, type Application } from '../../src/types/tracker'

type ApiApplication = Omit<Application, 'id'> & { applicationId: string }
type Write = { method: string; path: string; body: unknown }

const STAGE_LABELS: Record<Application['applicationStatus'], string> = {
  not_applied: 'Not Applied',
  applied: 'Applied',
  screening: 'Screening',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
}

// Synthetic records from src/types/tracker.ts (the demo account's sample data).
const FIXTURE = buildSampleData()

function toApi({ id, ...rest }: Application): ApiApplication {
  return { ...rest, applicationId: id }
}

function byStatus(status: Application['applicationStatus']): number {
  return FIXTURE.filter(app => app.applicationStatus === status).length
}

async function installTrackerRoutes(context: BrowserContext): Promise<Write[]> {
  const writes: Write[] = []
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({
    status: 200,
    contentType: 'text/css; charset=utf-8',
    body: '',
  }))
  await context.route('https://api.qa.invalid/**', route => {
    const request = route.request()
    const method = request.method()
    const url = new URL(request.url())
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

    if (url.pathname === '/applications' && method === 'GET') {
      return json({ applications: FIXTURE.map(toApi), count: FIXTURE.length })
    }
    if (url.pathname.startsWith('/applications') && ['PUT', 'POST', 'DELETE'].includes(method)) {
      const body = request.postData() ? request.postDataJSON() : null
      writes.push({ method, path: url.pathname, body })
      if (method === 'POST') return json({ applicationId: 'qa-created-1', message: 'Application created' })
      if (method === 'DELETE') return json({ message: 'Application deleted' })
      const id = url.pathname.split('/').pop()
      const existing = FIXTURE.find(app => app.id === id)
      return json({
        message: 'Application updated',
        application: { ...(existing ? toApi(existing) : { applicationId: id }), ...(body as object) },
      })
    }
    return json([])
  })
  return writes
}

async function openTracker(context: BrowserContext, page: Page): Promise<Write[]> {
  const writes = await installTrackerRoutes(context)
  await page.goto('/tracker')
  await expect(page.getByRole('heading', { name: 'Outreach Tracker' })).toBeVisible()
  await expect(page.getByText(FIXTURE[0].companyName, { exact: true })).toBeVisible()
  return writes
}

/** The list row (role=button, aria-expanded) that carries this company name. */
function row(page: Page, companyName: string): Locator {
  return page.getByRole('button').filter({ has: page.getByText(companyName, { exact: true }) })
}

test('list renders every fixture row with its application stage', async ({ context, page }) => {
  await openTracker(context, page)
  for (const app of FIXTURE) {
    const appRow = row(page, app.companyName)
    await expect(appRow).toHaveCount(1)
    await expect(appRow.getByText(STAGE_LABELS[app.applicationStatus], { exact: true })).toBeVisible()
  }
})

test('expanding a row shows the outreach score and Edit / Delete', async ({ context, page }) => {
  await openTracker(context, page)
  const app = FIXTURE[0]
  const appRow = row(page, app.companyName)
  await appRow.getByRole('button', { name: 'Show details' }).click()
  await expect(appRow).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByText('Outreach score', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible()
})

test('Offer quick action sends one PUT with applicationStatus offer and updates the row', async ({ context, page }) => {
  const writes = await openTracker(context, page)
  // getQuickActions offers "Offer" only for an interviewing application whose outreach is finished.
  const app = FIXTURE.find(a => a.applicationStatus === 'interviewing' && ['replied', 'no_response', 'skipped'].includes(a.outreachStatus))
  if (!app) throw new Error('fixture has no application with an Offer quick action')
  const appRow = row(page, app.companyName)
  await expect(appRow.getByText('Interviewing', { exact: true })).toBeVisible()

  await appRow.getByRole('button', { name: 'Offer', exact: true }).click()

  await expect.poll(() => writes.length).toBeGreaterThan(0)
  expect(writes).toHaveLength(1)
  expect(writes[0].method).toBe('PUT')
  expect(writes[0].path).toBe(`/applications/${app.id}`)
  expect(writes[0].body).toMatchObject({ applicationStatus: 'offer' })
  // The stage word, not the (now removed) Offer quick action button.
  await expect(appRow.getByText('Offer', { exact: true }).and(page.locator(':not(button)'))).toBeVisible()
  await expect(appRow.getByRole('button', { name: 'Offer', exact: true })).toHaveCount(0)
})

test('board shows six columns with fixture counts and a card click opens its edit dialog', async ({ context, page }) => {
  const writes = await openTracker(context, page)
  await page.getByRole('button', { name: 'Board', exact: true }).click()

  // A column header reads "<label><count>"; the filter chips are buttons, so they are excluded.
  const headers = page.getByText(/^(Not Applied|Applied|Screening|Interviewing|Offer|Rejected)\s*\d+$/)
    .and(page.locator(':not(button)'))
  await expect(headers).toHaveCount(6)
  for (const [status, label] of Object.entries(STAGE_LABELS) as [Application['applicationStatus'], string][]) {
    await expect(headers.filter({ hasText: new RegExp(`^${label}\\s*${byStatus(status)}$`) })).toHaveCount(1)
  }

  const app = FIXTURE.find(a => a.applicationStatus === 'screening') ?? FIXTURE[0]
  await page.getByText(app.companyName, { exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit Application' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Company name')).toHaveValue(app.companyName)
  await expect(dialog.getByLabel('Role title')).toHaveValue(app.roleTitle)
  expect(writes).toHaveLength(0)
})

test('Delete in the detail view sends one DELETE and removes the row', async ({ context, page }) => {
  const writes = await openTracker(context, page)
  const app = FIXTURE[2]
  const appRow = row(page, app.companyName)
  await appRow.getByRole('button', { name: 'Show details' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()

  const confirm = page.getByRole('dialog', { name: 'Delete application?' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(page.getByText(app.companyName, { exact: true })).toHaveCount(0)
  await expect.poll(() => writes.length).toBeGreaterThan(0)
  expect(writes).toEqual([{ method: 'DELETE', path: `/applications/${app.id}`, body: null }])
})
