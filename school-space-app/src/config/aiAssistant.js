// Configuration for the optional AI assistant endpoint.
//
// Like `config/backend.js`, this treats the assistant as a generic REST
// contract rather than assuming any particular AI backend runtime. Whatever
// service ends up answering this path (Azure OpenAI, a custom FastAPI
// service, an Azure Function stub, etc.) is an infrastructure decision that
// should never require frontend changes — the ai-assistant todo intentionally
// leaves that choice open.
//
// Contract:
//   POST {remoteApiBaseUrl}{assistantApiPath}
//   body:     { message: string, history?: { role: 'user'|'assistant', text: string }[] }
//   response: { reply: string }
//
// If no remote backend is configured, or the endpoint doesn't exist/respond
// yet, `src/api/assistant.js` reports that back so the UI can degrade to a
// friendly "not available yet" message instead of breaking the app.
import { remoteApiBaseUrl } from './backend'

export const assistantApiPath = import.meta.env.VITE_AI_ASSISTANT_PATH || '/api/assistant'

export function isAssistantConfigured() {
  return Boolean(remoteApiBaseUrl)
}
