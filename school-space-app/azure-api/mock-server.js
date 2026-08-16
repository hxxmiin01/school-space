/**
 * 로컬 개발용 모의 AI Assistant 서버
 * 프로덕션 배포 전에 빠르게 테스트하기 위함
 * 
 * 사용:
 *   cd azure-api && node mock-server.js
 *   브라우저에서 http://localhost:7071 에 접속하면 됨
 */

const fs = require('fs')
const path = require('path')
const http = require('http')
const { Client } = require('pg')

const PORT = 7071
const mockReservations = []

const ROOM_MAP = {
  A: { roomId: 'study-room-1', roomName: '스터디룸 A' },
  B: { roomId: 'study-room-2', roomName: '스터디룸 B' },
  C: { roomId: 'study-room-3', roomName: '스터디룸 C' },
  D: { roomId: 'study-room-4', roomName: '스터디룸 D' },
}

function loadLocalSettingsEnvironment() {
  const localSettingsPath = path.join(__dirname, 'local.settings.json')
  if (!fs.existsSync(localSettingsPath)) {
    return
  }

  try {
    const file = JSON.parse(fs.readFileSync(localSettingsPath, 'utf8'))
    const values = file?.Values || {}

    for (const [key, value] of Object.entries(values)) {
      if (!process.env[key] && typeof value === 'string' && value.trim()) {
        process.env[key] = value
      }
    }
  } catch (error) {
    console.warn('⚠️ local.settings.json을 읽지 못했어요. 환경 변수 없이 메모리 모드로 실행합니다.', error.message)
  }
}

loadLocalSettingsEnvironment()

function getConnectionString() {
  const connectionString = process.env.AZURE_POSTGRES_CONNECTION_STRING
  if (!connectionString) {
    return null
  }

  if (connectionString.includes('<') || connectionString.includes('>') || connectionString.startsWith('mock://')) {
    return null
  }

  return connectionString
}

function createClient() {
  const connectionString = getConnectionString()
  if (!connectionString) {
    return null
  }

  return new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })
}

async function withDbClient(handler) {
  const client = createClient()
  if (!client) {
    return null
  }

  await client.connect()
  try {
    return await handler(client)
  } finally {
    await client.end()
  }
}

function toRoomName(roomId) {
  switch (roomId) {
    case 'study-room-1':
      return '스터디룸 A'
    case 'study-room-2':
      return '스터디룸 B'
    case 'study-room-3':
      return '스터디룸 C'
    case 'study-room-4':
      return '스터디룸 D'
    default:
      return '스터디룸'
  }
}

function normalizeRoomId(roomId) {
  return String(roomId || '').trim()
}

function getKoreaDateParts(referenceDate = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = formatter.formatToParts(referenceDate)
  const result = {}

  for (const part of parts) {
    if (part.type !== 'literal') {
      result[part.type] = part.value
    }
  }

  return {
    year: result.year,
    month: result.month,
    day: result.day,
  }
}

function addKoreaDays(offsetDays) {
  const today = getKoreaDateParts()
  const base = new Date(Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day)))
  base.setUTCDate(base.getUTCDate() + offsetDays)
  return getKoreaDateParts(base)
}

function resolveRelativeKoreanDate(text) {
  const relativeMatch = text.match(/오늘|내일|모레|글피/)
  if (!relativeMatch) {
    return null
  }

  const keyword = relativeMatch[0]
  const offsetMap = {
    오늘: 0,
    내일: 1,
    모레: 2,
    글피: 3,
  }

  const offsetDays = offsetMap[keyword]
  if (offsetDays === undefined) {
    return null
  }

  return addKoreaDays(offsetDays)
}

function extractLastRelativeKoreanDate(texts = []) {
  for (let index = texts.length - 1; index >= 0; index -= 1) {
    const resolved = resolveRelativeKoreanDate(texts[index])
    if (resolved) {
      return resolved
    }
  }

  return null
}

function extractRoomCodeFromText(text, allowSingleLetter = false) {
  if (!text) return null

  const normalized = String(text).replace(/\s+/g, '')

  const explicit = normalized.match(/(?:스터디룸|studyroom|room|방)\s*([abcd])(?:룸|방|room)?|([abcd])\s*(?:룸|방|room)/i)
  if (explicit) {
    return (explicit[1] || explicit[2]).toUpperCase()
  }

  const onlyLetter = allowSingleLetter ? normalized.match(/^([abcd])$/i) : null
  if (onlyLetter) {
    return onlyLetter[1].toUpperCase()
  }

  return null
}

function findLastConfirmedRoomFromHistory(history) {
  const roomPromptPattern = /어느\s*방을\s*예약하시겠어요|예약할\s*방\s*정보가\s*필요|예약\s*할\s*방이\s*필요/i

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index]
    if (entry.role !== 'user') {
      continue
    }

    const explicitRoom = extractRoomCodeFromText(entry.text, false)
    if (explicitRoom && /(?:룸|방|room)/i.test(String(entry.text))) {
      return explicitRoom
    }

    const previousAssistant = history[index - 1]
    if (previousAssistant?.role === 'assistant' && roomPromptPattern.test(previousAssistant.text || '')) {
      const singleLetterRoom = extractRoomCodeFromText(entry.text, true)
      if (singleLetterRoom) {
        return singleLetterRoom
      }
    }
  }

  return null
}

function normalizeReservationRow(row) {
  return {
    id: row.id ?? row.reservationId,
    reservationId: row.id,
    room_id: row.room_id,
    user_id: row.user_id,
    date: row.date,
    start_time: row.start_time,
    end_time: row.end_time,
    members_count: row.members_count,
    purpose: row.purpose,
    status: row.status,
    survey_done: row.survey_done ?? false,
    rooms: { name: row.room_name || toRoomName(row.room_id) },
  }
}

async function listReservations(userId) {
  const dbReservations = await withDbClient(async (client) => {
    const params = []
    const whereClause = userId ? 'WHERE r.user_id = $1' : ''
    if (userId) {
      params.push(userId)
    }

    const result = await client.query(
      `
      SELECT
        r.id,
        r.room_id,
        r.user_id,
        r.date,
        r.start_time,
        r.end_time,
        r.members_count,
        r.purpose,
        r.status,
        COALESCE(r.survey_done, false) AS survey_done,
        ro.name AS room_name
      FROM reservations r
      JOIN rooms ro ON ro.id = r.room_id
      ${whereClause}
      ORDER BY r.date DESC, r.start_time DESC
      `,
      params
    )

    return result.rows.map(normalizeReservationRow)
  })

  if (dbReservations) {
    return dbReservations
  }

  return userId
    ? mockReservations.filter((reservation) => reservation.user_id === userId)
    : mockReservations
}

