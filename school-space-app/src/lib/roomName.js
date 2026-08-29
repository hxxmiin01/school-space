const ROOM_CODE_MAP = {
  '1': 'A',
  '2': 'B',
  '3': 'C',
  '4': 'D',
  a: 'A',
  b: 'B',
  c: 'C',
  d: 'D',
}

function getRoomCodeFromId(id) {
  return ROOM_CODE_MAP[String(id)] || null
}

// `reservations.room_id`는 정수 컬럼이지만 `rooms.id`는 'study-room-1' 같은 문자열이라,
// insert/조회 전에 항상 이 변환을 거쳐야 함.
export function toNumericRoomId(roomId) {
  if (roomId === null || roomId === undefined || roomId === '') return null
  const text = String(roomId)
  if (/^\d+$/.test(text)) return Number(text)
  const match = text.match(/(\d+)\s*$/)
  return match ? Number(match[1]) : null
}

function normalizeRoomKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
}

function compactRoomKey(name) {
  return normalizeRoomKey(name).replace(/\s+/g, '')
}

export function getRoomCode(name) {
  const compact = compactRoomKey(name)
  if (!compact) return null

  const exact = compact.match(/^(?:room|방|스터디룸)?([1-4a-d])$/i)
  if (exact) {
    return ROOM_CODE_MAP[exact[1].toLowerCase()] || null
  }

  const loose = compact.match(/(?:room|방|스터디룸)([1-4a-d])/i)
  if (loose) {
    return ROOM_CODE_MAP[loose[1].toLowerCase()] || null
  }

  return null
}

export function formatRoomName(name) {
  const code = getRoomCode(name)
  if (!code) return name
  return `스터디룸 ${code}`
}

export function normalizeRoomRecord(room) {
  if (!room) return room
  const roomCode = getRoomCode(room.name) || getRoomCodeFromId(room.id)
  return {
    ...room,
    room_code: roomCode,
    name: roomCode ? `스터디룸 ${roomCode}` : formatRoomName(room.name),
  }
}

export function normalizeReservationRecord(reservation) {
  if (!reservation) return reservation
  const roomCode =
    getRoomCode(reservation.rooms?.name) ||
    getRoomCode(reservation.room_name) ||
    getRoomCodeFromId(reservation.room_id)

  return {
    ...reservation,
    room_code: roomCode,
    room_name: roomCode ? `스터디룸 ${roomCode}` : formatRoomName(reservation.room_name),
    rooms: reservation.rooms
      ? {
          ...reservation.rooms,
          room_code: roomCode,
          name: roomCode ? `스터디룸 ${roomCode}` : formatRoomName(reservation.rooms.name),
        }
      : reservation.rooms,
  }
}
