/**
 * Backend-agnostic instrumentation helpers ("observability starter").
 *
 * This module is deliberately NOT tied to any specific telemetry runtime or
 * vendor (OpenTelemetry Web SDK, Azure Monitor / Application Insights,
 * Grafana Faro, a Prometheus client, etc.). Choosing which of those to
 * export to is an infrastructure decision — see `docs/observability-plan.md`
 * — and must never require changes to any call site that uses this file.
 *
 * What this file provides today:
 *   1. A small set of call-site helpers: `trackPageView`, `trackInteraction`,
 *      `trackApiCall`, and `trackError`.
 *   2. A common event shape modeled loosely on OpenTelemetry span/log
 *      conventions (name, timestamp, duration, attributes, status) so it
 *      maps cleanly onto OTel spans, Azure Monitor custom events, or
 *      Prometheus-style counters/histograms later, without redesigning the
 *      call sites.
 *   3. A pluggable reporter registry (`registerObservabilityReporter`) —
 *      when a real backend is chosen, register one reporter function here
 *      that forwards buffered events to it (e.g. via an OTel exporter, the
 *      Application Insights SDK, or a Faro/OTLP endpoint). No reporter is
 *      registered by default, so this starter never sends data anywhere on
 *      its own.
 *
 * This file must never `import` a vendor telemetry SDK directly.
 */

import {
  isObservabilityLoggingEnabled,
  observabilityServiceName,
} from '../config/observability'

const MAX_BUFFERED_EVENTS = 200

/** Ring buffer of the most recent events, mainly useful for local debugging/tests. */
const recentEvents = []

/** Reporter callbacks registered via `registerObservabilityReporter`. */
const reporters = new Set()

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function emit(event) {
  recentEvents.push(event)
  if (recentEvents.length > MAX_BUFFERED_EVENTS) {
    recentEvents.shift()
  }

  if (isObservabilityLoggingEnabled) {
    console.debug(`[observability:${event.type}] ${event.name}`, event)
  }

  reporters.forEach((reporter) => {
    try {
      reporter(event)
    } catch (reporterError) {
      // A broken/misconfigured reporter must never break the app it's
      // observing — this is a starter/foundation, not a hard dependency.
      console.warn('[observability] a reporter threw an error and was skipped', reporterError)
    }
  })
}

function baseEvent(type, name, attributes) {
  return {
    type,
    name,
    service: observabilityServiceName,
    timestamp: new Date().toISOString(),
    attributes: attributes || {},
  }
}

/**
 * Registers a callback that receives every event recorded from this point
 * on. Returns an "unregister" function. This is the single seam a future
 * OpenTelemetry / Azure Monitor / Grafana / Prometheus exporter should hook
 * into — nothing else in this file (or its callers) needs to change.
 *
 * @param {(event: object) => void} reporter
 * @returns {() => void} unregister
 */
export function registerObservabilityReporter(reporter) {
  reporters.add(reporter)
  return () => reporters.delete(reporter)
}

/** Returns a shallow copy of the most recently buffered events (debugging/tests only). */
export function getRecentObservabilityEvents() {
  return recentEvents.slice()
}

/**
 * Records a page view / navigation event.
 * @param {string} pageName - route path or logical page name, e.g. "/mypage"
 * @param {Record<string, unknown>} [attributes]
 */
export function trackPageView(pageName, attributes) {
  emit(baseEvent('page_view', pageName, attributes))
}

/**
 * Records a discrete user interaction such as a button click or form
 * submission attempt (not its result — pair with `trackApiCall`/`trackError`
 * for outcomes).
 * @param {string} name - e.g. "login_submit", "reservation_checkin_click"
 * @param {Record<string, unknown>} [attributes]
 */
export function trackInteraction(name, attributes) {
  emit(baseEvent('interaction', name, attributes))
}

/**
 * Records a handled error/exception with optional context. Safe to call
 * alongside existing user-facing error messages — it never throws.
 * @param {unknown} error
 * @param {Record<string, unknown>} [attributes]
 */
export function trackError(error, attributes) {
  emit({
    ...baseEvent('error', (error && error.name) || 'error', {
      ...attributes,
      message: (error && error.message) || String(error),
    }),
    level: 'error',
  })
}

/**
 * Wraps an async call (an API/network/database call) to measure latency and
 * record success or failure. The wrapped call's result and thrown errors
 * pass through completely unchanged — this only observes, it never alters
 * behavior.
 *
 * @template T
 * @param {string} name - a stable, human-readable call name, e.g. "remote:/api/rooms"
 * @param {() => Promise<T>} fn
 * @param {Record<string, unknown>} [attributes]
 * @returns {Promise<T>}
 */
export async function trackApiCall(name, fn, attributes) {
  const start = nowMs()
  try {
    const result = await fn()
    emit({
      ...baseEvent('api_call', name, attributes),
      durationMs: Math.round(nowMs() - start),
      status: 'ok',
    })
    return result
  } catch (error) {
    emit({
      ...baseEvent('api_call', name, {
        ...attributes,
        message: (error && error.message) || String(error),
      }),
      durationMs: Math.round(nowMs() - start),
      status: 'error',
    })
    throw error
  }
}
