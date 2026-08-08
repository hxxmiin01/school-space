/**
 * Foundry API 연결 테스트 스크립트
 * 
 * 사용법: node test-foundry.js
 */

// 직접 환경변수 설정 (local.settings.json에서 복사)
const endpoint = 'https://aldlcndac.services.ai.azure.com/openai/v1/responses'
const apiKey = '2on1hcWohIPmC72dp1DdTSMOGQlp30hpxBKKfpe4kfbxbPtRgvw3JQQJ99CHACYeBjFXJ3w3AAAAACOGopZX'
const model = 'gpt-5.4-mini'

console.log('🔍 Foundry API 연결 테스트 시작...\n')

// 1. 환경변수 확인
console.log('📋 환경변수 확인:')
console.log(`  ✓ Endpoint: ${endpoint ? '✅ 설정됨' : '❌ 설정 안 됨'}`)
console.log(`  ✓ API Key: ${apiKey ? '✅ 설정됨' : '❌ 설정 안 됨'}`)
console.log(`  ✓ Model: ${model ? `✅ ${model}` : '❌ 설정 안 됨'}`)

if (!endpoint || !apiKey || !model) {
  console.error('\n❌ 환경변수가 설정되지 않았습니다!')
  process.exit(1)
}

console.log('\n🌐 Foundry API에 요청 중...')

// 2. API 호출
const makeRequest = async () => {
  try {
    const payload = {
      input: '안녕하세요! 스터디룸을 예약하고 싶어요.',
      model,
    }

    console.log('\n📤 요청 내용:')
    console.log(`   URL: ${endpoint}`)
    console.log(`   Method: POST`)
    console.log(`   Headers: Content-Type: application/json, api-key: ${apiKey.substring(0, 10)}...`)
    console.log(`   Body: ${JSON.stringify(payload, null, 2)}`)

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(payload),
    })

    console.log(`\n📥 응답 상태: ${response.status} ${response.statusText}`)

    const data = await response.json()
    console.log(`\n📝 응답 본문:`)
    console.log(JSON.stringify(data, null, 2))

    if (response.ok) {
      console.log('\n✅ Foundry API 연결 성공!')
      
      // Responses API 응답 형식 처리
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
        reply = choice.message?.content || choice.text
      } else if (data.result) {
        reply = data.result
      }

      if (reply) {
        console.log(`\n💬 AI 응답:\n${reply}`)
      }
    } else {
      console.error('\n❌ Foundry API 오류!')
      console.error(`   상태 코드: ${response.status}`)
      console.error(`   에러 내용: ${JSON.stringify(data)}`)
    }

    process.exit(response.ok ? 0 : 1)
  } catch (error) {
    console.error('\n❌ 오류 발생!')
    console.error(`   메시지: ${error.message}`)
    console.error(`   상세: ${error.stack}`)

    // 일반적인 문제점 진단
    if (error.message.includes('getaddrinfo ENOTFOUND')) {
      console.error('\n💡 진단: 도메인을 찾을 수 없습니다.')
      console.error('   → 엔드포인트 URL이 정확한지 확인하세요')
    } else if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 진단: 서버가 연결을 거부했습니다.')
      console.error('   → Foundry 서비스가 정상 작동 중인지 확인하세요')
    } else if (error.message.includes('timeout')) {
      console.error('\n💡 진단: 요청 시간 초과')
      console.error('   → 네트워크 연결이나 방화벽을 확인하세요')
    }

    process.exit(1)
  }
}

makeRequest()
