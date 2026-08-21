import type { BrowserContext } from '@playwright/test'

import type { ScenarioInstance } from './scenarios'
import type { UploadEntry, UploadObservation } from './types'

export async function installUploadObservation(
  context: BrowserContext,
  scenario: ScenarioInstance,
  s3Origin: string,
): Promise<void> {
  await context.exposeBinding('__qaObserveUpload', (_source, observation: UploadObservation) => {
    scenario.uploadObservation = observation
  })
  await context.addInitScript((expectedOrigin: string) => {
    const originalFetch = globalThis.fetch.bind(globalThis)
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = new URL(input instanceof Request ? input.url : String(input), globalThis.location.href)
      const body = init?.body ?? (input instanceof Request ? await input.clone().formData().catch(() => null) : null)
      if (requestUrl.origin === expectedOrigin && body instanceof FormData) {
        const entries: UploadEntry[] = []
        for (const [name, value] of body.entries()) {
          if (value instanceof File) {
            const bytes = new Uint8Array(await value.arrayBuffer())
            const hash = await crypto.subtle.digest('SHA-256', bytes)
            entries.push({
              name,
              kind: 'file',
              fileName: value.name,
              mimeType: value.type,
              size: value.size,
              sha256: [...new Uint8Array(hash)].map(item => item.toString(16).padStart(2, '0')).join(''),
              signatureHex: [...bytes.slice(0, 5)].map(item => item.toString(16).padStart(2, '0')).join(''),
            })
          } else {
            const encoded = new TextEncoder().encode(value)
            const hash = await crypto.subtle.digest('SHA-256', encoded)
            entries.push({
              name,
              kind: 'text',
              value,
              length: encoded.byteLength,
              sha256: [...new Uint8Array(hash)].map(item => item.toString(16).padStart(2, '0')).join(''),
            })
          }
        }
        await (globalThis as typeof globalThis & { __qaObserveUpload(value: UploadObservation): Promise<void> }).__qaObserveUpload({ entries })
      }
      return originalFetch(input, init)
    }
  }, s3Origin)
}
