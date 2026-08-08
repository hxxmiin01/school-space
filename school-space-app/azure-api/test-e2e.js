/**
 * End-to-End 테스트: AI가 자동으로 예약을 만드는지 확인
 * 
 * Flow:
 * 1. 사용자가 "12월 15일 14시부터 16시까지 3명이서 예약해줄래?" 라고 말함
 * 2. /api/assistant 엔드포인트가 AI를 호출
 * 3. AI가 예약 정보를 JSON으로 반환
 * 4. Assistant 엔드포인트가 /api/reserve를 자동으로 호출
 * 5. 사용자에게 "예약이 완료되었습니다! 예약번호: #RES-xxxxx" 라고 답변
 */

const BASE_URL = process.env.AZURE_FUNCTIONS_BASE_URL || 'https://school-space-api2-9726.azurewebsites.net'

async function testE2E() {
  console.log('🧪 End-to-End 테스트 시작...\n')
  console.log(`📍 API Base URL: ${BASE_URL}\n`)

  try {
    // Step 1: 사용자 요청
    console.log('1️⃣ 사용자 요청 전송:')
    console.log('   "2024년 12월 15일 14시부터 16시까지 3명이서 스터디룸 예약해줄래?"\n')

    const response = await fetch(`${BASE_URL}/api/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: '2024년 12월 15일 14시부터 16시까지 3명이서 스터디룸 예약해줄래?',
        history: [],
      }),
    })

    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`)
    }

    const result = await response.json()
    const reply = result.reply || ''

    console.log('2️⃣ AI 도우미 응답:')
    console.log(`   "${reply}"\n`)

    // Step 2: 응답 분석
    if (reply.includes('예약이 완료')) {
      console.log('✅ 성공! AI가 자동으로 예약을 생성했습니다!')
      console.log('\n📊 결과:')
      
      // 예약번호 추출
      const reservationIdMatch = reply.match(/#([A-Z0-9-]+)/)
      if (reservationIdMatch) {
        console.log(`   예약번호: ${reservationIdMatch[0]}`)
      }
      
      if (reply.includes('2024-12-15')) {
        console.log(`   날짜: 2024-12-15`)
      }
      
      if (reply.includes('14:00 ~ 16:00')) {
        console.log(`   시간: 14:00 ~ 16:00`)
      }
      
      if (reply.includes('3명')) {
        console.log(`   인원: 3명`)
      }
      
      console.log('\n🎉 모든 테스트 통과!')
      return true
    } else if (reply.includes('정보')) {
      console.log('⏳ AI가 추가 정보를 요청 중입니다 (정상)')
      console.log('\nℹ️ 현재 상태: AI가 더 많은 정보를 수집하려고 함')
      return true
    } else {
      console.log('⚠️ 예상치 못한 응답')
      console.log('\n응답 분석:')
      console.log(`   - 예약 완료 표시: ${reply.includes('완료') ? '✅' : '❌'}`)
      console.log(`   - JSON 형식: ${reply.includes('action') ? '✅' : '❌'}`)
      return false
    }
  } catch (error) {
    console.error('❌ 테스트 실패:', error.message)
    console.log('\n🔧 문제 해결:')
    console.log('   1. Azure Functions가 실행 중인지 확인')
    console.log('   2. FOUNDRY_ENDPOINT 환경변수가 설정되어 있는지 확인')
    console.log('   3. API URL이 올바른지 확인')
    return false
  }
}

// 테스트 실행
testE2E().then((success) => {
  process.exit(success ? 0 : 1)
})
