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
  let originalSupabaseUrl
  let originalSupabaseServiceRoleKey

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers().setSystemTime(new Date('2025-02-13T00:00:00'))
    process.env.AZURE_POSTGRES_CONNECTION_STRING = 'mock://connection'
    originalSupabaseUrl = process.env.SUPABASE_URL
    originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

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
    jest.restoreAllMocks()
    if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = originalSupabaseUrl
    if (originalSupabaseServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey
  })

  test('should return a Supabase reservation response without closing a PostgreSQL client', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => [{ id: 123 }] })

    await reserveFunction(context, {
      body: {
        roomId: 1,
        date: '2025-02-15',
        startTime: '15:00',
        endTime: '16:00',
        membersCount: 3,
        purpose: '수학 공부',
        userId: 'user123',
      },
    })

    expect(context.res.status).toBe(201)
    expect(context.res.body.reservationId).toBe(123)
    expect(mockConnect).not.toHaveBeenCalled()
    expect(mockEnd).not.toHaveBeenCalled()
  })

  test('should normalize study-room IDs before querying integer room_id values', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (requestUrl) => {
      const url = new URL(requestUrl)
      if (url.searchParams.get('room_id') === 'eq.study-room-1') {
        return {
          ok: false,
          status: 400,
          text: async () => 'invalid input syntax for type integer: "study-room-1"',
        }
      }
      if (url.pathname.endsWith('/reservations') && url.searchParams.has('select')) {
        return { ok: true, status: 200, json: async () => [] }
      }
      if (url.pathname.endsWith('/penalties')) {
        return { ok: true, status: 200, json: async () => [] }
      }
      return { ok: true, status: 201, json: async () => [{ id: 123 }] }
    })

    await reserveFunction(context, {
      body: {
        roomId: 'study-room-1',
        date: '2025-02-15',
        startTime: '15:00',
        endTime: '16:00',
        membersCount: 3,
        purpose: '수학 공부',
        userId: 'user123',
      },
    })

    expect(context.res.status).toBe(201)
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('room_id')).toBe('eq.1')
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).room_id).toBe(1)
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
