import { azureApiBaseUrl, backendProvider } from '../config/backend'
import { supabase } from '../supabaseClient'
import { normalizeRoomRecord } from '../lib/roomName'

export async function fetchRoomsWithSource() {
  if (backendProvider === 'azure' && azureApiBaseUrl) {
    try {
      const response = await fetch(`${azureApiBaseUrl.replace(/\/$/, '')}/api/rooms`)

      if (!response.ok) {
        throw new Error(`Azure API 요청 실패: ${response.status}`)
      }

      const data = await response.json()
      return { rooms: (data || []).map(normalizeRoomRecord), source: 'azure', fallbackReason: null }
    } catch (error) {
      console.warn('Azure rooms API를 불러오지 못해서 기존 데이터로 대신 불러와요.', error)
      const { data, error: supabaseError } = await supabase.from('rooms').select('*').order('id', { ascending: true })

      if (supabaseError) {
        throw supabaseError
      }

      return { rooms: (data || []).map(normalizeRoomRecord), source: 'supabase-fallback', fallbackReason: error.message }
    }
  }

  if (backendProvider === 'azure' && !azureApiBaseUrl) {
    const { data, error } = await supabase.from('rooms').select('*').order('id', { ascending: true })

    if (error) {
      throw error
    }

    return {
      rooms: (data || []).map(normalizeRoomRecord),
      source: 'supabase-no-azure-url',
      fallbackReason: 'VITE_AZURE_API_BASE_URL 환경 변수(설정값)이 비어 있어요.',
    }
  }

  const { data, error } = await supabase.from('rooms').select('*').order('id', { ascending: true })

  if (error) {
    throw error
  }

  return { rooms: (data || []).map(normalizeRoomRecord), source: 'supabase', fallbackReason: null }
}

export async function fetchRooms() {
  const { rooms } = await fetchRoomsWithSource()
  return rooms
}
