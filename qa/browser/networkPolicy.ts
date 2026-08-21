import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import path from 'node:path'

import type { BrowserContext, Request } from '@playwright/test'

import type {
  BrowserResourceType,
  HttpMethod,
  NetworkEvent,
  NetworkOriginAlias,
  NetworkQueryKey,
  NetworkRouteTemplate,
  NetworkSummary,
  RequestFieldEvidence,
  RequestFieldName,
  SafetyViolation,
} from './types'

export const QA_APP_ORIGIN = 'http://127.0.0.1:4173'
export const QA_API_ORIGIN = 'https://api.qa.invalid'
export const QA_S3_ORIGIN = 'https://s3.qa.invalid'
export const GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300..800&family=JetBrains+Mono:wght@400;500&display=swap'

export async function generatedBuildResourcePaths(directory: string, root = directory): Promise<Set<string>> {
  const paths = new Set<string>()
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) for (const nested of await generatedBuildResourcePaths(fullPath, root)) paths.add(nested)
    else if (/\.(?:css|js|svg|png|jpe?g|webp|ico|woff2?)$/i.test(entry.name)) paths.add(`/${path.relative(root, fullPath).split(path.sep).join('/')}`)
  }
  return paths
}

export interface ContractRouteHandler {
  handle(request: Request): Promise<ContractResponse | null>
  normalizedRequestFields?(request: Request): RequestFieldEvidence[] | null
}

export interface ContractResponse {
  status: number
  contentType: string
  body: string
}

interface NetworkPolicyOptions {
  appOrigin: string
  apiOrigin: string
  s3Origin: string
  startedAt: number
  contractRouter: ContractRouteHandler
  allowedLocalResourcePaths: ReadonlySet<string>
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

const HTTP_METHODS = new Set<HttpMethod>(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
const RESOURCE_TYPES = new Set<BrowserResourceType>([
  'document', 'stylesheet', 'image', 'media', 'font', 'script', 'texttrack', 'xhr', 'fetch',
  'eventsource', 'websocket', 'manifest', 'other',
])
const REQUEST_FIELD_NAMES = new Set<RequestFieldName>(['fileName', 'jobDescription', 'existingAnalysisId'])
const QUERY_KEYS = new Set<NetworkQueryKey>(['display', 'family', 'userId', 'marker', 'probe', 'unexpected'])

function expectedBuildResourceType(resourceType: string, pathname: string): boolean {
  if (resourceType === 'script') return /\.js$/i.test(pathname)
  if (resourceType === 'stylesheet') return /\.css$/i.test(pathname)
  if (resourceType === 'image') return /\.(?:svg|png|jpe?g|webp|ico)$/i.test(pathname)
  if (resourceType === 'font') return /\.woff2?$/i.test(pathname)
  return false
}

function normalizedMethod(value: string): HttpMethod {
  return HTTP_METHODS.has(value as HttpMethod) ? value as HttpMethod : 'OTHER'
}

function normalizedResourceType(value: string): BrowserResourceType {
  return RESOURCE_TYPES.has(value as BrowserResourceType) ? value as BrowserResourceType : 'other'
}

function normalizedQueryKeys(url: URL): NetworkQueryKey[] {
  return [...new Set(url.searchParams.keys())]
    .map(key => QUERY_KEYS.has(key as NetworkQueryKey) ? key as NetworkQueryKey : '[other]')
    .sort()
}

function requestFields(request: Request): RequestFieldEvidence[] {
  const body = request.postData()
  if (!body) return []

  const contentType = request.headers()['content-type'] ?? ''
  if (!contentType.includes('application/json')) {
    return [{ name: 'multipartFormData', length: Buffer.byteLength(body), sha256: sha256(body) }]
  }

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    return Object.entries(parsed)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => {
        const serialized = typeof value === 'string' ? value : (JSON.stringify(value) ?? '')
        return {
          name: REQUEST_FIELD_NAMES.has(name as RequestFieldName) ? name as RequestFieldName : '[other]',
          length: Buffer.byteLength(serialized),
          sha256: sha256(serialized),
        }
      })
  } catch {
    return [{ name: '[other]', length: Buffer.byteLength(body), sha256: sha256(body) }]
  }
}

