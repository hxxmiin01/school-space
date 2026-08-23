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

    const assistantMessages = history
      .filter((turn) => turn.role === 'assistant')
      .map((turn) => turn.text || '')

    const lastAssistantMessage = assistantMessages[assistantMessages.length - 1] || ''
    const awaitingRoom = /어느\s*방을\s*예약하시겠어요|예약할\s*방\s*정보가\s*필요|예약\s*할\s*방이\s*필요/i.test(lastAssistantMessage)
    const awaitingStartTime = /시작\s*시간을\s*알려주세요|현재\s*시각\s*이후의\s*시작\s*시간을\s*입력해주세요/i.test(lastAssistantMessage)
    const awaitingEndTime = /몇\s*시.*까지\s*사용할\s*거예요|종료\s*시간을\s*다시\s*입력해주세요|부터\s*시작하시는군요/i.test(lastAssistantMessage)
    const awaitingMembers = /몇\s*명이서\s*사용할\s*거예요/i.test(lastAssistantMessage)
    const awaitingPurpose = /사용\s*목적/i.test(lastAssistantMessage)
    const awaitingConfirmation = /예약 정보를 확인해주세요\./.test(lastAssistantMessage)

    let reservationStateHint = ''
    if (awaitingRoom) {
      reservationStateHint = '현재 단계: 방 선택 대기. 이미 받은 시간/인원/목적이 있어도 방 질문만 다시 한다.'
    } else if (awaitingStartTime) {
      reservationStateHint = '현재 단계: 시작 시간 대기. 사용자가 단독 시간만 보내면 그 값을 시작 시간으로 받아들인다.'
    } else if (awaitingEndTime) {
      reservationStateHint = '현재 단계: 종료 시간 수정 대기. 사용자가 "오후 7시"처럼 단독 시간을 보내면 그것을 종료 시간으로 한 번만 반영하고 같은 종료 시간 질문을 반복하지 않는다. 이미 알고 있는 시작 시간과 비교할 때만 종료 시간이 더 늦은지 확인한다.'
    } else if (awaitingMembers) {
      reservationStateHint = '현재 단계: 인원 대기. 숫자나 "3명" 같은 단답을 그대로 인원 수로 받는다.'
    } else if (awaitingPurpose) {
      reservationStateHint = '현재 단계: 사용 목적 대기. 예시 단어만 허용하지 말고 "공부", "발표 준비", "조별과제"처럼 자연스러운 문장을 그대로 받는다.'
    } else if (awaitingConfirmation) {
      reservationStateHint = '현재 단계: 예약 확인 대기. 새 정보를 다시 묻지 말고 예/아니요만 받는다.'
    }

    const timeReplyRule = '시간 응답 규칙: 사용자가 "오후 7시"라고 하면 19:00으로 이해한다. 종료 시간 수정 단계에서는 단일 시간 답변을 다시 질문하지 말고, 방금 받은 값을 종료 시간으로 확정한 뒤 다음 누락 정보로 넘어간다.'

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
- 예약 가능 시간은 별도 운영 정책을 확인하며, 근거 없이 특정 시간을 고정해서 안내하지 않는다.

패널티 시스템:
- 룸 정리 미흡 또는 물품 훼손 시 1~10점 패널티
- 누적 10점이 되면 1주일간 예약 불가능

예약 정보 수집:
사용자가 예약을 요청하면 다음 정보를 수집한다:
- 날짜: YYYY-MM-DD 형식
- 시작 시간: HH:MM 형식
- 종료 시간: HH:00 형식
- 인원 수: 숫자
- 사용 목적: 한두 문장으로 설명

예약 대화 규칙:
- 방, 날짜, 시작 시간, 종료 시간, 인원 수, 사용 목적을 순서대로 확인한다.
- 한 번에 여러 정보를 받으면 모두 추출하고, 빠진 정보만 한 번 질문한다.
- 이미 받은 정보는 다시 묻지 않는다.
- 사용자가 "오늘", "내일", "모레", "글피"라고 하면 한국 시간(Asia/Seoul) 기준 실제 날짜로 해석한다.
- "A룸", "a방", "스터디룸 A", "A"처럼 말해도 같은 방으로 인식한다.
- 사용 목적은 예시 단어로 제한하지 않는다. "발표 준비", "조별과제", "공부"처럼 자유로운 문장을 그대로 받는다.
- 사용자가 "오후 7시"처럼 단독 시간을 보내면 현재 질문이 시작 시간인지 종료 시간인지 대화 흐름으로 판단한다.
- 종료 시간을 다시 입력받는 단계에서는 단독 시간을 종료 시간으로 반영하고 같은 질문을 반복하지 않는다.
- 종료 시간이 시작 시간보다 이르거나 같을 때만 종료 시간 재입력을 요청한다.
- 모든 정보가 모이기 전에는 예약 JSON을 만들지 않는다.
- 모든 정보가 모이면 예약 요약을 한 번만 보여주고 "예"라고 답했을 때만 예약 JSON을 만든다.

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

추가 규칙:
- ${reservationStateHint || '현재 예약 단계를 대화 이력으로 추론하고, 이미 받은 정보는 다시 묻지 않는다.'}
- ${timeReplyRule}
- 종료 시간은 시작 시간보다 늦어야 하지만, 사용자가 수정 답변을 보냈다면 그 시간 값을 먼저 반영하고 나서만 검증한다.
- 같은 질문을 연속해서 반복하지 말고, 방금 받은 답이 어느 칸에 들어가는지 먼저 판단한다.

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
