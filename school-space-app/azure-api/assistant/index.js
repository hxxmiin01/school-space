/**
 * AI Assistant powered by Microsoft Foundry
 * 
 * POST /api/assistant
 * body:     { message: string, history?: { role: 'user'|'assistant', text: string }[] }
 * response: { reply: string }
 */
const ROOM_ID_TO_CODE = { 1: 'A', 2: 'B', 3: 'C', 4: 'D' }
const ROOM_CODE_TO_ID = { A: 1, B: 2, C: 3, D: 4 }

function getRoomCode(value) {
  const text = String(value ?? '').trim().replace(/(?:룸|방|room)$/i, '').trim()
  const match = text.match(/^(?:(?:study[\s_-]*room|room|스터디룸|방)\s*[-_]?\s*)?([1-4A-D])$/i)
  if (!match) return null

  const token = match[1].toUpperCase()
  return ROOM_ID_TO_CODE[token] || (ROOM_CODE_TO_ID[token] ? token : null)
}

function formatRoomName(value) {
  const roomCode = getRoomCode(value)
  return roomCode ? `스터디룸 ${roomCode}` : '스터디룸'
}

function formatUserFacingRoomNames(text) {
  return String(text)
    .replace(/\bstudy[\s_-]*room[\s_-]*([1-4])\b/gi, (_, roomId) => `${ROOM_ID_TO_CODE[roomId]}룸`)
    .replace(/\broom[\s_-]*([1-4])\b/gi, (_, roomId) => `${ROOM_ID_TO_CODE[roomId]}룸`)
    .replace(/스터디\s*룸[\s_-]*([1-4])/gi, (_, roomId) => `${ROOM_ID_TO_CODE[roomId]}룸`)
    .replace(/([1-4])\s*번\s*(?:스터디\s*)?(?:룸|방)/gi, (_, roomId) => `${ROOM_ID_TO_CODE[roomId]}룸`)
    .replace(/(?:스터디\s*)?(?:룸|방)\s*([1-4])\b/gi, (_, roomId) => `${ROOM_ID_TO_CODE[roomId]}룸`)
    .replace(/([1-4])\s*호실/gi, (_, roomId) => `${ROOM_ID_TO_CODE[roomId]}룸`)
}