function routeTemplate(
  url: URL,
  appOrigin: string,
  apiOrigin: string,
  s3Origin: string,
  allowedLocalResourcePaths: ReadonlySet<string>,
): NetworkRouteTemplate {
  if (url.origin === apiOrigin && /^\/analysis\/[^/]+$/.test(url.pathname)) return '/analysis/:analysisId'
  if (url.origin === apiOrigin && (url.pathname === '/upload' || url.pathname === '/user/last-resume')) return url.pathname
  if (url.origin === s3Origin) return '/synthetic-upload'
  if (url.href === GOOGLE_FONTS_URL) return '/css2'
  if (url.origin === appOrigin && /^\/(?:sample|upload)$/.test(url.pathname)) return url.pathname as '/sample' | '/upload'
  if (url.origin === appOrigin && /^\/results\/qa-(?:new|reuse|failed|timeout)-1$/.test(url.pathname)) return '/results/:analysisId'
  if (url.origin === appOrigin && allowedLocalResourcePaths.has(url.pathname)) return '[local-build-resource]'
  return '[blocked-route]'
}

function redactedTarget(url: URL): string {
  const queryKeys = [...new Set(url.searchParams.keys())].sort()
  const safeOrigin = url.hostname.endsWith('.invalid') || url.origin === QA_APP_ORIGIN ? url.origin : '[blocked-origin]'
  const safePath = url.pathname
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ':redacted-email')
    .replace(/[^/]+\.pdf/gi, ':redacted-pdf')
    .replace(/[A-Za-z0-9_-]{32,}/g, ':redacted-token')
  return `${safeOrigin}${safePath}${queryKeys.length ? `?${queryKeys.join('&')}` : ''}`
}

function classifyOrigin(url: URL, appOrigin: string, apiOrigin: string, s3Origin: string): NetworkOriginAlias {
  if (url.origin === appOrigin) return 'local-app'
  if (url.origin === apiOrigin) return 'resumematch-api-sentinel'
  if (url.origin === s3Origin) return 's3-sentinel'
  if (url.origin === 'https://fonts.googleapis.com') return 'google-fonts'
  const host = url.hostname.toLowerCase()
  if (host.includes('cognito')) return 'cognito'
  if (host === 'resumematchapp.com' || host.endsWith('.resumematchapp.com')) return 'resumematch-api-external'
  if (host.includes('execute-api') && host.endsWith('.amazonaws.com')) return 'resumematch-api-external'
  if ((host.startsWith('s3.') || host.includes('.s3.')) && host.endsWith('.amazonaws.com')) return 's3-external'
  if (host.includes('deepgram')) return 'deepgram'
  if (host.includes('hunter') || host.includes('apollo')) return 'outreach'
  return 'unexpected'
}

export class NetworkPolicy {
  readonly events: NetworkEvent[] = []
  readonly safetyViolations: SafetyViolation[] = []
  private readonly eventByRequest = new WeakMap<Request, NetworkEvent>()

  constructor(private readonly options: NetworkPolicyOptions) {}

