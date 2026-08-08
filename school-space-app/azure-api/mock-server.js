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

  // 실제 예약 행동을 나타내는 키워드 (명령형, 요청형)
  const isActionReservation = /예약해줄|예약해달라|예약해주|예약하고|예약하기|예약을 부탁|예약 부탁|예약하고 싶/i.test(message)
  
  // 정보 질문 패턴 (공실/가능 여부 확인)
  const isInfoQuestion = /가능|있나|있어|어디|어느|빈|공실|비어|상태|현황|확인|알려/i.test(message)
  
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
  const dateMatch = allUserMessages.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일|(\d{1,2})월\s*(\d{1,2})일/)
  const startEndTimeMatch = allUserMessages.match(/(\d{1,2}):?(\d{2})?시.*?(\d{1,2}):?(\d{2})?시/)
  const timeMatches = allUserMessages.match(/(\d{1,2}):?(\d{2})?시/g) || []
  
  // "오전/오후" 시간 파싱 - "까지", "부터" 등의 입자를 무시
  const pmAmMatches = allUserMessages.match(/(오전|오후)\s*(\d{1,2})\s*시/g) || []
  const membersMatch = allUserMessages.match(/(\d+)명/)
  const purposeMatch = allUserMessages.match(/목적.*?[:：]\s*([^\n]+)|사용.*?[:：]\s*([^\n]+)|과제|공부|스터디|프로젝트|회의|발표|준비/)

  // 디버그 로그
  console.log(`📋 정규식 결과:`)
  console.log(`   pmAmMatches: ${JSON.stringify(pmAmMatches)}`)
  console.log(`   timeMatches: ${JSON.stringify(timeMatches)}`)

  // 날짜 추출
  let year = new Date().getFullYear()
  let month = new Date().getMonth() + 1
  let day = new Date().getDate()

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

  // 시간 추출 (오전/오후 처리)
  let startTime = null
  let endTime = null

  // 1순위: "오후 1시", "오전 10시" 형식 (오전/오후 포함) - 가장 먼저 확인!
  if (pmAmMatches.length > 0) {
    console.log(`✓ 1순위 (pmAmMatches) 실행됨. pmAmMatches.length = ${pmAmMatches.length}`)
    const times = pmAmMatches.map(match => {
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
      
      return adjustedHour
    }).filter(t => t !== null)
    
    if (times.length >= 2) {
      startTime = `${String(times[0]).padStart(2, '0')}:00`
      endTime = `${String(times[1]).padStart(2, '0')}:00`
    } else if (times.length === 1 && timeMatches.length >= 2) {
      // "오후 2시부터 4시까지" 형식: pmAmMatches = ["오후 2시"], timeMatches = ["2시", "4시"]
      // 마지막 pmAm을 기반으로 추가 시간 처리
      const lastPmAmMatch = pmAmMatches[pmAmMatches.length - 1].match(/(오전|오후)/)
      const lastPmAm = lastPmAmMatch[1]
      
      // timeMatches에서 숫자만 추출
      const additionalHours = timeMatches.map(t => {
        const match = t.match(/(\d{1,2})/)
        return match ? parseInt(match[1]) : NaN
      }).filter(h => !isNaN(h))
      
      // 첫 번째는 이미 pmAmMatches에서 처리됨
      // 두 번째부터는 같은 오전/오후로 처리
      if (additionalHours.length >= 2) {
        let startHour = additionalHours[0]
        let endHour = additionalHours[1]
        
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
        
        startTime = `${String(startHour).padStart(2, '0')}:00`
        endTime = `${String(endHour).padStart(2, '0')}:00`
      } else {
        startTime = `${String(times[0]).padStart(2, '0')}:00`
        endTime = null
      }
    } else if (times.length === 1) {
      // 한 개의 오전/오후 시간만 있는 경우 → 아직 종료 시간 미입력
      startTime = `${String(times[0]).padStart(2, '0')}:00`
      endTime = null
    }
  }
  // 2순위: "14시부터 16시까지" 형식 (일반 숫자 시간)
  else if (startEndTimeMatch) {
    console.log(`✓ 2순위 (startEndTimeMatch) 실행됨: ${startEndTimeMatch}`)
    const startHour = String(startEndTimeMatch[1]).padStart(2, '0')
    const endHour = String(startEndTimeMatch[3]).padStart(2, '0')
    startTime = `${startHour}:00`
    endTime = `${endHour}:00`
    console.log(`✓ 2순위 (startEndTimeMatch) 실행됨: ${startTime} ~ ${endTime}`)
  } 
  // 3순위: "14시 16시" 형식 (숫자만)
  else if (timeMatches.length >= 2) {
    console.log(`✓ 3순위 (timeMatches >= 2) 실행됨. timeMatches.length = ${timeMatches.length}`)
    const times = pmAmMatches.map(match => {
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
      
      return adjustedHour
    }).filter(t => t !== null)
    
    if (times.length >= 2) {
      startTime = `${String(times[0]).padStart(2, '0')}:00`
      endTime = `${String(times[1]).padStart(2, '0')}:00`
    } else if (times.length === 1) {
      // 한 개의 오전/오후 시간만 있는 경우 → 아직 종료 시간 미입력
      startTime = `${String(times[0]).padStart(2, '0')}:00`
      endTime = null
    }
  } 
  // 3순위: "14시 16시" 형식 (숫자만)
  else if (timeMatches.length >= 2) {
    console.log(`✓ 3순위 (timeMatches >= 2) 실행됨. timeMatches.length = ${timeMatches.length}`)
    const hours = timeMatches.map(t => {
      // t는 "14시" 형태이므로 숫자만 추출
      const match = t.match(/(\d{1,2})/)
      return match ? parseInt(match[1]) : NaN
    }).filter(h => !isNaN(h))
    
    if (hours.length >= 2) {
      startTime = `${String(hours[0]).padStart(2, '0')}:00`
      endTime = `${String(hours[1]).padStart(2, '0')}:00`
    }
  } 
  // 4순위: "14시" 한 개만 (시작 시간만)
  else if (timeMatches.length === 1) {
    const match = timeMatches[0].match(/(\d{1,2})/)
    if (match) {
      const hour = parseInt(match[1])
      startTime = `${String(hour).padStart(2, '0')}:00`
      endTime = null
    }
  }

  // 목적 추출 (한글 단어 경계 처리 개선)
  let purpose = null
  if (allUserMessages.match(/(과제|공부|스터디)/) && !allUserMessages.match(/스터디룸/)) {
    // 명시적으로 "과제", "공부", "스터디"가 언급됨 (단, "스터디룸" 제외)
    const match = allUserMessages.match(/(과제|공부|스터디)/)
    purpose = match[1]
  } else if (allUserMessages.match(/(프로젝트|회의|발표|세미나|워크숍)/)) {
    const match = allUserMessages.match(/(프로젝트|회의|발표|세미나|워크숍)/)
    purpose = match[1]
  }

  // 인원 추출
  let members = membersMatch ? parseInt(membersMatch[1]) : null

  // ===== 부족한 정보 확인 및 다음 질문 결정 =====
  if (!startTime) {
    console.log(`⚠️  시작 시간이 필요합니다.`)
    return '언제 예약하고 싶으신가요? 예를 들어 "8월 15일 오후 2시"라고 말씀해주세요!'
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
    return `${members}명이 사용하시는군요. 사용 목적이 뭐예요? (예: 과제, 공부, 스터디, 프로젝트, 회의, 발표, 세미나 등)`
  }

  // ===== 모든 정보가 수집됨 - 예약 생성 =====
  const date = `${year}-${month}-${day}`
  const reservationJson = {
    action: 'make_reservation',
    date,
    start_time: startTime,
    end_time: endTime,
    members_count: members,
    purpose: purpose || '스터디/과제',
    room_id: 'study-room-1',
  }

  console.log(`✅ 예약 정보 완성:`)
  console.log(`   날짜: ${date}`)
  console.log(`   시간: ${startTime} ~ ${endTime}`)
  console.log(`   인원: ${members}명`)
  console.log(`   목적: ${purpose}`)

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