async function updateRoomStatusRecord(roomId, newStatus) {
  const normalizedRoomId = normalizeRoomId(roomId)

  const dbResult = await withDbClient(async (client) => {
    const result = await client.query(
      `
      UPDATE rooms
      SET status = $1
      WHERE id::text = $2 OR name = $3
      RETURNING id, name, status
      `,
      [newStatus, normalizedRoomId, toRoomName(normalizedRoomId)]
    )

    if (result.rowCount === 0) {
      const error = new Error('방을 찾을 수 없어요.')
      error.statusCode = 404
      throw error
    }

    return result.rows[0]
  })

  if (dbResult) {
    return dbResult
  }

  return {
    id: normalizedRoomId,
    name: toRoomName(normalizedRoomId),
    status: newStatus,
  }
}

async function createReservationRecord(data) {
  const dbResult = await withDbClient(async (client) => {
    if (!data.userId) {
      throw new Error('userId가 필요합니다.')
    }

    const availabilityResult = await client.query(
      `
      SELECT COUNT(*) as conflict_count
      FROM reservations
      WHERE room_id = $1
        AND date = $2
        AND status IN ('approved', 'pending')
        AND start_time < $4
        AND end_time > $3
      `,
      [data.room_id, data.date, data.start_time, data.end_time]
    )

    const conflictCount = parseInt(availabilityResult.rows[0].conflict_count, 10)
    if (conflictCount > 0) {
      const error = new Error('해당 시간대는 이미 예약되어 있습니다.')
      error.statusCode = 409
      throw error
    }

    const penaltyResult = await client.query(
      `
      SELECT COALESCE(SUM(points), 0) as total_penalty
      FROM penalties
      WHERE user_id = $1
        AND DATE(created_at) > CURRENT_DATE - INTERVAL '7 days'
      `,
      [data.userId]
    )

    const totalPenalty = parseInt(penaltyResult.rows[0].total_penalty, 10)
    if (totalPenalty >= 10) {
      const error = new Error('누적 패널티가 10점 이상이어서 1주일간 예약이 제한됩니다.')
      error.statusCode = 403
      error.totalPenalty = totalPenalty
      throw error
    }

    const insertResult = await client.query(
      `
      INSERT INTO reservations (room_id, user_id, date, start_time, end_time, members_count, purpose, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())
      RETURNING id
      `,
      [data.room_id, data.userId, data.date, data.start_time, data.end_time, data.members_count, data.purpose]
    )

    return {
      reservationId: insertResult.rows[0].id,
      reservation: {
        id: insertResult.rows[0].id,
        roomId: data.room_id,
        userId: data.userId,
        date: data.date,
        startTime: data.start_time,
        endTime: data.end_time,
        membersCount: data.members_count,
        purpose: data.purpose,
        status: 'pending',
      },
    }
  })

  if (dbResult) {
    return dbResult
  }

  const reservationId = `RES-${Date.now()}`
  const reservation = {
    id: reservationId,
    reservationId,
    room_id: data.room_id,
    user_id: data.userId || null,
    date: data.date,
    start_time: data.start_time,
    end_time: data.end_time,
    members_count: data.members_count,
    purpose: data.purpose,
    status: 'pending',
    survey_done: false,
  }
  mockReservations.push(reservation)

  return {
    reservationId,
    reservation: {
      id: reservationId,
      roomId: data.room_id,
      userId: data.userId || null,
      date: data.date,
      startTime: data.start_time,
      endTime: data.end_time,
      membersCount: data.members_count,
      purpose: data.purpose,
        status: 'pending',
        surveyDone: false,
    },
  }
}

const RESERVATION_SYSTEM_PROMPT = `
[예약 시스템 프롬프트]
- 예약 완료에 필요한 필수 정보는 5가지다: 예약 날짜, 시작 시간, 종료 시간, 사용 인원, 방 이름.
- 사용자의 한 번의 입력과 이전 대화 전체에서 파악할 수 있는 정보는 즉시 추출해서 내부적으로 기억한다.
- 이미 파악한 정보는 절대로 다시 묻지 말고, 아직 비어 있는 정보만 자연스럽게 질문한다.
- 사용자가 한 번에 여러 정보를 함께 입력하면 그 안의 날짜, 시간, 인원, 방 이름을 모두 추출한 뒤 누락된 정보만 묻는다.
- 질문은 대본처럼 고정된 순서대로 읽지 말고, 현재까지 확보된 정보에 따라 가장 먼저 빠진 항목만 물어본다.
- 사용자가 "2", "2명", "A룸", "내일", "모레", "오후 2시"처럼 단답형으로 답해도 직전 질문의 문맥을 반영해 해당 칸을 채운다.
- 방 이름은 "A룸", "a방", "A방", "a 룸", "A 룸"처럼 말해도 모두 같은 방으로 인식한다.
- 사용 목적은 예시 단어만이 아니라 "발표 준비", "조별과제", "면접 연습", "자습"처럼 자연스러운 한두 문장도 그대로 받아들인다.
- 날짜는 한국 시간(Asia/Seoul) 기준으로 해석하고, "오늘", "내일", "모레", "글피" 같은 상대 날짜를 들으면 그날짜를 실제 숫자 날짜로 바꿔서 이해한다.
- 이미 받은 정보를 다시 묻거나, 방금 입력한 내용을 또 확인하는 방식은 피한다.
- 모든 정보가 모이면 예약 요약을 한 번만 확인하고, 사용자가 "예"라고 답했을 때만 예약을 생성한다.
- 입력 의미가 정말 모호할 때만 재확인한다. 예: "입력하신 'OO'이 인원수를 의미하는 게 맞으신가요?"
`.trim()

