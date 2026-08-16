import { postRemoteJson } from './remoteClient'
import { assistantApiPath, isAssistantConfigured } from '../config/aiAssistant'

/**
 * Sends a question to the AI assistant backend, if one is configured and
 * reachable, and normalizes the result so the UI never has to special-case
 * network errors, missing config, or unexpected response shapes — it only
 * has to handle `{ ok: true, reply }` or `{ ok: false, reason }`.
 *
 * This intentionally makes no assumption about which runtime answers the
 * request (Azure OpenAI, FastAPI, an Azure Function stub, ...) — it only
 * depends on the generic contract described in `src/config/aiAssistant.js`.
 * That keeps this safe to ship before a backend runtime is chosen: with no
 * endpoint configured/deployed, every call simply resolves to `ok: false`
 * instead of throwing.
 *
 * @param {string} message - the user's question, e.g. "지금 예약 가능한 방이 있나요?"
 * @param {{ role: 'user'|'assistant', text: string }[]} [history] - prior turns, oldest first
 * @param {{ userId?: string }} [context] - extra request context forwarded to the assistant backend
 * @returns {Promise<{ ok: boolean, reply?: string, reason?: string, error?: string }>}
 */
export async function askAssistant(message, history = [], context = {}) {
  const trimmed = typeof message === 'string' ? message.trim() : ''
  if (!trimmed) {
    return { ok: false, reason: 'empty-message' }
  }

  if (!isAssistantConfigured()) {
    return { ok: false, reason: 'not-configured' }
  }

  try {
    const body = await postRemoteJson(
      assistantApiPath,
      { message: trimmed, history, ...context },
      { errorLabel: 'AI 도우미' }
    )

    const reply = typeof body?.reply === 'string' ? body.reply.trim() : ''
    if (!reply) {
      return { ok: false, reason: 'invalid-response' }
    }
    return { ok: true, reply }
  } catch (error) {
    console.warn('AI 도우미 API를 불러오지 못해서 안내 문구로 대신 보여줘요.', error)
    return { ok: false, reason: 'unavailable', error: error.message }
  }
}
