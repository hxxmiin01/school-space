// Configuration for the optional remote HTTP API backend.
//
// The frontend treats this as a generic "remote backend" contract: any
// service that answers the same REST endpoints (GET /api/rooms,
// GET /api/reservations) can sit behind this URL. Which runtime actually
// implements those endpoints (Azure Functions today; FastAPI, Express, or
// anything else later) is an infrastructure decision that should never
// require frontend changes — only this file and its env vars should need to
// change when that decision is revisited.
export const backendProvider = import.meta.env.VITE_BACKEND_PROVIDER || 'azure'

// VITE_REMOTE_API_BASE_URL is the generic, runtime-agnostic name for this
// setting. VITE_AZURE_API_BASE_URL is kept as a fallback so the currently
// deployed Azure setup keeps working without touching .env files.
export const remoteApiBaseUrl =
  import.meta.env.VITE_REMOTE_API_BASE_URL || import.meta.env.VITE_AZURE_API_BASE_URL || ''

// Deprecated: prefer `remoteApiBaseUrl`. Kept only so any existing imports of
// this name keep working unchanged.
export const azureApiBaseUrl = remoteApiBaseUrl

// A remote backend is considered "selected" whenever the provider isn't
// explicitly set to bypass it in favor of the local/Supabase data source.
// This intentionally does not hardcode a single accepted runtime name (e.g.
// only 'azure') as the sole non-local option, so switching the configured
// provider's name later doesn't silently disable the remote API path.
export function isRemoteBackendSelected() {
  return backendProvider !== 'supabase'
}
