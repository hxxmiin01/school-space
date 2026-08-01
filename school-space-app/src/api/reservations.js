import { supabase } from '../supabaseClient'
import { normalizeReservationRecord } from '../lib/roomName'
import { fetchRemoteJson, resolveWithRemoteFallback } from './remoteClient'

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
