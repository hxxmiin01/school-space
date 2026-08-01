// Placeholder implementation of the generic AI assistant contract described
// in `src/config/aiAssistant.js`:
//
//   POST /api/assistant
//   body:     { message: string, history?: { role: 'user'|'assistant', text: string }[] }
//   response: { reply: string }
//
// IMPORTANT: this does NOT call any AI/LLM provider. It exists only so the
// endpoint responds with a well-formed answer while the actual AI backend
// runtime (Azure OpenAI, another hosted model, a different service
// entirely, ...) is still an open decision for the `ai-assistant` todo.
// Replace the body of this handler with a real integration later -- the
// frontend contract above will not need to change.
module.exports = async function (context, req) {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''

  if (!message) {
    context.res = {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'message가 비어 있어요.' },
    }
    return
  }

  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      reply:
        'AI 도우미는 아직 준비 중이에요. 지금은 홈 화면에서 공간 현황을, 마이페이지에서 예약 내역을 확인해 주세요.',
    },
  }
}
