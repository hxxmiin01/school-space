import { supabase } from '../supabaseClient'
import { normalizeRoomRecord } from '../lib/roomName'
import { fetchRemoteJson, resolveWithRemoteFallback } from './remoteClient'

async function fetchRoomsFromSupabase() {
  const { data, error } = await supabase.from('rooms').select('*').order('id', { ascending: true })
  if (error) {
    throw error
  }
  return data || []
}

export async function fetchRoomsWithSource() {
  const { data, source, fallbackReason } = await resolveWithRemoteFallback({
    fetchRemote: () => fetchRemoteJson('/api/rooms', { errorLabel: 'Azure API' }),
    fetchLocal: fetchRoomsFromSupabase,
    missingConfigReason: 'VITE_AZURE_API_BASE_URL 환경 변수(설정값)이 비어 있어요.',
    resourceName: 'rooms',
    onFallback: (error) => console.warn('Azure rooms API를 불러오지 못해서 기존 데이터로 대신 불러와요.', error),
  })

  return { rooms: (data || []).map(normalizeRoomRecord), source, fallbackReason }
}

export async function fetchRooms() {
  const { rooms } = await fetchRoomsWithSource()
  return rooms
}
