import { supabase } from '../supabaseClient'
import { normalizeReservationRecord } from '../lib/roomName'
import { fetchRemoteJson, postRemoteJson, resolveWithRemoteFallback } from './remoteClient'
import { remoteApiBaseUrl, isRemoteBackendSelected } from '../config/backend'

async function fetchReservationsFromSupabase(userId) {
  let query = supabase.from('reservations').select('*, rooms(name)')
  if (userId) {
    query = query.eq('user_id', userId)
  }
  const { data, error } = await query.order('date', { ascending: false })
  if (error) {
    throw error
  }
  return data || []
}

export async function fetchReservationsWithSource(userId) {
  const { data, source, fallbackReason } = await resolveWithRemoteFallback({
    fetchRemote: () =>
      fetchRemoteJson('/api/reservations', {
        searchParams: { userId },
        errorLabel: 'Azure 예약 API',
      }),
    fetchLocal: () => fetchReservationsFromSupabase(userId),
    missingConfigReason: 'VITE_AZURE_API_BASE_URL 환경 변수(설정값)가 비어 있어요.',
    resourceName: 'reservations',
    onFallback: (error) => console.warn('Azure reservations API를 불러오지 못해서 기존 데이터로 대신 불러와요.', error),
  })

  return { reservations: (data || []).map(normalizeReservationRecord), source, fallbackReason }
}

export async function fetchReservations(userId) {
  const { reservations } = await fetchReservationsWithSource(userId)
  return reservations
}

export async function updateReservationStatus(reservationId, newStatus) {
  if (reservationId === undefined || reservationId === null || reservationId === '') {
    throw new Error('예약 ID가 없어서 상태를 바꿀 수 없어요.')
  }

  const reservationIdText = String(reservationId)
  const isNumericReservationId = /^\d+$/.test(reservationIdText)

  if (remoteApiBaseUrl) {
    try {
      const body = await postRemoteJson(
        `/api/reservations/${encodeURIComponent(reservationIdText)}/status`,
        { status: newStatus },
        { errorLabel: '예약 상태 변경' }
      )
      return { source: 'azure', data: body }
    } catch (error) {
      if (!isNumericReservationId) {
        throw error
      }

      console.warn('원격 예약 상태 변경에 실패해서 로컬 경로를 시도해요.', error)
    }
  }

  if (!isNumericReservationId) {
    throw new Error('이 예약은 로컬 Supabase 숫자 ID로 변경할 수 없어요. 원격 예약 상태 변경 경로를 사용해야 해요.')
  }

  const { error } = await supabase.from('reservations').update({ status: newStatus }).eq('id', Number(reservationIdText))
  if (error) {
    throw error
  }

  return { source: 'supabase' }
}

export async function updateRoomStatus(roomId, newStatus) {
  if (roomId === undefined || roomId === null || roomId === '') {
    throw new Error('방 ID가 없어서 상태를 바꿀 수 없어요.')
  }

  const roomIdText = String(roomId)
  const isNumericRoomId = /^\d+$/.test(roomIdText)

  if (remoteApiBaseUrl) {
    try {
      const body = await postRemoteJson(
        `/api/rooms/${encodeURIComponent(roomIdText)}/status`,
        { status: newStatus },
        { errorLabel: '방 상태 변경' }
      )
      return { source: 'azure', data: body }
    } catch (error) {
      if (!isNumericRoomId) {
        throw error
      }

      console.warn('원격 방 상태 변경에 실패해서 로컬 경로를 시도해요.', error)
    }
  }

  if (!isNumericRoomId) {
    throw new Error('이 방은 로컬 Supabase 숫자 ID로 변경할 수 없어요. 원격 방 상태 변경 경로를 사용해야 해요.')
  }

  const { error } = await supabase.from('rooms').update({ status: newStatus }).eq('id', Number(roomIdText))
  if (error) {
    throw error
  }

  return { source: 'supabase' }
}

