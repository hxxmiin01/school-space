// Generic, vendor-agnostic observability configuration.
//
// This file intentionally does NOT select an export backend/runtime — no
// OpenTelemetry, Azure Monitor / Application Insights, Grafana, or
// Prometheus client is imported here. It only exposes small toggles that
// the frontend instrumentation helpers in `src/lib/telemetry.js` read, plus
// a reserved, generic exporter endpoint that a future backend-specific
// reporter can use once one is chosen. See
// `docs/observability-plan.md` for the rollout plan and export options.
//
// Following the same pattern as `src/config/backend.js`: only this file
// (and `src/lib/telemetry.js`) should need to change when an actual
// exporter/runtime is picked later — call sites elsewhere never should.

export const observabilityServiceName =
  import.meta.env.VITE_OBSERVABILITY_SERVICE_NAME || 'school-space-web'

// Verbose console logging of every recorded event — handy while wiring up
// new instrumentation locally. Off by default in production builds; on
// automatically during local `vite dev`. Can be forced on/off explicitly
// with VITE_OBSERVABILITY_DEBUG=true|false.
const debugOverride = import.meta.env.VITE_OBSERVABILITY_DEBUG
export const isObservabilityLoggingEnabled =
  debugOverride === 'true' ? true : debugOverride === 'false' ? false : Boolean(import.meta.env.DEV)

// Reserved for a future exporter target — e.g. an OTLP/HTTP collector
// endpoint, an Azure Monitor / Application Insights connection string, or a
// Grafana Alloy / Prometheus remote-write URL. Left empty until a backend
// runtime is chosen; this starter never sends data anywhere on its own.
export const observabilityExporterEndpoint =
  import.meta.env.VITE_OBSERVABILITY_EXPORTER_URL || ''

export function isObservabilityExporterConfigured() {
  return Boolean(observabilityExporterEndpoint)
}
