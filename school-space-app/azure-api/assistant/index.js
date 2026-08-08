/**
 * AI Assistant powered by Microsoft Foundry
 * 
 * POST /api/assistant
 * body:     { message: string, history?: { role: 'user'|'assistant', text: string }[] }
 * response: { reply: string }
 */
module.exports = async function (context, req) {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
  const history = Array.isArray(req.body?.history) ? req.body.history : []

  // 메시지 검증
  if (!message) {
    context.res = {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'message가 비어 있어요.' },
    }
    return
  }

  // Foundry 환경변수 확인
  const endpoint = process.env.FOUNDRY_ENDPOINT
  const apiKey = process.env.FOUNDRY_API_KEY
  const model = process.env.FOUNDRY_MODEL

  if (!endpoint || !apiKey || !model) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Foundry AI 서비스 환경변수가 설정되지 않았습니다.' },
    }
    return
  }

  try {
    // Foundry Responses API 형식으로 요청 준비
    // (표준 OpenAI chat completions와는 다름)
    
    // 이전 대화 이력을 문맥으로 포함
    let conversationContext = ''
    for (const turn of history) {
      if (turn.role === 'user') {
        conversationContext += `사용자: ${turn.text}\n`
      } else if (turn.role === 'assistant') {
        conversationContext += `도우미: ${turn.text}\n`
      }
    }

    // 시스템 프롬프트 + 대화 이력 + 현재 메시지
    const fullPrompt = `당신은 학교 스터디룸 예약 도우미입니다.

역할:
- 학생들이 스터디룸을 쉽게 예약하도록 돕는다
- 예약 가능한 시간을 확인해주고 예약을 대신 진행한다
- 친절하고 이해하기 쉬운 한국어로 답변한다

현재 시스템:
- 학교에 스터디룸 4개가 있다 (Room A, Room B, Room C, Room D)
- 한 번에 1시간 ~ 3시간 단위로 예약 가능하다
- 예약은 담당자 승인 후 사용 가능하다

패널티 시스템:
- 룸 정리 미흡 또는 물품 훼손 시 1~10점 패널티
- 누적 10점이 되면 1주일간 예약 불가능
- 최근 7일 내 패널티를 확인해준다

답변 가이드:
1. 사용자의 의도를 먼저 파악한다
2. 구체적으로 도움을 준다 (시간, 날짜, 인원 수 등)
3. 확실하지 않은 것은 물어본다
4. 예약 전에 사용자의 패널티 상태를 확인한다
5. 예약 후 담당자 승인을 기다려야 함을 알려준다

${conversationContext}사용자: ${message}`

    // Foundry API 호출 (Responses API 형식)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        input: fullPrompt,
        model,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      context.res = {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: {
          error: `Foundry API 오류: ${response.status} ${errorBody}`,
        },
      }
      return
    }

    const data = await response.json()

    // 응답 처리 (Responses API 형식)
    // output[0].content[0].text에 텍스트가 있음
    let reply = ''
    
    if (typeof data === 'string') {
      reply = data
    } else if (data.output && Array.isArray(data.output) && data.output.length > 0) {
      // Responses API 형식: output[0].content[0].text
      const outputContent = data.output[0].content
      if (Array.isArray(outputContent) && outputContent.length > 0) {
        reply = outputContent[0].text
      }
    } else if (data.output && typeof data.output === 'string') {
      reply = data.output
    } else if (data.choices && data.choices.length > 0) {
      // OpenAI 형식 (호환성)
      const choice = data.choices[0]
      reply =
        (choice.message && choice.message.content) ||
        (typeof choice.text === 'string' ? choice.text : '')
    } else if (data.result) {
      reply = data.result
    }

    if (!reply) {
      context.res = {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Foundry API에서 유효한 응답을 받지 못했습니다.' },
      }
      return
    }

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        reply: reply.trim(),
      },
    }
  } catch (error) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: {
        error: `AI 도우미 오류: ${error.message}`,
      },
    }
  }
}