  async install(context: BrowserContext): Promise<void> {
    context.on('response', response => {
      const event = this.eventByRequest.get(response.request())
      if (!event) return
      event.status = response.status()
      event.durationMs = Math.max(0, Date.now() - this.options.startedAt - event.relativeTimestampMs)
    })

    await context.routeWebSocket(/.*/, async webSocketRoute => {
      const url = new URL(webSocketRoute.url())
      this.recordViolation('WEBSOCKET', 'websocket', url, 'WebSocket connections are not allowed in Phase 1')
      await webSocketRoute.close({ code: 1008, reason: 'Blocked by QA network policy' })
    })

    await context.route('**/*', async route => {
      const request = route.request()
      const url = new URL(request.url())
      const started = Date.now()

      if (url.origin === this.options.appOrigin) {
        const methodAllowed = request.method() === 'GET' || request.method() === 'HEAD'
        const expectedDocument = request.resourceType() === 'document'
          && request.method() === 'GET'
          && (/^\/(?:sample|upload)$/.test(url.pathname) || /^\/results\/qa-(?:new|reuse|failed|timeout)-1$/.test(url.pathname))
          && url.search === ''
        const expectedResource = methodAllowed && url.search === ''
          && this.options.allowedLocalResourcePaths.has(url.pathname)
          && expectedBuildResourceType(request.resourceType(), url.pathname)
        if (expectedDocument || expectedResource) {
          this.recordEvent(request, url, null, Date.now() - started, 'local-application')
          await route.continue()
        } else {
          this.recordViolation(request.method(), request.resourceType(), url, 'Same-origin request is not an allowed document or generated resource', 'SAFETY_UNEXPECTED_BROWSER_REQUEST')
          this.recordEvent(request, url, null, Date.now() - started, 'blocked')
          await route.abort('blockedbyclient')
        }
        return
      }

      if (url.href === GOOGLE_FONTS_URL) {
        this.recordEvent(request, url, 200, Date.now() - started, 'fulfilled-font-css')
        await route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: '' })
        return
      }

      if (url.origin === this.options.apiOrigin || url.origin === this.options.s3Origin) {
        const response = await this.options.contractRouter.handle(request)
        if (response) {
          this.recordEvent(
            request,
            url,
            response.status,
            Date.now() - started,
            'fulfilled-contract',
            this.options.contractRouter.normalizedRequestFields?.(request) ?? undefined,
          )
          await route.fulfill({
            status: response.status,
            contentType: response.contentType,
            body: response.body,
          })
        } else {
          this.recordEvent(request, url, null, Date.now() - started, 'blocked')
          await route.abort('blockedbyclient')
        }
        return
      }

      this.recordViolation(request.method(), request.resourceType(), url, 'Origin is not on the Phase 1 allowlist')
      this.recordEvent(request, url, null, Date.now() - started, 'blocked')
      await route.abort('blockedbyclient')
    })
  }

  summary(): NetworkSummary {
    const count = (...aliases: string[]) => this.events.filter(event => aliases.includes(event.originAlias)).length
    return {
      resumeMatchRest: count('resumematch-api-sentinel', 'resumematch-api-external'),
      cognito: count('cognito'),
      s3: count('s3-sentinel', 's3-external'),
      deepgram: count('deepgram'),
      outreach: count('outreach'),
      unexpectedEgress: this.safetyViolations.length,
      locallyFulfilled: count('google-fonts'),
    }
  }

  private recordViolation(
    method: string,
    resourceType: string,
    url: URL,
    reason: string,
    code: SafetyViolation['code'] = 'SAFETY_UNEXPECTED_EGRESS',
  ): void {
    this.safetyViolations.push({
      code,
      sequence: this.safetyViolations.length + 1,
      relativeTimestampMs: Date.now() - this.options.startedAt,
      method: method === 'WEBSOCKET' ? 'WEBSOCKET' : normalizedMethod(method),
      resourceType: normalizedResourceType(resourceType),
      target: redactedTarget(url),
      blockedByPlaywrightRoute: true,
      reason,
    })
  }

  private recordEvent(
    request: Request,
    url: URL,
    status: number | null,
    durationMs: number,
    mockDecision: NetworkEvent['mockDecision'],
    observedRequestFields?: RequestFieldEvidence[],
  ): void {
    const event: NetworkEvent = {
      sequence: this.events.length + 1,
      relativeTimestampMs: Date.now() - this.options.startedAt,
      method: normalizedMethod(request.method()),
      resourceType: normalizedResourceType(request.resourceType()),
      originAlias: classifyOrigin(url, this.options.appOrigin, this.options.apiOrigin, this.options.s3Origin),
      routeTemplate: routeTemplate(url, this.options.appOrigin, this.options.apiOrigin, this.options.s3Origin, this.options.allowedLocalResourcePaths),
      queryKeys: normalizedQueryKeys(url),
      status,
      durationMs,
      mockDecision,
      requestFields: observedRequestFields ?? requestFields(request),
    }
    this.events.push(event)
    this.eventByRequest.set(request, event)
  }
}
