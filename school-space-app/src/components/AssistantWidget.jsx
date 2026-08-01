import { useEffect, useRef, useState } from 'react'
import { askAssistant } from '../api/assistant'

/**
 * Lightweight, floating AI-assistant entry point.
 *
 * This is a safe scaffold: it never assumes a specific AI backend runtime,
 * never breaks the rest of the app if the assistant endpoint is missing or
 * unreachable, and only adds a small floating button + panel on top of the
 * existing screens (no routes, no shared state changes).
 */

const QUICK_QUESTIONS = [
  '지금 예약 가능한 방이 있나요?',
  '내 예약 상태를 알려줘',
  '우리 반 패널티 점수가 궁금해요',
]

const UNAVAILABLE_MESSAGE =
  'AI 도우미가 아직 연결되어 있지 않아요. 나중에 다시 시도해 주세요. 그동안 공간 현황은 홈 화면에서, 예약 내역은 마이페이지에서 확인할 수 있어요.'

function reasonToMessage(reason) {
  switch (reason) {
    case 'unavailable':
      return 'AI 도우미 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'
    case 'invalid-response':
      return 'AI 도우미가 이해할 수 없는 답을 보냈어요. 잠시 후 다시 시도해 주세요.'
    case 'not-configured':
    default:
      return UNAVAILABLE_MESSAGE
  }
}

export default function AssistantWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', text: '안녕하세요! 예약이나 공간 현황이 궁금하면 물어보세요 🙂' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const listRef = useRef(null)

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, open])

  async function sendMessage(rawText) {
    const trimmed = rawText.trim()
    if (!trimmed || loading) return

    const history = messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map(({ role, text }) => ({ role, text }))

    setMessages((prev) => [...prev, { role: 'user', text: trimmed }])
    setInput('')
    setLoading(true)

    const result = await askAssistant(trimmed, history)

    setMessages((prev) => [
      ...prev,
      result.ok
        ? { role: 'assistant', text: result.reply }
        : { role: 'system', text: reasonToMessage(result.reason) },
    ])
    setLoading(false)
  }

  function handleSubmit(event) {
    event.preventDefault()
    sendMessage(input)
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-[420px] w-[320px] max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between bg-gradient-to-r from-blue-700 to-cyan-600 px-4 py-3">
            <span className="text-sm font-bold text-white">🤖 AI 도우미 (준비 중)</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="AI 도우미 닫기"
              className="text-white/80 transition-colors hover:text-white"
            >
              ✕
            </button>
          </div>

          <div
            ref={listRef}
            role="log"
            aria-live="polite"
            className="flex-1 space-y-2 overflow-y-auto px-3 py-3"
          >
            {messages.map((message, index) => (
              <div
                key={index}
                className={
                  message.role === 'user'
                    ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 px-3 py-2 text-sm text-white'
                    : message.role === 'system'
                      ? 'max-w-[90%] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800'
                      : 'max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-800'
                }
              >
                {message.text}
              </div>
            ))}
            {loading && (
              <div className="max-w-[60%] rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-400">
                답변 준비 중...
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-3 py-2">
            {QUICK_QUESTIONS.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => sendMessage(question)}
                disabled={loading}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                {question}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2 border-t border-slate-100 p-2">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="궁금한 점을 물어보세요"
              aria-label="AI 도우미에게 질문 입력"
              className="flex-1 rounded-full border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-full bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            >
              전송
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'AI 도우미 닫기' : 'AI 도우미 열기'}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-700 to-cyan-600 text-2xl text-white shadow-xl transition-transform hover:scale-105"
      >
        {open ? '✕' : '💬'}
      </button>
    </div>
  )
}
