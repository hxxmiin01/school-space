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
- 예약 정보를 수집하고 자동으로 예약을 진행한다
- 친절하고 이해하기 쉬운 한국어로 답변한다

현재 시스템:
- 학교에 스터디룸 4개가 있다 (study-room-1, study-room-2, study-room-3, study-room-4)
- 한 번에 1시간 ~ 3시간 단위로 예약 가능하다
- 예약은 담당자 승인 후 사용 가능하다
- 시간: 09:00 ~ 18:00

패널티 시스템:
- 룸 정리 미흡 또는 물품 훼손 시 1~10점 패널티
- 누적 10점이 되면 1주일간 예약 불가능

예약 정보 수집:
사용자가 예약을 요청하면 다음 정보를 수집한다:
- 날짜: YYYY-MM-DD 형식
- 시작 시간: HH:00 형식 (09:00 ~ 18:00)
- 종료 시간: HH:00 형식
- 인원 수: 숫자
- 사용 목적: 한두 문장으로 설명

예약 처리:
1. 정보가 불충분하면 친절하게 물어본다
2. 정보가 완전하면 다음 JSON으로 응답한다 (다른 텍스트 없이 JSON만):
   {
     "action": "make_reservation",
     "date": "YYYY-MM-DD",
     "start_time": "HH:00",
     "end_time": "HH:00",
     "members_count": 숫자,
     "purpose": "사용 목적",
     "room_id": "study-room-1"
   }
3. JSON 응답이 아닌 경우는 일반 한국어로 답변한다
4. 예약 완료 후 확인 메시지를 친절하게 전달한다

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

    // AI 응답이 JSON 형식의 예약 요청인지 확인
    let reservationData = null
    try {
      const parsed = JSON.parse(reply)
      if (parsed.action === 'make_reservation') {
        reservationData = parsed
      }
    } catch (e) {
      // JSON 파싱 실패 - 그냥 일반 텍스트 응답으로 처리
    }

    // 예약 JSON이면 실제로 /api/reserve 호출
    if (reservationData) {
      try {
        // Azure Functions 기본 URL (로컬: localhost:7071, 프로덕션: Azure Functions URL)
        const basePath = process.env.AZURE_FUNCTIONS_BASE_URL || 'http://localhost:7071'
        const reserveUrl = `${basePath}/api/reserve`

        const reserveResponse = await fetch(reserveUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: reservationData.date,
            start_time: reservationData.start_time,
            end_time: reservationData.end_time,
            members_count: reservationData.members_count,
            purpose: reservationData.purpose,
            room_id: reservationData.room_id,
          }),
        })

        if (reserveResponse.ok) {
          const reserveResult = await reserveResponse.json()
          reply = `✅ 예약이 완료되었습니다!\n\n예약 번호: #${reserveResult.reservationId}\n날짜: ${reservationData.date}\n시간: ${reservationData.start_time} ~ ${reservationData.end_time}\n인원: ${reservationData.members_count}명\n\n상태: 담당자 승인 대기 중입니다. 승인 후 입실 버튼이 활성화됩니다.`
        } else {
          const errorData = await reserveResponse.json()
          reply = `⚠️ 예약 중 문제가 발생했습니다.\n\n이유: ${errorData.error || '알 수 없는 오류'}\n\n다시 시도하거나 담당자에게 문의해주세요.`
        }
      } catch (reserveError) {
        reply = `❌ 예약 시스템 오류: ${reserveError.message}\n\n잠시 후 다시 시도해주세요.`
      }
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
