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
  })

  test('should successfully call Foundry API and return reply', async () => {
    // Arrange: Foundry API mock 설정
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '안녕하세요! 스터디룸을 예약하고 싶으신가요? 어떤 도움을 드릴까요?',
            },
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

    // Fetch 호출 검증
    const callArgs = global.fetch.mock.calls[0]
    expect(callArgs[0]).toBe(process.env.FOUNDRY_ENDPOINT)
    expect(callArgs[1].headers['api-key']).toBe(process.env.FOUNDRY_API_KEY)
  })

  test('should include system prompt in API request', async () => {
    // Arrange
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '테스트 응답',
            },
          },
        ],
      }),
    })

    const req = {
      body: {
        message: '방이 비어있나?',
        history: [],
      },
    }

    // Act
    await assistantFunction(context, req)

    // Assert
    const callArgs = global.fetch.mock.calls[0]
    const requestBody = JSON.parse(callArgs[1].body)

    // 시스템 프롬프트가 포함되는지 확인
    expect(requestBody.messages[0].role).toBe('system')
    expect(requestBody.messages[0].content).toContain('스터디룸 예약 도우미')
    expect(requestBody.messages[0].content).toContain('패널티 시스템')

    // 사용자 메시지가 마지막에 포함되는지 확인
    expect(requestBody.messages[requestBody.messages.length - 1].role).toBe('user')
    expect(requestBody.messages[requestBody.messages.length - 1].content).toBe('방이 비어있나?')
  })

  test('should include conversation history in request', async () => {
    // Arrange
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '다음 응답',
            },
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

    // 대화 이력이 포함되는지 확인
    // [system, user-hist, assistant-hist, user-current]
    expect(requestBody.messages.length).toBe(4)
    expect(requestBody.messages[1].role).toBe('user')
    expect(requestBody.messages[1].content).toBe('언제 예약하고 싶어?')
    expect(requestBody.messages[2].role).toBe('assistant')
    expect(requestBody.messages[2].content).toBe('내일 또는 모레를 추천드립니다')
  })

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

  test('should return 400 error when message is not provided', async () => {
    const req = {
      body: {
        history: [],
      },
    }

    await assistantFunction(context, req)

    expect(context.res.status).toBe(400)
    expect(context.res.body.error).toContain('message')
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

  test('should return 500 error when Foundry API key is not set', async () => {
    delete process.env.FOUNDRY_API_KEY

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

  test('should handle Foundry API network error', async () => {
    // Arrange: 네트워크 에러
    global.fetch.mockRejectedValue(new Error('Network timeout'))

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
    expect(context.res.body.error).toContain('AI 도우미 오류')
  })

  test('should handle invalid response from Foundry', async () => {
    // Arrange: 유효하지 않은 응답
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [],
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

  test('should handle response with text field (alternative format)', async () => {
    // Arrange: text 필드 형식
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            text: '텍스트 형식의 응답입니다',
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
    expect(context.res.body.reply).toBe('텍스트 형식의 응답입니다')
  })

  test('should send correct model and parameters to Foundry', async () => {
    // Arrange
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '응답',
            },
          },
        ],
      }),
    })

    const req = {
      body: {
        message: '테스트',
        history: [],
      },
    }

    // Act
    await assistantFunction(context, req)

    // Assert
    const callArgs = global.fetch.mock.calls[0]
    const requestBody = JSON.parse(callArgs[1].body)

    expect(requestBody.model).toBe('gpt-5.4-mini')
    expect(requestBody.temperature).toBe(0.7)
    expect(requestBody.max_tokens).toBe(500)
  })
})
