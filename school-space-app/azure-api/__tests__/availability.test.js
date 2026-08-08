// Mock pg Client BEFORE requiring the function
let mockQuery, mockConnect, mockEnd
jest.mock('pg', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: (...args) => mockConnect(...args),
    query: (...args) => mockQuery(...args),
    end: (...args) => mockEnd(...args),
  })),
}))

const availabilityFunction = require('../availability')

describe('Availability API', () => {
  let context

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.AZURE_POSTGRES_CONNECTION_STRING = 'mock://connection'

    // 기본 mock 설정
    mockConnect = jest.fn().mockResolvedValue(undefined)
    mockEnd = jest.fn().mockResolvedValue(undefined)
    mockQuery = jest.fn()

    context = {
      res: null,
    }
  })

  test('should return available: true when no conflicts', async () => {
    // Arrange: 데이터베이스 쿼리 결과 mock (충돌 없음)
    mockQuery.mockResolvedValue({
      rows: [{ conflict_count: '0' }],
    })

    const req = {
      query: {
        roomId: '1',
        date: '2025-02-15',
        startTime: '15:00',
        endTime: '16:00',
      },
    }

    // Act: 함수 실행
    await availabilityFunction(context, req)

    // Assert: 결과 검증
    expect(context.res.status).toBe(200)
    expect(context.res.body.available).toBe(true)
    expect(context.res.body.reason).toBe(null)
  })

  test('should return available: false when conflicts exist', async () => {
    // Arrange: 충돌하는 예약이 있는 경우
    mockQuery.mockResolvedValue({
      rows: [{ conflict_count: '1' }],
    })

    const req = {
      query: {
        roomId: '1',
        date: '2025-02-15',
        startTime: '15:00',
        endTime: '16:00',
      },
    }

    // Act
    await availabilityFunction(context, req)

    // Assert
    expect(context.res.status).toBe(200)
    expect(context.res.body.available).toBe(false)
    expect(context.res.body.reason).toContain('이미 예약되어 있습니다')
  })

  test('should return 400 error when required parameters are missing', async () => {
    const req = {
      query: {
        roomId: '1',
        date: '2025-02-15',
        // startTime 누락
        endTime: '16:00',
      },
    }

    await availabilityFunction(context, req)

    expect(context.res.status).toBe(400)
    expect(context.res.body.error).toContain('required')
  })

  test('should handle database connection error', async () => {
    mockQuery.mockRejectedValue(new Error('Database connection failed'))

    const req = {
      query: {
        roomId: '1',
        date: '2025-02-15',
        startTime: '15:00',
        endTime: '16:00',
      },
    }

    await availabilityFunction(context, req)

    expect(context.res.status).toBe(500)
    expect(context.res.body.error).toContain('Database connection failed')
  })

  test('should return correct response structure', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ conflict_count: '0' }],
    })

    const req = {
      query: {
        roomId: '2',
        date: '2025-02-20',
        startTime: '10:00',
        endTime: '11:00',
      },
    }

    await availabilityFunction(context, req)

    expect(context.res.body).toHaveProperty('available')
    expect(context.res.body).toHaveProperty('roomId')
    expect(context.res.body).toHaveProperty('date')
    expect(context.res.body).toHaveProperty('startTime')
    expect(context.res.body).toHaveProperty('endTime')
    expect(context.res.body).toHaveProperty('reason')
  })
})