// 모의 응답 함수
function handleAssistantRequest(body) {
  const message = body?.message || ''
  const history = body?.history || []
  const userId = body?.userId || body?.user_id || null
  const trimmedMessage = message.trim()

  console.log(`📨 사용자 메시지: "${message}"`)
  console.log(`📌 예약 정책 적용 중: ${RESERVATION_SYSTEM_PROMPT.split('\n')[0]}`)

  // 실제 예약 행동을 나타내는 키워드 (명령형, 요청형)
  const hasReservationKeyword = /예약/i.test(trimmedMessage)
  const hasExplicitReservationAction = /예약해줄|예약해달라|예약해주|예약하고|예약하기|예약을 부탁|예약 부탁|예약하고 싶|^예약$|방\s*예약|방\s*예약하고\s*싶어/i.test(trimmedMessage)
  
  // 정보 질문 패턴 (공실/가능 여부 확인)
  const isInfoQuestion = /가능|있나|있어|어디|어느|빈|공실|비어|상태|현황|확인|알려/i.test(message)

  // "방 예약" 같은 짧은 입력은 예약 의도로 간주 (단, 정보성 질문은 제외)
  const isActionReservation = hasExplicitReservationAction || (hasReservationKeyword && !isInfoQuestion)
  
  // 새로운 예약이 시작되는 경우, 이전 메시지를 무시하고 현재 메시지만 사용
  let allUserMessages
  if (isActionReservation) {
    // 새로운 예약 시작: 현재 메시지만 사용
    allUserMessages = message
  } else if (history.length > 0) {
    // 이어지는 대화: history + 현재 메시지
    allUserMessages = history
      .filter(h => h.role === 'user')
      .map(h => h.text)
      .join(' ') + ' ' + message
  } else {
    // history 없음: 현재 메시지만
    allUserMessages = message
  }

  console.log(`📝 수집된 전체 사용자 메시지: "${allUserMessages}"`)

  // 대화 이력에서 이전에 예약 요청이 있었는지 확인
  const hasReservationContext = history.some(h => h.role === 'user' && /예약/i.test(h.text))
  const lastAssistantMessage = [...history].reverse().find(h => h.role === 'assistant')?.text || ''
  const assistantMessages = [...history].filter(h => h.role === 'assistant').map(h => h.text || '')
  const lastAssistantStartEndMessage = [...assistantMessages]
    .reverse()
    .find(text => /(\d{1,2}:\d{2})부터\s*(\d{1,2}:\d{2})까지/.test(text)) || ''
  const lastAssistantPurposeMessage = [...assistantMessages]
    .reverse()
    .find(text => /목적:\s*/.test(text)) || ''
  const isAwaitingReservationConfirmation = /예약 정보를 확인해주세요\./.test(lastAssistantMessage)
  const isConfirmYes = /^(예|네|응|맞아|맞아요|맞습니다|확인|좋아요|ok|okay|ㅇㅇ)$/i.test(trimmedMessage)
  const isConfirmNo = /^(아니|아니요|아뇨|틀렸|수정|다시)$/i.test(trimmedMessage)
  const isAwaitingRoom = /어느\s*방을\s*예약하시겠어요|예약할\s*방\s*정보가\s*필요|예약\s*할\s*방이\s*필요/i.test(lastAssistantMessage)
  const isAwaitingStartTime = /시작\s*시간을\s*알려주세요|현재\s*시각\s*이후의\s*시작\s*시간을\s*입력해주세요/i.test(lastAssistantMessage)
  const isAwaitingEndTime = /몇\s*시.*까지\s*사용할\s*거예요|종료\s*시간을\s*다시\s*입력해주세요|부터\s*시작하시는군요/i.test(lastAssistantMessage)
  const isAwaitingMembers = /몇\s*명이서\s*사용할\s*거예요/.test(lastAssistantMessage)
  const isAwaitingPurpose = /사용\s*목적/.test(lastAssistantMessage)

  // 정보 질문인 경우
  if (isInfoQuestion && !isActionReservation && !hasReservationContext) {
    console.log(`ℹ️  공실 확인 질문입니다.`)
    return '지금 스터디룸 4개(A, B, C, D)가 모두 공실입니다! 공간 현황 화면에서 원하는 방을 클릭하면 바로 예약할 수 있어요.'
  }

  // 예약도 정보도 아닌 기타 질문인 경우 (단, 대화 컨텍스트 무시)
  if (!isActionReservation && !isInfoQuestion && !hasReservationContext) {
    console.log(`ℹ️  기타 질문입니다.`)
    return '무엇을 도와드릴까요? 공간 현황을 확인하거나 예약을 하고 싶으시다면 알려주세요!'
  }

  // ===== 예약 프로세스 시작 =====
  console.log(`🎯 예약 프로세스 진행 중...`)

  // 예약 정보 추출
  const dateWithYearMatches = [...allUserMessages.matchAll(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)]
  const monthDayMatches = [...allUserMessages.matchAll(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)]
  const currentDateWithYearMatch = trimmedMessage.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
  const currentMonthDayMatch = trimmedMessage.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
  const currentRelativeDate = resolveRelativeKoreanDate(trimmedMessage)
  const historyRelativeDate = extractLastRelativeKoreanDate(
    history
      .filter((entry) => entry.role === 'user')
      .map((entry) => entry.text || '')
  )
  const startEndTimeMatch = allUserMessages.match(/(\d{1,2}):?(\d{2})?시.*?(\d{1,2}):?(\d{2})?시/)
  const timeMatches = allUserMessages.match(/(\d{1,2}):?(\d{2})?시/g) || []
  
  // "오전/오후" 시간 파싱 - "까지", "부터" 등의 입자를 무시
  const pmAmMatches = allUserMessages.match(/(오전|오후)\s*(\d{1,2})\s*시/g) || []
  
  // 분 단위 추출 (반, 분, 콜론)
  const minutesMatches = allUserMessages.match(/(\d{1,2})시\s*반|(\d{1,2})시\s*(\d{1,2})분|(\d{1,2}):(\d{2})/g) || []
  
  const membersMatch = allUserMessages.match(/(\d+)명/)
  const purposeMatch = allUserMessages.match(/목적.*?[:：]\s*([^\n]+)|사용.*?[:：]\s*([^\n]+)|과제|공부|스터디|프로젝트|회의|발표|준비/)

  // 분 추출 헬퍼 함수
  function extractMinutes(timeString) {
    if (!timeString) return 0
    // "2시 반" → 30
    if (timeString.includes('반')) return 30
    // "2시 30분" → 30
    const minutesMatch = timeString.match(/(\d{1,2})분/)
    if (minutesMatch) return parseInt(minutesMatch[1])
    // "14:30" → 30
    const colonMatch = timeString.match(/:(\d{2})/)
    if (colonMatch) return parseInt(colonMatch[1])
    return 0
  }

  // 현재 메시지에서 시간 1개를 시작 시간으로 안전하게 파싱
  function parseSingleTimeFromText(text) {
    if (!text) return null

    const pmAm = text.match(/(오전|오후)\s*(\d{1,2})\s*시(?:\s*(반|\d{1,2}분))?/)
    if (pmAm) {
      const marker = pmAm[1]
      let hour = parseInt(pmAm[2])
      if (marker === '오후' && hour < 12) hour += 12
      if (marker === '오전' && hour === 12) hour = 0
      const minutes = extractMinutes(pmAm[0])
      return `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    }

    const plain = text.match(/(\d{1,2})(?::(\d{2}))?\s*시(?:\s*(반|\d{1,2}분))?/)
    if (plain) {
      const hour = parseInt(plain[1])
      const minutes = extractMinutes(plain[0])
      return `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    }

    return null
  }

  // 디버그 로그
  console.log(`📋 정규식 결과:`)
  console.log(`   pmAmMatches: ${JSON.stringify(pmAmMatches)}`)
  console.log(`   timeMatches: ${JSON.stringify(timeMatches)}`)
  console.log(`   minutesMatches: ${JSON.stringify(minutesMatches)}`)

  // 날짜 추출
  let year = null
  let month = null
  let day = null

  // 방 추출
  let roomCode = null
  roomCode = extractRoomCodeFromText(trimmedMessage, isAwaitingRoom)

  if (!roomCode) {
    roomCode = findLastConfirmedRoomFromHistory(history)

    if (roomCode) {
      console.log(`✓ 방 히스토리 복원 인식: ${roomCode}룸`)
    }
  }

  const roomMap = {
    A: { roomId: 'study-room-1', roomName: '스터디룸 A' },
    B: { roomId: 'study-room-2', roomName: '스터디룸 B' },
    C: { roomId: 'study-room-3', roomName: '스터디룸 C' },
    D: { roomId: 'study-room-4', roomName: '스터디룸 D' },
  }

  const lastDateWithYearMatch = dateWithYearMatches.length > 0
    ? dateWithYearMatches[dateWithYearMatches.length - 1]
    : null
  const lastMonthDayMatch = monthDayMatches.length > 0
    ? monthDayMatches[monthDayMatches.length - 1]
    : null

  // 날짜는 현재 입력 메시지를 최우선으로 사용 (이전 히스토리 날짜 오염 방지)
  if (currentRelativeDate) {
    year = currentRelativeDate.year
    month = currentRelativeDate.month
    day = currentRelativeDate.day
  } else if (historyRelativeDate) {
    year = historyRelativeDate.year
    month = historyRelativeDate.month
    day = historyRelativeDate.day
  } else if (currentDateWithYearMatch) {
    year = currentDateWithYearMatch[1]
    month = String(currentDateWithYearMatch[2]).padStart(2, '0')
    day = String(currentDateWithYearMatch[3]).padStart(2, '0')
  } else if (currentMonthDayMatch) {
    year = String(new Date().getFullYear())
    month = String(currentMonthDayMatch[1]).padStart(2, '0')
    day = String(currentMonthDayMatch[2]).padStart(2, '0')
  }
  // 현재 입력에 날짜가 없으면, 대화에서 가장 마지막에 언급된 날짜를 사용
  else if (lastDateWithYearMatch && lastMonthDayMatch) {
    if (lastDateWithYearMatch.index >= lastMonthDayMatch.index) {
      year = lastDateWithYearMatch[1]
      month = String(lastDateWithYearMatch[2]).padStart(2, '0')
      day = String(lastDateWithYearMatch[3]).padStart(2, '0')
    } else {
      year = String(new Date().getFullYear())
      month = String(lastMonthDayMatch[1]).padStart(2, '0')
      day = String(lastMonthDayMatch[2]).padStart(2, '0')
    }
  } else if (lastDateWithYearMatch) {
    year = lastDateWithYearMatch[1]
    month = String(lastDateWithYearMatch[2]).padStart(2, '0')
    day = String(lastDateWithYearMatch[3]).padStart(2, '0')
  } else if (lastMonthDayMatch) {
    year = String(new Date().getFullYear())
    month = String(lastMonthDayMatch[1]).padStart(2, '0')
    day = String(lastMonthDayMatch[2]).padStart(2, '0')
  }

  // 시간 추출 (오전/오후 처리)
  let startTime = null
  let endTime = null
  const isSingleEndTimeReply = isAwaitingEndTime && hasTimeInCurrentMessage && !hasRangeMarker

  // 1순위: "오후 1시", "오전 10시" 형식 (오전/오후 포함) - 가장 먼저 확인!
  if (pmAmMatches.length > 0) {
    console.log(`✓ 1순위 (pmAmMatches) 실행됨. pmAmMatches.length = ${pmAmMatches.length}`)
    const times = pmAmMatches.map((match, idx) => {
      // match = "오후 2시" 또는 "오후2시"
      const pmAmMatch = match.match(/(오전|오후)/)
      const hourMatch = match.match(/(\d{1,2})/)
      
      if (!pmAmMatch || !hourMatch) return null
      
      const pmAm = pmAmMatch[1]
      const hour = parseInt(hourMatch[1])
      let adjustedHour = hour
      
      if (pmAm === '오후' && hour < 12) {
        adjustedHour = hour + 12
      } else if (pmAm === '오전' && hour === 12) {
        adjustedHour = 0
      }
      
      // 분 추출: pmAmMatches와 대응하는 minutesMatches에서 가져오기
      let minutes = 0
      if (idx < minutesMatches.length) {
        minutes = extractMinutes(minutesMatches[idx])
      } else if (allUserMessages.includes(match)) {
        // minutesMatches가 없으면 match 문자열 근처에서 분을 찾기
        const regex = new RegExp(match.replace(/\s+/g, '\\s*') + '\\s*(반|\\d{1,2}분|:\\d{2})?')
        const fullMatch = allUserMessages.match(regex)
        if (fullMatch) {
          minutes = extractMinutes(fullMatch[0])
        }
      }
      
      return { hour: adjustedHour, minutes }
    }).filter(t => t !== null)
    
    if (times.length >= 2) {
      startTime = `${String(times[0].hour).padStart(2, '0')}:${String(times[0].minutes).padStart(2, '0')}`
      endTime = `${String(times[1].hour).padStart(2, '0')}:${String(times[1].minutes).padStart(2, '0')}`
    } else if (times.length === 1 && timeMatches.length >= 2) {
      // "오후 2시부터 4시까지" 또는 "오후 2시 반부터 4시 15분까지" 형식
      const lastPmAmMatch = pmAmMatches[pmAmMatches.length - 1].match(/(오전|오후)/)
      const lastPmAm = lastPmAmMatch[1]
      
      // timeMatches에서 숫자만 추출
      const additionalHours = timeMatches.map(t => {
        const match = t.match(/(\d{1,2})/)
        return match ? parseInt(match[1]) : NaN
      }).filter(h => !isNaN(h))
      
      if (additionalHours.length >= 2) {
        let startHour = additionalHours[0]
        let endHour = additionalHours[1]
        let startMinutes = times[0].minutes
        let endMinutes = extractMinutes(timeMatches[1] || '') // 두 번째 시간의 분
        
        // 오전/오후 적용
        if (lastPmAm === '오후' && startHour < 12) {
          startHour += 12
        } else if (lastPmAm === '오전' && startHour === 12) {
          startHour = 0
        }
        
        if (lastPmAm === '오후' && endHour < 12) {
          endHour += 12
        } else if (lastPmAm === '오전' && endHour === 12) {
          endHour = 0
        }
        
        startTime = `${String(startHour).padStart(2, '0')}:${String(startMinutes).padStart(2, '0')}`
        endTime = `${String(endHour).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`
      } else {
        startTime = `${String(times[0].hour).padStart(2, '0')}:${String(times[0].minutes).padStart(2, '0')}`
        endTime = null
      }
    } else if (times.length === 1) {
      // 종료 시간만 다시 받는 단계에서는 현재 메시지의 단일 시간을 종료 시간으로만 본다.
      if (isSingleEndTimeReply) {
        endTime = `${String(times[0].hour).padStart(2, '0')}:${String(times[0].minutes).padStart(2, '0')}`
      } else {
        // 한 개의 오전/오후 시간만 있는 경우 → 아직 종료 시간 미입력
        startTime = `${String(times[0].hour).padStart(2, '0')}:${String(times[0].minutes).padStart(2, '0')}`
        endTime = null
      }
    }
  }
  // 2순위: "14시부터 16시까지" 형식 (일반 숫자 시간)
  else if (startEndTimeMatch) {
    console.log(`✓ 2순위 (startEndTimeMatch) 실행됨: ${startEndTimeMatch}`)
    const startHour = String(startEndTimeMatch[1]).padStart(2, '0')
    const startMinute = startEndTimeMatch[2] ? String(startEndTimeMatch[2]).padStart(2, '0') : '00'
    const endHour = String(startEndTimeMatch[3]).padStart(2, '0')
    const endMinute = startEndTimeMatch[4] ? String(startEndTimeMatch[4]).padStart(2, '0') : '00'
    
    startTime = `${startHour}:${startMinute}`
    endTime = `${endHour}:${endMinute}`
    console.log(`✓ 2순위 (startEndTimeMatch) 실행됨: ${startTime} ~ ${endTime}`)
  } 
  // 3순위: "14시 16시" 형식 (숫자만, 오전/오후 없음)
  else if (timeMatches.length >= 2) {
    console.log(`✓ 3순위 (timeMatches >= 2) 실행됨. timeMatches.length = ${timeMatches.length}`)
    const times = timeMatches.map((t, idx) => {
      const match = t.match(/(\d{1,2})/)
      const hour = match ? parseInt(match[1]) : NaN
      
      // 분 추출
      let minutes = 0
      if (idx < minutesMatches.length) {
        minutes = extractMinutes(minutesMatches[idx])
      } else if (t) {
        minutes = extractMinutes(t)
      }
      
      return !isNaN(hour) ? { hour, minutes } : null
    }).filter(t => t !== null)
    
    if (times.length >= 2) {
      startTime = `${String(times[0].hour).padStart(2, '0')}:${String(times[0].minutes).padStart(2, '0')}`
      endTime = `${String(times[1].hour).padStart(2, '0')}:${String(times[1].minutes).padStart(2, '0')}`
    }
  } 
  // 4순위: "14시" 한 개만 (시작 시간만)
  else if (timeMatches.length === 1) {
    console.log(`✓ 4순위 (timeMatches === 1) 실행됨`)
    const match = timeMatches[0].match(/(\d{1,2})/)
    if (match) {
      const hour = parseInt(match[1])
      const minutes = extractMinutes(timeMatches[0])
      if (isSingleEndTimeReply) {
        endTime = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
      } else {
        startTime = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
        endTime = null
      }
    }
  }

  // 시간은 대화 전체를 재파싱하면 이전 입력이 섞일 수 있으므로,
  // 이미 안내한 최신 확정 문구가 있으면 그 값을 우선 고정한다.
  const lastStartEndPromptMatch =
    (lastAssistantMessage.match(/(\d{1,2}:\d{2})부터\s*(\d{1,2}:\d{2})까지/) ||
      lastAssistantStartEndMessage.match(/(\d{1,2}:\d{2})부터\s*(\d{1,2}:\d{2})까지/))
  if (lastStartEndPromptMatch) {
    if (isAwaitingMembers || isAwaitingPurpose || isAwaitingReservationConfirmation) {
      startTime = lastStartEndPromptMatch[1]
      endTime = lastStartEndPromptMatch[2]
      console.log(`✓ 단계 고정 시간 복원: ${startTime} ~ ${endTime}`)
    }
  }

  // 목적 추출: 현재 질문 단계에서는 사용자의 현재 입력을 그대로 목적로 인정
  let purpose = null
  if (isAwaitingPurpose) {
    const trimmedPurpose = trimmedMessage.trim()
    const isConfirmOnly = /^(예|네|응|맞아|맞아요|맞습니다|확인|좋아요|ok|okay|ㅇㅇ)$/i.test(trimmedPurpose)

    if (!isConfirmOnly) {
      const colonPurpose = trimmedPurpose.match(/^(?:목적|사용\s*목적)\s*[:：]\s*(.+)$/i)
      purpose = (colonPurpose ? colonPurpose[1] : trimmedPurpose).trim()
    }
  } else if (isAwaitingReservationConfirmation) {
    const confirmedPurposeMatch = lastAssistantPurposeMessage.match(/목적:\s*([^\n]+)/)
    if (confirmedPurposeMatch) {
      purpose = confirmedPurposeMatch[1].trim()
    }
  }

  // 인원 추출
  let members = membersMatch ? parseInt(membersMatch[1]) : null

  function parseKoreanMemberCount(text) {
    if (!text) return null
    const normalized = text.replace(/\s+/g, '')

    const wordMap = {
      '한': 1, '하나': 1, '일': 1,
      '두': 2, '둘': 2, '이': 2,
      '세': 3, '셋': 3, '삼': 3,
      '네': 4, '넷': 4, '사': 4,
      '다섯': 5, '오': 5,
      '여섯': 6, '육': 6,
      '일곱': 7, '칠': 7,
      '여덟': 8, '팔': 8,
      '아홉': 9, '구': 9,
      '열': 10, '십': 10,
    }

    const directWord = normalized.match(/^(한|하나|일|두|둘|이|세|셋|삼|네|넷|사|다섯|오|여섯|육|일곱|칠|여덟|팔|아홉|구|열|십)명?$/)
    if (directWord) {
      return wordMap[directWord[1]] ?? null
    }

    const containedWord = normalized.match(/(한|하나|일|두|둘|이|세|셋|삼|네|넷|사|다섯|오|여섯|육|일곱|칠|여덟|팔|아홉|구|열|십)명/)
    if (containedWord) {
      return wordMap[containedWord[1]] ?? null
    }

    return null
  }

  // 현재 메시지에 시간이 1개만 있고 범위 표현이 없으면, 대화 단계에 맞게 보정
  // - 시작 시간 단계: 단일 시간을 시작 시간으로 처리
  // - 종료 시간 단계: 단일 시간을 종료 시간으로 처리
  // (히스토리 시간과 합쳐져 시작/종료가 바뀌는 문제 방지)
  const currentTimeCount = (message.match(/(\d{1,2}):?(\d{2})?시/g) || []).length
  const hasRangeMarker = /(부터|까지|~|-)\s*/.test(message)
  const hasTimeInCurrentMessage = /(\d{1,2}):?(\d{2})?\s*시/.test(message)
  const previousStartMatch = lastAssistantMessage.match(/(\d{1,2}:\d{2})부터 시작/)

  // 종료 시간 입력 단계에서는 현재 메시지의 시간만 종료 시간으로 인정한다.
  // (히스토리 시간 재조합으로 22:00~23:00 같은 잘못된 값이 생기는 문제 방지)
  if (isAwaitingEndTime) {
    if (previousStartMatch) {
      startTime = previousStartMatch[1]
    }

    if (hasTimeInCurrentMessage && !hasRangeMarker) {
      const correctedEnd = parseSingleTimeFromText(message)
      if (correctedEnd) {
        endTime = correctedEnd
        console.log(`✓ 종료 시간 단계 보정: ${startTime} ~ ${endTime}`)
      }
    } else if (!hasRangeMarker) {
      endTime = null
      console.log('✓ 종료 시간 단계: 시간 미입력으로 종료 시간 유지 안 함')
    }
  }

  if (currentTimeCount === 1 && !hasRangeMarker) {
    const correctedTime = parseSingleTimeFromText(message)
    if (correctedTime) {
      if (isAwaitingEndTime) {
        if (hasTimeInCurrentMessage) {
          endTime = correctedTime
          console.log(`✓ 종료 시간 단일 입력 보정: ${endTime}`)
        } else {
          endTime = null
        }
      } else {
        // 기본은 시작 시간 입력으로 처리
        // (시작 시간 재입력 상황 포함)
        startTime = correctedTime
        endTime = null
        console.log(`✓ 단일 시간 입력 보정(시작 시간): ${startTime}`)
      }
    }
  }

  // 사용자가 인원 질문 단계에서 "2" 또는 "2명"처럼 짧게 답하는 경우를 처리
  // (현재 메시지만 검사해서 날짜/시간 숫자와 섞이지 않게 한다)
  if (members === null) {
    const directMembersMatch = message.match(/^\s*(\d+)\s*명?\s*$/)
    if (directMembersMatch && startTime && endTime) {
      members = parseInt(directMembersMatch[1])
      console.log(`✓ 인원 직접 입력 인식: ${members}명`)
    }
  }

  // 한글 단답 인원 입력 처리: "삼", "세 명", "두명" 등
  if (members === null && startTime && endTime) {
    const koreanMembers = parseKoreanMemberCount(message)
    if (koreanMembers !== null) {
      members = koreanMembers
      console.log(`✓ 인원 한글 입력 인식: ${members}명`)
    }
  }

  // 다음 턴(예: 목적 입력)으로 넘어왔을 때도 직전 숫자 인원 입력을 복원
  if (members === null && startTime && endTime) {
    const lastNumericUserMessage = [...history]
      .reverse()
      .find(h => h.role === 'user' && /^\s*\d+\s*명?\s*$/.test(h.text || ''))

    if (lastNumericUserMessage) {
      const matched = lastNumericUserMessage.text.match(/(\d+)/)
      if (matched) {
        members = parseInt(matched[1])
        console.log(`✓ 인원 히스토리 복원 인식: ${members}명`)
      }
    }
  }

  // 히스토리 한글 인원 복원 (예: "세 명")
  if (members === null && startTime && endTime) {
    const lastKoreanMemberMessage = [...history]
      .reverse()
      .find(h => h.role === 'user' && parseKoreanMemberCount(h.text || '') !== null)

    if (lastKoreanMemberMessage) {
      members = parseKoreanMemberCount(lastKoreanMemberMessage.text)
      console.log(`✓ 인원 한글 히스토리 복원 인식: ${members}명`)
    }
  }

  // 대화 전체에서 단독 숫자 토큰을 마지막 인원 입력으로 복원
  // 예: "... 4시까지 2 공부" -> 2명
  if (members === null && startTime && endTime) {
    const standaloneNumberMatches = [...allUserMessages.matchAll(/(?:^|\s)(\d+)(?=\s|$)/g)]
    if (standaloneNumberMatches.length > 0) {
      const lastNumber = standaloneNumberMatches[standaloneNumberMatches.length - 1][1]
      members = parseInt(lastNumber)
      console.log(`✓ 인원 대화 복원 인식: ${members}명`)
    }
  }

  // ===== 과거 날짜/시간 예약 차단 =====
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  function toDateAtTime(baseYear, baseMonth, baseDay, hhmm) {
    if (!baseYear || !baseMonth || !baseDay || !hhmm) return null
    const [hh, mm] = hhmm.split(':').map(Number)
    return new Date(Number(baseYear), Number(baseMonth) - 1, Number(baseDay), hh, mm, 0, 0)
  }

  if (year && month && day) {
    const selectedDate = new Date(Number(year), Number(month) - 1, Number(day))
    if (selectedDate < today) {
      console.log(`⛔ 과거 날짜 예약 차단: ${year}-${month}-${day}`)
      return '지난 날짜는 예약할 수 없어요. 오늘 이후 날짜로 다시 입력해주세요. 예: "8월 20일"'
    }
  }

  if (year && month && day && startTime) {
    const startDateTime = toDateAtTime(year, month, day, startTime)
    if (startDateTime && startDateTime <= now) {
      console.log(`⛔ 과거 시간 예약 차단: ${year}-${month}-${day} ${startTime}`)
      return '이미 지난 시간은 예약할 수 없어요. 현재 시각 이후의 시작 시간을 입력해주세요. 예: "오후 4시"'
    }
  }

  if (startTime && endTime) {
    const startDateTime = toDateAtTime(year, month, day, startTime)
    const endDateTime = toDateAtTime(year, month, day, endTime)
    if (startDateTime && endDateTime && endDateTime <= startDateTime) {
      console.log(`⛔ 시간 범위 오류: ${startTime} ~ ${endTime}`)
      return '종료 시간은 시작 시간보다 늦어야 해요. 종료 시간을 다시 입력해주세요. 예: "오후 5시"'
    }
  }

  // ===== 부족한 정보 확인 및 다음 질문 결정 =====
  if (!roomCode || !roomMap[roomCode]) {
    console.log(`⚠️  예약할 방 정보가 필요합니다.`)
    return '어느 방을 예약하시겠어요? 예: "A룸", "B룸", "C룸", "D룸"'
  }

  if (!year || !month || !day) {
    console.log(`⚠️  날짜 정보가 필요합니다.`)
    return `${roomMap[roomCode].roomName} 예약이군요. 날짜를 알려주세요! 예: "8월 20일"`
  }

  if (!startTime) {
    console.log(`⚠️  시작 시간이 필요합니다.`)
    return `${roomMap[roomCode].roomName} ${year}-${month}-${day} 예약이군요. 시작 시간을 알려주세요! 예: "오후 2시"`
  }

  if (!endTime) {
    console.log(`⚠️  종료 시간이 필요합니다.`)
    return `좋아요, ${startTime}부터 시작하시는군요. 몇 시까지 사용할 거예요? 예를 들어 "오후 4시까지" 또는 "4시까지"라고 말씀해주세요!`
  }

  if (members === null) {
    console.log(`⚠️  인원 수가 필요합니다.`)
    return `${startTime}부터 ${endTime}까지 사용하시는군요. 몇 명이서 사용할 거예요?`
  }

  if (!purpose) {
    console.log(`⚠️  사용 목적이 필요합니다.`)
    return `${members}명이 사용하시는군요. 사용 목적을 자유롭게 말씀해주세요. 예: 과제, 발표 준비, 조별과제, 자습, 면접 연습`
  }

  // ===== 모든 정보 수집 후 예약 확정 확인 =====
  if (!isAwaitingReservationConfirmation) {
    const datePreview = `${year}-${month}-${day}`
    return `예약 정보를 확인해주세요.\n방: ${roomMap[roomCode].roomName}\n날짜: ${datePreview}\n시간: ${startTime} ~ ${endTime}\n인원: ${members}명\n목적: ${purpose}\n\n이대로 예약할까요? "예" 또는 "아니요"라고 말씀해주세요!`
  }

  if (isAwaitingReservationConfirmation && !isConfirmYes && !isConfirmNo) {
    return '예약 확정을 위해 "예" 또는 "아니요"로 답해주세요. 수정이 필요하면 "아니요"라고 입력해 주세요.'
  }

  if (isAwaitingReservationConfirmation && isConfirmNo) {
    return '어떤 정보를 수정할까요? 날짜, 시작 시간, 종료 시간, 인원, 목적 중에서 말씀해 주세요. 예: "인원을 3명으로 바꿔줘"'
  }

  // ===== 모든 정보가 수집됨 - 예약 생성 =====
  const date = `${year}-${month}-${day}`
  const reservationJson = {
    action: 'make_reservation',
    date,
    start_time: startTime,
    end_time: endTime,
    members_count: members,
    purpose,
    room_id: roomMap[roomCode].roomId,
    user_id: userId,
  }

  console.log(`✅ 예약 정보 완성:`)
  console.log(`   날짜: ${date}`)
  console.log(`   시간: ${startTime} ~ ${endTime}`)
  console.log(`   인원: ${members}명`)
  console.log(`   목적: ${purpose}`)

  return JSON.stringify(reservationJson)
}