module.exports = async function (context, req) {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
  const history = Array.isArray(req.body?.history) ? req.body.history : []
  const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : ''

  function getFunctionsBaseUrl() {
    if (process.env.AZURE_FUNCTIONS_BASE_URL) {
      return process.env.AZURE_FUNCTIONS_BASE_URL.replace(/\/$/, '')
    }

    const host = req.headers?.host
    if (host && !/^localhost(?::\d+)?$/i.test(host)) {
      const forwardedProtocol = req.headers?.['x-forwarded-proto']
      const protocol = forwardedProtocol || 'https'
      return `${protocol}://${host}`
    }

    return 'http://localhost:7071'
  }

  // 메시지 검증
  if (!message) {
    context.res = {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'message가 비어 있어요.' },
    }
    return
  }

  const hasReservationContext = history.some((turn) =>
    typeof turn?.text === 'string' && /예약|스터디룸|방|공간|시간|인원|목적/i.test(turn.text)
  )
  const isGreeting = /^(안녕|안녕하세요|하이|hello|hi)[!！.。\s]*$/i.test(message)
  if (isGreeting) {
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        reply: '안녕하세요! 스터디룸 예약, 공간 현황, 입실·퇴실에 대해 도와드릴게요. 무엇이 궁금한가요?',
      },
    }
    return
  }

  const isSchoolSpaceQuestion = /예약|스터디룸|방|공간|패널티|입실|퇴실|체크인|체크아웃|공실|이용|사용/i.test(message)
  if (!isSchoolSpaceQuestion && !hasReservationContext) {
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        reply: '저는 스터디룸 예약, 공간 현황, 입실·퇴실, 패널티 관련 질문을 도와드릴 수 있어요. 해당 내용으로 다시 질문해주세요.',
      },
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

  async function fetchUserReservations() {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseServiceRoleKey || !userId) {
      return null
    }

    const todayText = toKoreaDateText()
    const url = `${supabaseUrl}/rest/v1/reservations?select=room_id,date,start_time,end_time,status,members_count,purpose&user_id=eq.${encodeURIComponent(userId)}&date=gte.${todayText}&order=date.asc,start_time.asc`
    const response = await fetch(url, {
      headers: {
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Supabase 예약 조회 실패: ${response.status}`)
    }

    const reservations = await response.json()
    return reservations.filter((reservation) =>
      typeof reservation.date === 'string' && reservation.date >= todayText
    )
  }

  async function fetchRoomStatus() {
    const response = await fetch(`${getFunctionsBaseUrl()}/api/rooms`)
    if (!response.ok) {
      throw new Error(`스터디룸 상태 조회 실패: ${response.status}`)
    }
    return response.json()
  }

  async function fetchUserPenalties() {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseServiceRoleKey || !userId) {
      return []
    }

    const url = `${supabaseUrl}/rest/v1/penalties?select=reason,created_at,points&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`
    const response = await fetch(url, {
      headers: {
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Supabase 패널티 조회 실패: ${response.status}`)
    }

    return response.json()
  }

  function toKoreaDateText(offsetDays = 0) {
    const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
    return `${values.year}-${values.month}-${values.day}`
  }

  function parseTime(period, hourText, koreanMinuteText, colonMinuteText) {
    let hour = Number(hourText)
    const minute = Number(koreanMinuteText ?? colonMinuteText ?? 0)
    if (period === '오후' && hour < 12) hour += 12
    if (period === '오전' && hour === 12) hour = 0
    if (hour > 23 || minute > 59) return null
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }

  function extractAvailabilityRequest(texts) {
    const combined = texts.filter(Boolean).join(' ')
    const roomMatch = combined.match(/(?:스터디룸|study\s*room|room|방)\s*([A-D])|\b([A-D])\s*(?:룸|방|room)/i)
    const roomCode = (roomMatch?.[1] || roomMatch?.[2] || '').toUpperCase()
    const roomId = { A: 1, B: 2, C: 3, D: 4 }[roomCode]
    if (!roomId) return null

    const exactDate = combined.match(/\b(20\d{2}-\d{1,2}-\d{1,2})\b/)
    const relativeDate = combined.match(/오늘|내일|모레|글피/)
    const relativeOffsets = { 오늘: 0, 내일: 1, 모레: 2, 글피: 3 }
    const date = exactDate
      ? exactDate[1]
      : relativeDate
        ? toKoreaDateText(relativeOffsets[relativeDate[0]])
        : null

    const timeMatches = [...combined.matchAll(/(오전|오후)?\s*(\d{1,2})(?:시\s*(\d{1,2})분?|:(\d{2}))/gi)]
    const times = timeMatches
      .map((match) => parseTime(match[1], match[2], match[3], match[4]))
      .filter(Boolean)
      .slice(0, 2)

    if (!date || times.length < 2) return null
    return { roomId, date, startTime: times[0], endTime: times[1] }
  }

  async function fetchAvailability(request) {
    const url = new URL(`${getFunctionsBaseUrl()}/api/availability`)
    Object.entries(request).forEach(([key, value]) => url.searchParams.set(key, value))
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`예약 가능 여부 조회 실패: ${response.status}`)
    }
    return response.json()
  }

  try {
    let reservationContext = ''
    let userReservations = null
    try {
      const reservations = await fetchUserReservations()
      userReservations = reservations
      if (reservations === null) {
        reservationContext = '\n사용자의 오늘 이후 예약(Supabase): 조회 불가 (로그인 사용자 또는 서버 DB 설정 확인 필요). 예약 정보를 추측하거나 추가 식별 정보를 묻지 않는다.\n'
      } else if (reservations.length === 0) {
        reservationContext = '\n사용자의 오늘 이후 예약(Supabase): 예약 기록 없음\n'
      } else {
        reservationContext = `\n사용자의 오늘 이후 예약(Supabase):\n${reservations
          .map((reservation) => `- ${formatRoomName(reservation.room_id)} | ${reservation.date} ${reservation.start_time}~${reservation.end_time} | 상태: ${reservation.status} | 인원: ${reservation.members_count ?? '정보 없음'} | 목적: ${reservation.purpose || '정보 없음'}`)
          .join('\n')}\n`
      }
    } catch (error) {
      reservationContext = '\n사용자의 오늘 이후 예약(Supabase): 조회 실패. 예약 정보를 추측하거나 추가 식별 정보를 묻지 말고 현재 조회할 수 없다고 안내한다.\n'
      console.warn('AI 도우미가 Supabase 예약 데이터를 읽지 못했어요.', error.message)
    }

    const isReservationListQuestion = /(?:내|제|나의)\s*예약\s*(?:내역|목록|상태|현황)|남은\s*예약/i.test(message)
    if (isReservationListQuestion) {
      const roomNames = { 1: 'A룸', 2: 'B룸', 3: 'C룸', 4: 'D룸' }
      const statusLabels = {
        pending: '승인 대기',
        approved: '승인됨',
        rejected: '거부됨',
        checked_in: '이용 중',
        completed: '이용 완료',
      }
      const reply = userReservations === null
        ? '오늘 이후 예약을 조회하지 못했어요. 로그인 상태와 서버 DB 설정을 확인한 뒤 다시 시도해 주세요.'
        : userReservations.length === 0
          ? '오늘 이후 예정된 예약이 없어요.'
          : `오늘 이후 예약 내역이에요:\n${userReservations
            .map((reservation) => `- ${roomNames[reservation.room_id] || `방 ${reservation.room_id}`} | ${reservation.date} ${reservation.start_time}~${reservation.end_time} | ${statusLabels[reservation.status] || reservation.status}`)
            .join('\n')}`

      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { reply },
      }
      return
    }

    let roomStatusContext = ''
    const isRoomStatusQuestion = /공실|사용\s*중|청소\s*중|방\s*상태|사용\s*가능/i.test(message)
    if (isRoomStatusQuestion) {
      try {
        const rooms = await fetchRoomStatus()
        roomStatusContext = `\n현재 스터디룸 상태 데이터:\n${rooms
          .map((room) => `- ${formatRoomName(room.name || room.id)}: ${room.status || '상태 미상'}`)
          .join('\n')}\n`
      } catch (error) {
        roomStatusContext = '\n현재 스터디룸 상태를 조회하지 못했으므로 공실 여부를 단정하지 않는다.\n'
        console.warn('AI 도우미가 스터디룸 상태를 읽지 못했어요.', error.message)
      }
    }

    let penaltyContext = ''
    const isPenaltyQuestion = /패널티|벌점|제재|이용\s*제한/i.test(message)
    if (isPenaltyQuestion) {
      try {
        const penalties = await fetchUserPenalties()
        const totalPoints = penalties.reduce((sum, penalty) => sum + Number(penalty.points || 0), 0)
        if (penalties.length === 0) {
          penaltyContext = '\n사용자의 실제 패널티 데이터(Supabase): 기록 없음, 누적 0점\n'
        } else {
          penaltyContext = `\n사용자의 실제 패널티 데이터(Supabase):\n- 누적 점수: ${totalPoints}점\n${penalties
            .map((penalty) => `- ${String(penalty.created_at || '').slice(0, 10)} | ${penalty.points}점 | 사유: ${penalty.reason || '사유 없음'}`)
            .join('\n')}\n`
        }
      } catch (error) {
        penaltyContext = '\n사용자의 패널티 데이터를 조회하지 못했으므로 점수나 기록을 추측하지 않는다.\n'
        console.warn('AI 도우미가 Supabase 패널티 데이터를 읽지 못했어요.', error.message)
      }
    }

    let availabilityContext = ''
    const availabilityRequest = extractAvailabilityRequest([
      ...history.filter((turn) => turn.role === 'user').map((turn) => turn.text),
      message,
    ])
    if (availabilityRequest) {
      try {
        const availability = await fetchAvailability(availabilityRequest)
        availabilityContext = `\n실제 예약 가능 여부 데이터:\n- 방: ${formatRoomName(availabilityRequest.roomId)}\n- 날짜: ${availabilityRequest.date}\n- 시간: ${availabilityRequest.startTime}~${availabilityRequest.endTime}\n- 예약 가능: ${availability.available ? '가능' : '불가능'}\n- 사유: ${availability.reason || '없음'}\n`
      } catch (error) {
        availabilityContext = '\n요청한 날짜와 시간의 예약 가능 여부를 조회하지 못했으므로 가능하다고 단정하지 않는다.\n'
        console.warn('AI 도우미가 예약 가능 여부를 읽지 못했어요.', error.message)
      }
    }

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
    const awaitingRoom = /어느\s*방|어떤\s*방|예약할\s*방|방을\s*(?:골라|선택)|룸을\s*(?:골라|선택)/i.test(lastAssistantMessage)
    const awaitingStartTime = /시작\s*시간을\s*알려주세요|현재\s*시각\s*이후의\s*시작\s*시간을\s*입력해주세요/i.test(lastAssistantMessage)
    const awaitingEndTime = /몇\s*시.*까지\s*사용할\s*거예요|종료\s*시간을\s*다시\s*입력해주세요|부터\s*시작하시는군요/i.test(lastAssistantMessage)
    const awaitingMembers = /몇\s*명이서\s*사용할\s*거예요/i.test(lastAssistantMessage)
    const awaitingPurpose = /사용\s*목적/i.test(lastAssistantMessage)
    const awaitingConfirmation = /예약 정보를 확인해주세요\./.test(lastAssistantMessage)

    let reservationStateHint = ''
    if (awaitingRoom) {
      const selectedRoomCode = getRoomCode(message)
      if (selectedRoomCode) {
        reservationStateHint = `현재 선택한 방: 스터디룸 ${selectedRoomCode} (room_id: ${ROOM_CODE_TO_ID[selectedRoomCode]}). 한 글자 입력도 방 선택으로 인식하고 방을 다시 묻지 않는다. 사용자에게는 A룸~D룸 이름만 사용한다.`
      } else {
        reservationStateHint = '현재 단계: 방 선택 대기. A룸, B룸, C룸, D룸 중 하나를 선택한다. 이미 받은 시간/인원/목적이 있어도 아직 선택하지 않은 경우에만 방을 묻는다.'
      }
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
- 학교에 스터디룸 A, B, C, D가 있다.
- 사용자가 A/a, A룸, A방, 스터디룸 A 또는 1번 방이라고 하면 같은 방으로 인식한다. B/b~D/d도 같은 규칙을 적용한다.
- JSON의 room_id는 내부 숫자 ID만 사용한다: A=1, B=2, C=3, D=4. 사용자에게는 내부 ID를 말하지 않는다.
- 대화와 예약 요약에서는 반드시 A룸, B룸, C룸, D룸으로 표시하고 study-room-N 형식은 절대 보여주지 않는다.
- 한 번에 1시간 ~ 3시간 단위로 예약 가능하다
- 예약은 담당자 승인 후 사용 가능하다
- 예약 가능 시간은 별도 운영 정책을 확인하며, 근거 없이 특정 시간을 고정해서 안내하지 않는다.

패널티 시스템:
- 룸 정리 미흡 또는 물품 훼손 시 1~10점 패널티
- 누적 10점이 되면 1주일간 예약 불가능
- 패널티 관련 질문에는 아래의 실제 Supabase 패널티 데이터만 사용하고, 데이터가 없으면 누적 0점/기록 없음으로 답한다.
- 실제 예약 가능 여부 데이터가 있으면 그 결과를 반드시 우선 사용한다. 예약 가능이 불가능이면 예약 가능하다고 말하거나 예약 JSON을 만들지 않는다.

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
- 방 선택 질문 뒤에 사용자가 A/a~D/d 한 글자만 보내도 해당 방을 선택한 것으로 처리한다.
- 사용 목적은 예시 단어로 제한하지 않는다. "발표 준비", "조별과제", "공부"처럼 자유로운 문장을 그대로 받는다.
- 사용자가 "오후 7시"처럼 단독 시간을 보내면 현재 질문이 시작 시간인지 종료 시간인지 대화 흐름으로 판단한다.
- 종료 시간을 다시 입력받는 단계에서는 단독 시간을 종료 시간으로 반영하고 같은 질문을 반복하지 않는다.
- 종료 시간이 시작 시간보다 이르거나 같을 때만 종료 시간 재입력을 요청한다.
- 모든 정보가 모이기 전에는 예약 JSON을 만들지 않는다.
- 인원 수와 사용 목적을 포함한 필수 정보가 모두 모이기 전에는 예약 요약이나 확인 질문을 하지 않는다.
- 모든 정보가 모이면 "인원: 숫자명", "사용 목적: 내용" 형식으로 요약을 한 번만 보여주고 "예"라고 답했을 때만 예약 JSON을 만든다.

내 예약 조회 규칙:
- 사용자가 본인의 예약 내역이나 예약 상태를 물으면 아래의 실제 Supabase 오늘 이후 예약을 목록으로 바로 보여준다.
- 조회 범위는 한국 시간 기준 오늘부터 미래 전체이며, 7일 상한은 없다. 과거 예약은 목록에서 제외한다.
- 목록에는 방, 날짜, 시간, 승인 상태를 포함하고 데이터가 있으면 인원과 사용 목적도 함께 알려준다.
- 본인 확인에는 이미 전달된 사용자 ID를 사용하므로 방 이름, 날짜, 시간 등 추가 식별 정보를 다시 요구하지 않는다.
- 데이터가 예약 기록 없음으로 표시되면 기록이 없다고 답한다. 조회 불가로 표시되면 현재 조회할 수 없다고 분명히 말하고 예약 내용을 추측하지 않는다.

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
    "room_id": 1
   }
