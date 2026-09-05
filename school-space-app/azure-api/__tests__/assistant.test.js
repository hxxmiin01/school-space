// Mock fetch BEFORE requiring the function
global.fetch = jest.fn()

const assistantFunction = require('../assistant')

describe('Assistant API (Foundry)', () => {
  let context

  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch.mockClear()

    // Foundry 환경변수 설정
    process.env.FOUNDRY_ENDPOINT = 'https://aldlcndac.services.ai.azure.com/openai/v1/responses'
    process.env.FOUNDRY_API_KEY = 'test-key-123'
    process.env.FOUNDRY_MODEL = 'gpt-5.4-mini'

    context = {
      res: null,
    }
  })

  afterEach(() => {
    delete process.env.FOUNDRY_ENDPOINT
    delete process.env.FOUNDRY_API_KEY
    delete process.env.FOUNDRY_MODEL
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.AZURE_FUNCTIONS_BASE_URL
  })

  // ===== 기본 기능 테스트 =====
  
  test('should successfully call Foundry API and return reply (Responses API format)', async () => {
    // Arrange: Foundry Responses API mock 설정
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            content: [
              {
                text: '안녕하세요! 스터디룸을 예약하고 싶으신가요? 어떤 도움을 드릴까요?',
              },
            ],
          },
        ],
      }),
    })

    const req = {
      body: {
        message: '스터디룸 예약하고 싶어',
        history: [],
      },
    }

    // Act
    await assistantFunction(context, req)

    // Assert
    expect(context.res.status).toBe(200)
    expect(context.res.body.reply).toContain('스터디룸')
    expect(global.fetch).toHaveBeenCalledTimes(1)

    // Fetch 호출 검증 (Responses API 형식)
    const callArgs = global.fetch.mock.calls[0]
    expect(callArgs[0]).toBe(process.env.FOUNDRY_ENDPOINT)
    expect(callArgs[1].headers['api-key']).toBe(process.env.FOUNDRY_API_KEY)
    
    const requestBody = JSON.parse(callArgs[1].body)
    expect(requestBody.input).toBeDefined() // Responses API: 'input' 필드 사용
    expect(requestBody.model).toBe(process.env.FOUNDRY_MODEL)
  })

  test('should include system prompt and conversation history in request', async () => {
    // Arrange
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            content: [
              {
                text: '테스트 응답',
              },
            ],
          },
        ],
      }),
    })

    const req = {
      body: {
        message: '내일은?',
        history: [
          { role: 'user', text: '언제 예약하고 싶어?' },
          { role: 'assistant', text: '내일 또는 모레를 추천드립니다' },
        ],
      },
    }

    // Act
    await assistantFunction(context, req)

    // Assert
    const callArgs = global.fetch.mock.calls[0]
    const requestBody = JSON.parse(callArgs[1].body)

    // 시스템 프롬프트가 포함되는지 확인
    expect(requestBody.input).toContain('스터디룸 예약 도우미')
    expect(requestBody.input).toContain('패널티 시스템')
    expect(requestBody.input).toContain('예약 처리')
    
    // 대화 이력이 포함되는지 확인
    expect(requestBody.input).toContain('사용자: 언제 예약하고 싶어?')
    expect(requestBody.input).toContain('도우미: 내일 또는 모레를 추천드립니다')
    
    // 현재 메시지가 포함되는지 확인
    expect(requestBody.input).toContain('사용자: 내일은?')
  })

  test('should guide users when the question is unrelated to school space features', async () => {
    await assistantFunction(context, {
      body: {
        message: '오늘 저녁 메뉴 추천해줘',
        history: [],
      },
    })

    expect(context.res.status).toBe(200)
    expect(context.res.body.reply).toContain('스터디룸 예약')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('should greet users instead of showing the unrelated-question guide', async () => {
    await assistantFunction(context, {
      body: {
        message: '안녕',
        history: [],
      },
    })

    expect(context.res.status).toBe(200)
    expect(context.res.body.reply).toContain('안녕하세요')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('should include the user reservations read from Supabase in the Foundry prompt', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key'

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([
          {
            room_id: 2,
            date: '2026-09-06',
            start_time: '10:00',
            end_time: '11:00',
            status: 'approved',
          },
        ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output: [{ content: [{ text: '예약 내역을 확인했어요.' }] }],
        }),
      })

    await assistantFunction(context, {
      body: {
        message: '내 예약 상태를 알려줘',
        userId: 'user-123',
        history: [],
      },
    })

    const supabaseCall = global.fetch.mock.calls[0]
    expect(supabaseCall[0]).toContain('https://example.supabase.co/rest/v1/reservations')
    expect(supabaseCall[0]).toContain('user_id=eq.user-123')
    expect(supabaseCall[0]).toMatch(/date=gte\.\d{4}-\d{2}-\d{2}&date=lte\.\d{4}-\d{2}-\d{2}/)
    expect(supabaseCall[1].headers.Authorization).toBe('Bearer service-role-test-key')

    const foundryBody = JSON.parse(global.fetch.mock.calls[1][1].body)
    expect(foundryBody.input).toContain('사용자의 예정 예약 데이터(Supabase)')
    expect(foundryBody.input).toContain('방 2 | 2026-09-06 10:00~11:00')
  })

  // ===== 에러 처리 테스트 =====

  test('should return 400 error when message is empty', async () => {
    const req = {
      body: {
        message: '',
        history: [],
      },
    }

    await assistantFunction(context, req)

    expect(context.res.status).toBe(400)
    expect(context.res.body.error).toContain('message')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('should return 500 error when Foundry endpoint is not set', async () => {
    delete process.env.FOUNDRY_ENDPOINT

    const req = {
      body: {
        message: '예약하고 싶어',
        history: [],
      },
    }

    await assistantFunction(context, req)

    expect(context.res.status).toBe(500)
    expect(context.res.body.error).toContain('환경변수')
  })

  test('should handle Foundry API error response', async () => {
    // Arrange: API가 실패를 반환
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    })

    const req = {
      body: {
        message: '예약하고 싶어',
        history: [],
      },
    }

    // Act
    await assistantFunction(context, req)

    // Assert
    expect(context.res.status).toBe(500)
    expect(context.res.body.error).toContain('API 오류')
  })

  test('should handle invalid response from Foundry', async () => {
    // Arrange: 유효하지 않은 응답
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [],
      }),
    })

    const req = {
      body: {
        message: '예약하고 싶어',
        history: [],
      },
    }

    // Act
    await assistantFunction(context, req)

    // Assert
    expect(context.res.status).toBe(500)
    expect(context.res.body.error).toContain('유효한 응답')
  })

  // ===== 자동 예약 기능 테스트 =====

  test('should automatically create reservation when AI returns JSON', async () => {
    // Arrange: AI가 JSON 예약 정보를 반환
    const reservationJson = JSON.stringify({
      action: 'make_reservation',
      date: '2024-12-15',
      start_time: '14:00',
      end_time: '16:00',
      members_count: 3,
      purpose: '수학 스터디',
      room_id: 'study-room-1',
    })

    // Foundry API가 예약 정보를 반환
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        output: [
          {
            content: [
              {
                text: reservationJson,
              },
            ],
          },
        ],
      }),
    })

    // /api/reserve 성공 응답
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        reservationId: 'RES-12345',
      }),
    })

    const req = {
      body: {
        message: '2024년 12월 15일 14시부터 16시까지 3명이서 스터디1룸 예약해줄래?',
        history: [],
      },
    }

    // Act
    await assistantFunction(context, req)

    // Assert
    expect(context.res.status).toBe(200)
    
    // AI 응답이 예약 결과를 포함하는지 확인
    expect(context.res.body.reply).toContain('예약이 완료')
    expect(context.res.body.reply).toContain('RES-12345')
    expect(context.res.body.reply).toContain('2024-12-15')
    
    // Fetch가 2번 호출됨 (Foundry API + /api/reserve)
    expect(global.fetch).toHaveBeenCalledTimes(2)
    
    // 두 번째 호출이 /api/reserve인지 확인
    const secondCallArgs = global.fetch.mock.calls[1]
    expect(secondCallArgs[0]).toContain('/api/reserve')
    expect(secondCallArgs[1].method).toBe('POST')
    
    const reserveRequestBody = JSON.parse(secondCallArgs[1].body)
    expect(reserveRequestBody.date).toBe('2024-12-15')
    expect(reserveRequestBody.start_time).toBe('14:00')
    expect(reserveRequestBody.end_time).toBe('16:00')
    expect(reserveRequestBody.members_count).toBe(3)
    expect(reserveRequestBody.purpose).toBe('수학 스터디')
  })

  test('should show user-friendly error message when reservation API fails', async () => {
    // Arrange: AI가 JSON 반환, 하지만 예약 API 실패
    const reservationJson = JSON.stringify({
      action: 'make_reservation',
      date: '2024-12-15',
      start_time: '14:00',
      end_time: '16:00',
      members_count: 3,
      purpose: '수학 스터디',
      room_id: 'study-room-1',
    })

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        output: [
          {
            content: [
              {
                text: reservationJson,
              },
            ],
          },
        ],
      }),
    })

    // /api/reserve 실패
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: '시간 충돌: 다른 예약이 있습니다.',
      }),
    })

    const req = {
      body: {
        message: '2024년 12월 15일 14시부터 16시까지 예약해줄래?',
        history: [],
      },
    }

    // Act
    await assistantFunction(context, req)

    // Assert
    expect(context.res.status).toBe(200)
    expect(context.res.body.reply).toContain('문제가 발생')
    expect(context.res.body.reply).toContain('시간 충돌')
  })

  test('should handle network error when calling reserve API', async () => {
    // Arrange: 첫 번째 호출(Foundry)은 성공, 두 번째 호출(/api/reserve)이 네트워크 에러
    const reservationJson = JSON.stringify({
      action: 'make_reservation',
      date: '2024-12-15',
      start_time: '14:00',
      end_time: '16:00',
      members_count: 3,
      purpose: '수학 스터디',
      room_id: 'study-room-1',
    })

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        output: [
          {
            content: [
              {
                text: reservationJson,
              },
            ],
          },
        ],
      }),
    })

    // 네트워크 에러
    global.fetch.mockRejectedValueOnce(new Error('Connection timeout'))

    const req = {
      body: {
        message: '예약해줄래?',
        history: [],
      },
    }

    // Act
    await assistantFunction(context, req)

    // Assert
    expect(context.res.status).toBe(200)
    expect(context.res.body.reply).toContain('예약 시스템 오류')
  })

  test('should return plain text response when AI does not return JSON', async () => {
    // Arrange: AI가 일반 텍스트만 반환 (예약 정보 JSON 아님)
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            content: [
              {
                text: '예약하려면 어떤 날짜와 시간을 원하시나요?',
              },
            ],
          },
        ],
      }),
    })

    const req = {
      body: {
        message: '예약하고 싶어',
        history: [],
      },
    }

    // Act
    await assistantFunction(context, req)

    // Assert
    expect(context.res.status).toBe(200)
    expect(context.res.body.reply).toBe('예약하려면 어떤 날짜와 시간을 원하시나요?')
    
    // Foundry API만 호출되고 /api/reserve는 호출되지 않음
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  test('should use AZURE_FUNCTIONS_BASE_URL if provided', async () => {
    // Arrange
    process.env.AZURE_FUNCTIONS_BASE_URL = 'https://my-functions.azurewebsites.net'

    const reservationJson = JSON.stringify({
      action: 'make_reservation',
      date: '2024-12-15',
      start_time: '14:00',
      end_time: '16:00',
      members_count: 2,
      purpose: '과제',
      room_id: 'study-room-2',
    })

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        output: [
          {
            content: [
              {
                text: reservationJson,
              },
            ],
          },
        ],
      }),
    })

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        reservationId: 'RES-99999',
      }),
    })

    const req = {
      body: {
        message: '예약해줄래?',
        history: [],
      },
    }

    // Act
    await assistantFunction(context, req)

    // Assert
    const secondCallArgs = global.fetch.mock.calls[1]
    expect(secondCallArgs[0]).toContain('https://my-functions.azurewebsites.net/api/reserve')
  })

  test('should handle alternative response formats from Foundry', async () => {
    // Arrange: 다양한 응답 형식 지원
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        result: '다른 형식의 응답입니다',
      }),
    })

    const req = {
      body: {
        message: '스터디룸 안녕',
        history: [],
      },
    }

    // Act
    await assistantFunction(context, req)

    // Assert
    expect(context.res.status).toBe(200)
    expect(context.res.body.reply).toBe('다른 형식의 응답입니다')
  })
})