// HTTP 서버 생성
const server = http.createServer(async (req, res) => {
  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Content-Type', 'application/json')

  // OPTIONS 요청 처리
  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  // /api/assistant 처리
  if (req.url === '/api/assistant' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', async () => {
      try {
        const data = JSON.parse(body)
        let reply = handleAssistantRequest(data)

        // JSON 형식의 예약 요청인지 확인
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
            const reserveResponse = await fetch('http://localhost:7071/api/reserve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                date: reservationData.date,
                start_time: reservationData.start_time,
                end_time: reservationData.end_time,
                members_count: reservationData.members_count,
                purpose: reservationData.purpose,
                room_id: reservationData.room_id,
                userId: reservationData.user_id || data.userId || null,
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

        // 프론트엔드가 기대하는 응답 형식
        const response = {
          reply: reply,
        }

        res.writeHead(200)
        res.end(JSON.stringify(response))
      } catch (error) {
        console.error('❌ 오류:', error.message)
        res.writeHead(400)
        res.end(JSON.stringify({ error: error.message }))
      }
    })
    return
  }

  // /api/rooms 처리 (공간 현황)
  if (req.url === '/api/rooms' && req.method === 'GET') {
    try {
      const currentDate = new Date().toISOString().split('T')[0]
      const reservations = await listReservations()
      const mockRooms = Object.entries(ROOM_MAP).map(([code, room]) => ({
        id: room.roomId,
        name: room.roomName,
        status: reservations.some((reservation) => reservation.room_id === room.roomId && reservation.date === currentDate && reservation.status !== 'rejected') ? 'occupied' : 'available',
        room_code: code,
      }))
      res.writeHead(200)
      res.end(JSON.stringify(mockRooms))
    } catch (error) {
      console.error('❌ 오류:', error.message)
      res.writeHead(500)
      res.end(JSON.stringify({ error: error.message }))
    }
    return
  }

  // /api/reserve 처리 (예약 생성)
  if (req.url === '/api/reserve' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', async () => {
      try {
        const data = JSON.parse(body)
        console.log(`\n📝 예약 요청 수신:`)
        console.log(`   날짜: ${data.date}`)
        console.log(`   시간: ${data.start_time} ~ ${data.end_time}`)
        console.log(`   인원: ${data.members_count}명`)
        console.log(`   목적: ${data.purpose}`)
        const result = await createReservationRecord(data)
        const response = {
          success: true,
          reservationId: result.reservationId,
          reservation: result.reservation,
          message: '예약이 생성되었습니다. 담당자의 승인을 기다려주세요.',
        }

        res.writeHead(200)
        res.end(JSON.stringify(response))
        console.log(`✅ 예약 완료! 예약번호: ${result.reservationId}\n`)
      } catch (error) {
        console.error('❌ 오류:', error.message)
        res.writeHead(error.statusCode || 400)
        res.end(JSON.stringify({ error: error.message }))
      }
    })
    return
  }

  // /api/reservations 처리 (예약 목록 조회)
  if (req.url.startsWith('/api/reservations') && req.method === 'GET') {
    try {
      const requestUrl = new URL(req.url, `http://${req.headers.host}`)
      const userId = requestUrl.searchParams.get('userId')
      const reservations = await listReservations(userId)
      res.writeHead(200)
      res.end(JSON.stringify(reservations))
    } catch (error) {
      console.error('❌ 오류:', error.message)
      res.writeHead(500)
      res.end(JSON.stringify({ error: error.message }))
    }
    return
  }

  // /api/reservations/:id/survey 처리 (설문 완료 상태 변경)
  const reservationSurveyMatch = req.url.match(/^\/api\/reservations\/([^/]+)\/survey$/)
  if (reservationSurveyMatch && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', async () => {
      try {
        const reservationId = decodeURIComponent(reservationSurveyMatch[1])
        const data = JSON.parse(body || '{}')
        const surveyDone = Boolean(data.survey_done)

        const updated = await withDbClient(async (client) => {
          const numericId = Number(reservationId)
          if (!Number.isInteger(numericId)) {
            return null
          }

          const result = await client.query(
            `
            UPDATE reservations
            SET survey_done = $1
            WHERE id = $2
            RETURNING id, survey_done
            `,
            [surveyDone, numericId]
          )

          if (result.rowCount === 0) {
            const error = new Error('예약을 찾을 수 없어요.')
            error.statusCode = 404
            throw error
          }

          return { id: result.rows[0].id, survey_done: result.rows[0].survey_done }
        })

        if (updated) {
          res.writeHead(200)
          res.end(JSON.stringify({ success: true, ...updated }))
          return
        }

        const localReservation = mockReservations.find(
          (reservation) => String(reservation.id) === String(reservationId) || String(reservation.reservationId) === String(reservationId)
        )

        if (!localReservation) {
          res.writeHead(404)
          res.end(JSON.stringify({ error: '예약을 찾을 수 없어요.' }))
          return
        }

        localReservation.survey_done = surveyDone
        res.writeHead(200)
        res.end(JSON.stringify({ success: true, id: localReservation.id, survey_done: localReservation.survey_done }))
      } catch (error) {
        console.error('❌ 오류:', error.message)
        res.writeHead(error.statusCode || 400)
        res.end(JSON.stringify({ error: error.message }))
      }
    })
    return
  }

  // /api/reservations/:id/status 처리 (예약 상태 변경)
  const reservationStatusMatch = req.url.match(/^\/api\/reservations\/([^/]+)\/status$/)
  if (reservationStatusMatch && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', async () => {
      try {
        const reservationId = decodeURIComponent(reservationStatusMatch[1])
        const data = JSON.parse(body || '{}')
        const newStatus = data.status

        if (!newStatus) {
          res.writeHead(400)
          res.end(JSON.stringify({ error: 'status가 필요합니다.' }))
          return
        }

        const updated = await withDbClient(async (client) => {
          const numericId = Number(reservationId)
          if (!Number.isInteger(numericId)) {
            return null
          }

          const result = await client.query(
            `
            UPDATE reservations
            SET status = $1
            WHERE id = $2
            RETURNING id
            `,
            [newStatus, numericId]
          )

          if (result.rowCount === 0) {
            const error = new Error('예약을 찾을 수 없어요.')
            error.statusCode = 404
            throw error
          }

          return { id: result.rows[0].id, status: newStatus }
        })

        if (updated) {
          res.writeHead(200)
          res.end(JSON.stringify({ success: true, ...updated }))
          return
        }

        const localReservation = mockReservations.find(
          (reservation) => String(reservation.id) === String(reservationId) || String(reservation.reservationId) === String(reservationId)
        )

        if (!localReservation) {
          res.writeHead(404)
          res.end(JSON.stringify({ error: '예약을 찾을 수 없어요.' }))
          return
        }

        localReservation.status = newStatus
        res.writeHead(200)
        res.end(JSON.stringify({ success: true, id: localReservation.id, status: localReservation.status }))
      } catch (error) {
        console.error('❌ 오류:', error.message)
        res.writeHead(error.statusCode || 400)
        res.end(JSON.stringify({ error: error.message }))
      }
    })
    return
  }

  // /api/rooms/:id/status 처리 (방 상태 변경)
  const roomStatusMatch = req.url.match(/^\/api\/rooms\/([^/]+)\/status$/)
  if (roomStatusMatch && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', async () => {
      try {
        const roomId = decodeURIComponent(roomStatusMatch[1])
        const data = JSON.parse(body || '{}')
        const newStatus = data.status

        if (!newStatus) {
          res.writeHead(400)
          res.end(JSON.stringify({ error: 'status가 필요합니다.' }))
          return
        }

        const updated = await updateRoomStatusRecord(roomId, newStatus)
        res.writeHead(200)
        res.end(JSON.stringify({ success: true, ...updated }))
      } catch (error) {
        console.error('❌ 오류:', error.message)
        res.writeHead(error.statusCode || 400)
        res.end(JSON.stringify({ error: error.message }))
      }
    })
    return
  }

  // 다른 요청
  res.writeHead(404)
  res.end(JSON.stringify({ error: '엔드포인트를 찾을 수 없습니다' }))
})

server.listen(PORT, () => {
  console.log(`🚀 모의 AI Assistant 서버 시작`)
  console.log(`📍 http://localhost:${PORT}`)
  console.log(`\n대기 중...\n`)
})