3. JSON 응답이 아닌 경우는 일반 한국어로 답변한다
  4. 예약 완료 후 확인 메시지를 친절하게 전달한다

추가 규칙:
- ${reservationStateHint || '현재 예약 단계를 대화 이력으로 추론하고, 이미 받은 정보는 다시 묻지 않는다.'}
- ${timeReplyRule}
- 종료 시간은 시작 시간보다 늦어야 하지만, 사용자가 수정 답변을 보냈다면 그 시간 값을 먼저 반영하고 나서만 검증한다.
- 같은 질문을 연속해서 반복하지 말고, 방금 받은 답이 어느 칸에 들어가는지 먼저 판단한다.

${reservationContext}${roomStatusContext}${penaltyContext}${availabilityContext}\n${conversationContext}사용자: ${message}`

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

    const isReservationConfirmation = /이대로.{0,15}예약|예약을\s*진행할까요|예.{0,12}답해주세요/i.test(reply)
    if (!reservationData && isReservationConfirmation) {
      const missingQuestions = []
      const hasMemberCount = /(?:\b\d+\s*명\b|(?:인원|몇\s*명)\s*[:：]?\s*\d+)/i.test(reply)
      const purposeMatch = reply.match(/(?:사용\s*목적|목적)\s*[:：]\s*([^\n]+)/i)
      const hasPurpose = purposeMatch && !/^(?:미입력|정보\s*없음|없음|미정)\s*$/i.test(purposeMatch[1].trim())

      if (!hasMemberCount) missingQuestions.push('몇 명이서 사용할 거예요?')
      if (!hasPurpose) missingQuestions.push('사용 목적을 알려주세요.')
      if (missingQuestions.length > 0) {
        reply = `예약을 진행하기 전에 ${missingQuestions.join(' ')}`
      }
    }

    // 예약 JSON이면 실제로 /api/reserve 호출
    if (reservationData) {
      const missingQuestions = []
      if (!reservationData.room_id) missingQuestions.push('어느 방을 예약하시겠어요?')
      if (!reservationData.date) missingQuestions.push('예약 날짜를 알려주세요.')
      if (!reservationData.start_time) missingQuestions.push('시작 시간을 알려주세요.')
      if (!reservationData.end_time) missingQuestions.push('종료 시간을 알려주세요.')

      const membersCount = Number(reservationData.members_count)
      if (!Number.isInteger(membersCount) || membersCount < 1) {
        missingQuestions.push('몇 명이서 사용할 거예요?')
      } else {
        reservationData.members_count = membersCount
      }

      if (typeof reservationData.purpose !== 'string' || !reservationData.purpose.trim()) {
        missingQuestions.push('사용 목적을 알려주세요.')
      }

      if (!userId) {
        reply = '로그인 정보가 확인되지 않아 예약을 진행할 수 없어요. 새로고침 후 로그인 상태를 확인해주세요.'
      } else if (missingQuestions.length > 0) {
        reply = `예약을 진행하려면 ${missingQuestions.join(' ')}`
      } else try {
        // Azure Functions 기본 URL (로컬: localhost:7071, 프로덕션: Azure Functions URL)
        const basePath = getFunctionsBaseUrl()
        const reserveUrl = `${basePath}/api/reserve`

        const reserveResponse = await fetch(reserveUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: reservationData.date,
            startTime: reservationData.start_time,
            endTime: reservationData.end_time,
            membersCount: reservationData.members_count,
            purpose: reservationData.purpose,
            roomId: reservationData.room_id,
            userId,
          }),
        })

        const reserveResult = await reserveResponse.json().catch(() => null)
        if (reserveResponse.ok) {
          if (!reserveResult?.reservationId) {
            reply = '⚠️ 예약 요청은 전달됐지만 확인 응답을 읽지 못했어요. 중복 예약을 피하려면 마이페이지에서 예약 내역을 먼저 확인해 주세요.'
          } else {
            reply = `✅ 예약이 완료되었습니다!\n\n예약 번호: #${reserveResult.reservationId}\n방: ${formatRoomName(reservationData.room_id)}\n날짜: ${reservationData.date}\n시간: ${reservationData.start_time} ~ ${reservationData.end_time}\n인원: ${reservationData.members_count}명\n\n상태: 담당자 승인 대기 중입니다. 승인 후 입실 버튼이 활성화됩니다.`
          }
        } else {
          const errorMessage = reserveResult?.error || `HTTP ${reserveResponse.status}: 서버에서 상세 오류를 보내지 않았어요.`
          reply = `⚠️ 예약 중 문제가 발생했습니다.\n\n이유: ${errorMessage}\n\n다시 시도하거나 담당자에게 문의해주세요.`
        }
      } catch (reserveError) {
        reply = `❌ 예약 시스템 오류: ${reserveError.message}\n\n잠시 후 다시 시도해주세요.`
      }
    }

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        reply: formatUserFacingRoomNames(reply.trim()),
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
