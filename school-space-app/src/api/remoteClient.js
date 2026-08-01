import { remoteApiBaseUrl, isRemoteBackendSelected } from '../config/backend'
import { trackApiCall, trackInteraction } from '../lib/telemetry'

/**
 * Backend-agnostic transport helpers for the remote HTTP API.
 *
 * This module owns every transport/config decision (base URL trimming, query
 * string building, JSON parsing, error formatting, and the
 * remote-then-local-fallback flow). Callers in `src/api/*` only describe
 * *which* resource they need and *how* to load it locally as a fallback —
 * never *how* to reach the remote API. If the backend runtime changes later
 * (Azure Functions today; FastAPI, Express, or anything else tomorrow), only
 * this file and `src/config/backend.js` should need to change.
 *
 * Every call also goes through `trackApiCall`/`trackInteraction` from
 * `src/lib/telemetry.js` so latency, success/failure, and which data source
 * answered are observed automatically for any resource built on top of this
 * module — no per-resource instrumentation needed in `src/api/rooms.js`,
 * `src/api/reservations.js`, etc.
 */

function buildRemoteUrl(path, searchParams) {
  const baseUrl = remoteApiBaseUrl.replace(/\/$/, '')
  const url = new URL(`${baseUrl}${path}`)
  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value)
      }
    })
  }
  return url.toString()
}

/**
 * Fetches JSON from a path on the configured remote backend.
 * @param {string} path - API path, e.g. `/api/rooms`
 * @param {object} [options]
 * @param {Record<string, string|undefined>} [options.searchParams] - optional query params
 * @param {string} [options.errorLabel] - label used in the thrown error message when the request fails
 */
export async function fetchRemoteJson(path, { searchParams, errorLabel = path } = {}) {
  return trackApiCall(
    `remote:${path}`,
    async () => {
      const response = await fetch(buildRemoteUrl(path, searchParams))
      if (!response.ok) {
        throw new Error(`${errorLabel} 요청 실패: ${response.status}`)
      }
      return response.json()
    },
    { path, searchParams }
  )
}

/**
 * Posts a JSON body to a path on the configured remote backend and returns
 * the parsed JSON response. This is the write-style counterpart to
 * `fetchRemoteJson`, used for calls (e.g. the AI assistant) that have no
 * local/Supabase fallback data source of their own — the caller decides how
 * to degrade gracefully when this rejects (missing config, network error,
 * non-2xx response, endpoint not deployed yet, ...).
 *
 * @param {string} path - API path, e.g. `/api/assistant`
 * @param {object} [body] - JSON-serializable request payload
 * @param {object} [options]
 * @param {string} [options.errorLabel] - label used in the thrown error message when the request fails
 */
export async function postRemoteJson(path, body, { errorLabel = path } = {}) {
  return trackApiCall(
    `remote:${path}`,
    async () => {
      const response = await fetch(buildRemoteUrl(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      if (!response.ok) {
        throw new Error(`${errorLabel} 요청 실패: ${response.status}`)
      }
      return response.json()
    },
    { path, method: 'POST' }
  )
}

/**
 * Resolves a resource from the remote backend when one is configured and
 * reachable, transparently falling back to a local data source (Supabase
 * today) otherwise. Every caller gets the same result shape regardless of
 * which source actually answered: `{ data, source, fallbackReason }`.
 *
 * @param {object} options
 * @param {() => Promise<any>} options.fetchRemote - loads data from the remote API
 * @param {() => Promise<any>} options.fetchLocal - loads the same data from the local/fallback source
 * @param {string} options.missingConfigReason - human-readable reason shown when no remote URL is configured
 * @param {(error: Error) => void} [options.onFallback] - optional hook called when falling back after a remote failure
 * @param {string} [options.remoteSource] - source label reported when the remote call succeeds
 * @param {string} [options.localSource] - source label reported when the local source is used by default
 * @param {string} [options.fallbackSource] - source label reported when the remote call failed and local was used instead
 * @param {string} [options.missingConfigSource] - source label reported when no remote URL is configured
 * @param {string} [options.resourceName] - label used when recording which data source answered (defaults to `remoteSource`)
 */
export async function resolveWithRemoteFallback({
  fetchRemote,
  fetchLocal,
  missingConfigReason,
  onFallback,
  remoteSource = 'azure',
  localSource = 'supabase',
  fallbackSource = 'supabase-fallback',
  missingConfigSource = 'supabase-no-azure-url',
  resourceName,
}) {
  const label = resourceName || remoteSource
  const resolved = await (async () => {
    if (isRemoteBackendSelected() && remoteApiBaseUrl) {
      try {
        const data = await fetchRemote()
        return { data, source: remoteSource, fallbackReason: null }
      } catch (error) {
        onFallback?.(error)
        const data = await fetchLocal()
        return { data, source: fallbackSource, fallbackReason: error.message }
      }
    }

    if (isRemoteBackendSelected() && !remoteApiBaseUrl) {
      const data = await fetchLocal()
      return { data, source: missingConfigSource, fallbackReason: missingConfigReason }
    }

    const data = await fetchLocal()
    return { data, source: localSource, fallbackReason: null }
  })()

  // Records which data source actually answered, so it's easy to see (once a
  // real exporter is wired up) how often the remote backend is reachable vs.
  // falling back, without touching any `src/api/*` call site.
  trackInteraction(`data_source_resolved:${label}`, {
    source: resolved.source,
    fallbackReason: resolved.fallbackReason,
  })

  return resolved
}