export async function updateReservationSurveyDone(reservationId, surveyDone = true) {
  if (reservationId === undefined || reservationId === null || reservationId === '') {
    throw new Error('예약 ID가 없어서 설문 상태를 바꿀 수 없어요.')
  }

  const reservationIdText = String(reservationId)
  const isNumericReservationId = /^\d+$/.test(reservationIdText)

  if (remoteApiBaseUrl) {
    try {
      const body = await postRemoteJson(
        `/api/reservations/${encodeURIComponent(reservationIdText)}/survey`,
        { survey_done: Boolean(surveyDone) },
        { errorLabel: '설문 완료 상태 변경' }
      )
      return { source: 'azure', data: body }
    } catch (error) {
      const isMissingSurveyEndpoint = /404/.test(error?.message || '')

      if (!isNumericReservationId && isMissingSurveyEndpoint) {
        console.warn('원격 설문 상태 변경 엔드포인트가 아직 없어서 로컬 완료 표시만 사용해요.', error)
        return { source: 'azure-missing-endpoint' }
      }

      if (!isNumericReservationId) {
        throw error
      }

      console.warn('원격 설문 상태 변경에 실패해서 로컬 경로를 시도해요.', error)
    }
  }

  if (!isNumericReservationId) {
    throw new Error('이 예약은 로컬 Supabase 숫자 ID로만 설문 상태를 바꿀 수 있어요. 원격 설문 상태 변경 경로를 사용해야 해요.')
  }

  const { error } = await supabase.from('reservations').update({ survey_done: Boolean(surveyDone) }).eq('id', Number(reservationIdText))
  if (error) {
    throw error
  }

  return { source: 'supabase' }
}

/**
 * Canonical shape for a "create a reservation" request.
 *
 * Every screen that lets someone submit a reservation should build one of
 * these instead of assembling an ad-hoc insert payload inline. Centralizing
 * the shape here means:
 *   - there is exactly one definition of what a reservation request looks
 *     like, so it can't drift between screens (or between the write path and
 *     the read/normalize path in this file)
 *   - swapping the write path to a real remote endpoint later (once a
 *     backend runtime is actually chosen) only touches
 *     `submitReservationCommand`, not every place a reservation is created
 *   - every command always carries an idempotency key (see below), so the
 *     "same" submission — an accidental double click, a form resubmit after
 *     a network hiccup, a browser back/forward replay — can be recognized
 *     as one request instead of silently becoming two reservations
 *
 * `idempotencyKey` note: the current `reservations` table has no column to
 * store this key, so today it can only be enforced client-side (see
 * `submitReservationCommand`). Persisting it (e.g. a unique
 * `client_request_id` column + DB constraint) would need an actual schema
 * change, which is a real backend decision — intentionally left out of this
 * step rather than guessed at.
 */
export function createReservationCommand({
  room,
  userId,
  date,
  startTime,
  endTime,
  membersCount,
  purpose,
  idempotencyKey,
}) {
  return {
    idempotencyKey,
    roomId: room?.id,
    userId,
    date,
    startTime,
    endTime,
    membersCount,
    purpose,
  }
}

// Maps `idempotencyKey -> in-flight/settled submission promise`, scoped to
// this browser tab's lifetime (an in-memory Map, not persisted anywhere).
// Its only job is to stop the exact same command from reaching the database
// twice. It intentionally cannot protect against two different tabs/devices
// racing each other for the same room/time slot — preventing that requires a
// database-level unique constraint or transaction, which needs a schema
// decision and is out of scope for this step.
const inFlightReservationSubmissions = new Map()

function toSupabaseInsertRow(command) {
  // Only the columns the current `reservations` table actually has. Kept as
  // its own mapping step so a future remote request body (or a future
  // idempotency-key column) can differ from this shape without touching any
  // call site that builds a command.
  return {
    room_id: command.roomId,
    user_id: command.userId,
    date: command.date,
    start_time: command.startTime,
    end_time: command.endTime,
    members_count: command.membersCount,
    purpose: command.purpose,
    status: 'pending',
  }
}

/**
 * The single path every reservation submission goes through.
 *
 * If the same `command.idempotencyKey` is submitted again while the first
 * submission is still in flight (or already succeeded), this returns the
 * original submission instead of inserting a second row. A failed submission
 * clears its key so a retry with the same key can try again.
 */
export async function submitReservationCommand(command) {
  if (!command?.idempotencyKey) {
    throw new Error('예약 요청에 idempotencyKey(중복 제출 방지 키)가 없어요.')
  }

  const existing = inFlightReservationSubmissions.get(command.idempotencyKey)
  if (existing) {
    return existing
  }

  const submission = (async () => {
    const { error } = await supabase.from('reservations').insert(toSupabaseInsertRow(command))
    if (error) {
      throw error
    }
  })().catch((error) => {
    // Allow a genuine retry (same key) after a failed attempt.
    inFlightReservationSubmissions.delete(command.idempotencyKey)
    throw error
  })

  inFlightReservationSubmissions.set(command.idempotencyKey, submission)
  return submission
}
