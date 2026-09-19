// Mock pg Client BEFORE requiring the function
let mockQuery, mockConnect, mockEnd
jest.mock('pg', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: (...args) => mockConnect(...args),
    query: (...args) => mockQuery(...args),
    end: (...args) => mockEnd(...args),
  })),
}))

const reserveFunction = require('../reserve')

describe('Reserve API', () => {
  let context

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers().setSystemTime(new Date('2025-02-13T00:00:00'))
    process.env.AZURE_POSTGRES_CONNECTION_STRING = 'mock://connection'

    // 기본 mock 설정
    mockConnect = jest.fn().mockResolvedValue(undefined)
    mockEnd = jest.fn().mockResolvedValue(undefined)
    mockQuery = jest.fn()

    context = {
      res: null,
    }
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('should successfully create a reservation', async () => {
    // Arrange: 충돌 없고, 패널티도 없는 경우
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ conflict_count: '0' }], // 시간 충돌 확인
      })
      .mockResolvedValueOnce({
        rows: [{ total_penalty: '0' }], // 패널티 확인
      })
      .mockResolvedValueOnce({
        rows: [{ id: 123 }], // 예약 생성
      })

    const req = {
      body: {
        roomId: 1,
        date: '2025-02-15',
        startTime: '15:00',
        endTime: '16:00',
        membersCount: 3,
        purpose: '수학 공부',
        userId: 'user123',
      },
    }

    // Act
    await reserveFunction(context, req)

    // Assert
    expect(context.res.status).toBe(201)
    expect(context.res.body.success).toBe(true)
    expect(context.res.body.reservationId).toBe(123)
    expect(context.res.body.reservation.status).toBe('pending')
  })

  test('should fail when time slot is already booked', async () => {
    // Arrange: 시간 충돌
    mockQuery.mockResolvedValueOnce({
      rows: [{ conflict_count: '1' }], // 충돌 있음
    })

    const req = {
      body: {
        roomId: 1,
        date: '2025-02-15',
        startTime: '15:00',
        endTime: '16:00',
        membersCount: 3,
        purpose: '수학 공부',
        userId: 'user123',
      },
    }

    // Act
    await reserveFunction(context, req)

    // Assert
    expect(context.res.status).toBe(409)
    expect(context.res.body.success).toBe(false)
    expect(context.res.body.error).toContain('이미 예약되어 있습니다')
  })

  test('should fail when user has excessive penalty', async () => {
    // Arrange: 패널티 10점 이상
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ conflict_count: '0' }], // 시간 충돌 없음
      })
      .mockResolvedValueOnce({
        rows: [{ total_penalty: '10' }], // 패널티 10점 (제한)
      })

    const req = {
      body: {
        roomId: 1,
        date: '2025-02-15',
        startTime: '15:00',
        endTime: '16:00',
        membersCount: 3,
        purpose: '수학 공부',
        userId: 'user123',
      },
    }

    // Act
    await reserveFunction(context, req)

    // Assert
    expect(context.res.status).toBe(403)
    expect(context.res.body.success).toBe(false)
    expect(context.res.body.error).toContain('패널티')
    expect(context.res.body.totalPenalty).toBe(10)
  })

  test('should return 400 error when required parameters are missing', async () => {
    const req = {
      body: {
        roomId: 1,
        date: '2025-02-15',
        startTime: '15:00',
        // endTime 누락
        membersCount: 3,
        purpose: '수학 공부',
        userId: 'user123',
      },
    }

    await reserveFunction(context, req)

    expect(context.res.status).toBe(400)
    expect(context.res.body.error).toContain('required')
  })

  test('should reject reservations outside operating hours', async () => {
    const req = {
      body: {
        roomId: 1,
        date: '2025-02-15',
        startTime: '07:00',
        endTime: '08:00',
        membersCount: 3,
        purpose: '수학 공부',
        userId: 'user123',
      },
    }

    await reserveFunction(context, req)

    expect(context.res.status).toBe(400)
    expect(context.res.body.error).toContain('오전 8시부터 오후 10시까지')
    expect(mockConnect).not.toHaveBeenCalled()
  })

  test('should reject reservations more than seven days ahead', async () => {
    const req = {
      body: {
        roomId: 1,
        date: '2025-02-21',
        startTime: '09:00',
        endTime: '10:00',
        membersCount: 3,
        purpose: '수학 공부',
        userId: 'user123',
      },
    }

    await reserveFunction(context, req)

    expect(context.res.status).toBe(400)
    expect(context.res.body.error).toContain('오늘부터 일주일 이내')
    expect(mockConnect).not.toHaveBeenCalled()
  })

  test('should include full reservation data in response', async () => {
    // Arrange
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ conflict_count: '0' }],
      })
      .mockResolvedValueOnce({
        rows: [{ total_penalty: '5' }], // 5점 (제한 안 됨)
      })
      .mockResolvedValueOnce({
        rows: [{ id: 456 }],
      })

    const req = {
      body: {
        roomId: 2,
        date: '2025-02-20',
        startTime: '14:00',
        endTime: '15:30',
        membersCount: 4,
        purpose: '영어 프로젝트',
        userId: 'user456',
      },
    }

    // Act
    await reserveFunction(context, req)

    // Assert
    expect(context.res.body.reservation).toMatchObject({
      id: 456,
      roomId: 2,
      userId: 'user456',
      date: '2025-02-20',
      startTime: '14:00',
      endTime: '15:30',
      membersCount: 4,
      purpose: '영어 프로젝트',
      status: 'pending',
    })
  })

  test('should handle database error', async () => {
    // Arrange
    mockQuery.mockRejectedValueOnce(new Error('Database error'))

    const req = {
      body: {
        roomId: 1,
        date: '2025-02-15',
        startTime: '15:00',
        endTime: '16:00',
        membersCount: 3,
        purpose: '수학 공부',
        userId: 'user123',
      },
    }

    // Act
    await reserveFunction(context, req)

    // Assert
    expect(context.res.status).toBe(500)
    expect(context.res.body.error).toContain('Database error')
  })

  test('should allow reservation when penalty is less than 10', async () => {
    // Arrange: 패널티 9점 (제한 안 됨)
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ conflict_count: '0' }],
      })
      .mockResolvedValueOnce({
        rows: [{ total_penalty: '9' }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 789 }],
      })

    const req = {
      body: {
        roomId: 1,
        date: '2025-02-15',
        startTime: '15:00',
        endTime: '16:00',
        membersCount: 3,
        purpose: '수학 공부',
        userId: 'user789',
      },
    }

    // Act
    await reserveFunction(context, req)

    // Assert
    expect(context.res.status).toBe(201)
    expect(context.res.body.success).toBe(true)
  })
})
