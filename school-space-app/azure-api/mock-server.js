/**
 * 로컬 개발용 모의 AI Assistant 서버
 * 프로덕션 배포 전에 빠르게 테스트하기 위함
 * 
 * 사용:
 *   cd azure-api && node mock-server.js
 *   브라우저에서 http://localhost:7071 에 접속하면 됨
 */

const http = require('http')

const PORT = 7071

// 모의 응답 함수
function handleAssistantRequest(body) {
  const message = body?.message || ''
  const history = body?.history || []

  console.log(`📨 사용자 메시지: "${message}"`)
  console.log(`📜 대화 이력 (${history.length}개):`, JSON.stringify(history, null, 2))

  // 실제 예약 행동을 나타내는 키워드 (명령형, 요청형)
  const isActionReservation = /예약해줄|예약해달라|예약해주|예약하고|예약하기|예약을 부탁|예약 부탁|예약하고 싶/i.test(message)
  
  // 정보 질문 패턴 (공실/가능 여부 확인)
  const isInfoQuestion = /가능|있나|있어|어디|어느|빈|공실|비어|상태|현황|확인|알려/i.test(message)
  
  // 필수 정보 추출
  const dateMatch = message.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일|(\d{1,2})월\s*(\d{1,2})일/)
  const timeMatch = message.match(/(\d{1,2}):?(\d{2})?시/)
  const endTimeMatch = message.match(/(\d{1,2}):?(\d{2})?시.*?(\d{1,2}):?(\d{2})?시/)
  const membersMatch = message.match(/(\d+)명/)
  
  // 대화 이력에서 이전에 예약 요청이 있었는지 확인
  const lastUserMessage = history
    .filter(h => h.role === 'user')
    .slice(-1)[0]?.text || ''
  const isContextReservation = lastUserMessage && /예약/i.test(lastUserMessage)
  
  // 현재 메시지에 시간/날짜 정보만 있고 이전에 예약 요청이 있었다면, 예약으로 간주
  const hasTimeInfoOnly = (dateMatch || timeMatch) && !isInfoQuestion && !isActionReservation
  const shouldContinueReservation = isContextReservation && hasTimeInfoOnly

  // 정보 질문인 경우 (예약 명령이 없으면서 정보를 원하는 경우)
  if (isInfoQuestion && !isActionReservation && !shouldContinueReservation) {
    console.log(`ℹ️  공실 확인 질문입니다.`)
    return '지금 스터디룸 4개(A, B, C, D)가 모두 공실입니다! 공간 현황 화면에서 원하는 방을 클릭하면 바로 예약할 수 있어요.'
  }

  // 예약도 정보도 아닌 기타 질문인 경우 (단, 대화 컨텍스트 무시)
  if (!isActionReservation && !isInfoQuestion && !shouldContinueReservation) {
    console.log(`ℹ️  기타 질문입니다.`)
    return '무엇을 도와드릴까요? 공간 현황을 확인하거나 예약을 하고 싶으시다면 알려주세요!'
  }

  // 예약 요청인데 필수 정보(날짜 또는 시간)가 없으면 물어보기
  if ((isActionReservation || shouldContinueReservation) && !dateMatch && !timeMatch) {
    console.log(`⚠️  예약 정보가 불완전합니다.`)
    return '언제 예약하고 싶으신가요? 예를 들어 "12월 15일 14시부터 16시까지"라고 말씀해주세요!'
  }

  // 예약 정보 구성
  let year = new Date().getFullYear()
  let month = new Date().getMonth() + 1
  let day = new Date().getDate()
  let startTime = '14:00'
  let endTime = '16:00'
  let members = 3

  if (dateMatch) {
    if (dateMatch[1]) {
      year = dateMatch[1]
      month = String(dateMatch[2]).padStart(2, '0')
      day = String(dateMatch[3]).padStart(2, '0')
    } else {
      month = String(dateMatch[4]).padStart(2, '0')
      day = String(dateMatch[5]).padStart(2, '0')
    }
  }

  // "오후 1시", "오전 10시" 등을 파싱
  const pmAmMatch = message.match(/(오전|오후)\s*(\d{1,2})시/)
  
  if (endTimeMatch) {
    const startHour = String(endTimeMatch[1]).padStart(2, '0')
    startTime = `${startHour}:00`
    const endHour = String(endTimeMatch[3]).padStart(2, '0')
    endTime = `${endHour}:00`
  } else if (pmAmMatch) {
    // "오전" 또는 "오후" 포함 시간
    let hour = parseInt(pmAmMatch[2])
    if (pmAmMatch[1] === '오후' && hour < 12) {
      hour += 12
    } else if (pmAmMatch[1] === '오전' && hour === 12) {
      hour = 0
    }
    startTime = `${String(hour).padStart(2, '0')}:00`
    endTime = `${String(Math.min(hour + 2, 23)).padStart(2, '0')}:00`
  } else if (timeMatch) {
    const hour = String(timeMatch[1]).padStart(2, '0')
    startTime = `${hour}:00`
    endTime = `${String(parseInt(hour) + 2).padStart(2, '0')}:00`
  }

  if (membersMatch) {
    members = parseInt(membersMatch[1])
  }

  const date = `${year}-${month}-${day}`

  // 예약 JSON 생성
  const reservationJson = {
    action: 'make_reservation',
    date,
    start_time: startTime,
    end_time: endTime,
    members_count: members,
    purpose: '스터디/과제',
    room_id: 'study-room-1',
  }

  console.log(`✅ 예약 정보 추출:`)
  console.log(`   날짜: ${date}`)
  console.log(`   시간: ${startTime} ~ ${endTime}`)
  console.log(`   인원: ${members}명`)

  return JSON.stringify(reservationJson)
}

// HTTP 서버 생성
const server = http.createServer((req, res) => {
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
      const mockRooms = [
        { id: 'study-room-1', name: '스터디룸 A', status: 'available' },
        { id: 'study-room-2', name: '스터디룸 B', status: 'available' },
        { id: 'study-room-3', name: '스터디룸 C', status: 'available' },
        { id: 'study-room-4', name: '스터디룸 D', status: 'available' },
      ]
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
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        console.log(`\n📝 예약 요청 수신:`)
        console.log(`   날짜: ${data.date}`)
        console.log(`   시간: ${data.start_time} ~ ${data.end_time}`)
        console.log(`   인원: ${data.members_count}명`)
        console.log(`   목적: ${data.purpose}`)

        // 성공 응답
        const reservationId = `RES-${Date.now()}`
        const response = {
          success: true,
          reservationId,
          reservation: data,
        }

        res.writeHead(200)
        res.end(JSON.stringify(response))
        console.log(`✅ 예약 완료! 예약번호: ${reservationId}\n`)
      } catch (error) {
        console.error('❌ 오류:', error.message)
        res.writeHead(400)
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
