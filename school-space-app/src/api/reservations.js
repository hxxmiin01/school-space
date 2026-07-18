import { supabase } from '../supabaseClient'
import { azureApiBaseUrl, backendProvider } from '../config/backend'
import { normalizeReservationRecord } from '../lib/roomName'

function buildAzureUrl(userId) {
  const baseUrl = azureApiBaseUrl.replace(/\/$/, '')
  const url = new URL(`${baseUrl}/api/reservations`)
  if (userId) {
    url.searchParams.set('userId', userId)
  }
  return url.toString()
}

export async function fetchReservationsWithSource(userId) {
  if (backendProvider === 'azure' && azureApiBaseUrl) {
    try {
      const response = await fetch(buildAzureUrl(userId))

      if (!response.ok) {
        throw new Error(`Azure 예약 API 요청 실패: ${response.status}`)
      }

      const data = await response.json()
      return { reservations: (data || []).map(normalizeReservationRecord), source: 'azure', fallbackReason: null }
    } catch (error) {
      console.warn('Azure reservations API를 불러오지 못해서 기존 데이터로 대신 불러와요.', error)
      let query = supabase.from('reservations').select('*, rooms(name)')
      if (userId) {
        query = query.eq('user_id', userId)
      }
      const { data, error: supabaseError } = await query.order('date', { ascending: false })
      if (supabaseError) {
        throw supabaseError
      }
      return { reservations: (data || []).map(normalizeReservationRecord), source: 'supabase-fallback', fallbackReason: error.message }
    }
  }

  if (backendProvider === 'azure' && !azureApiBaseUrl) {
    let query = supabase.from('reservations').select('*, rooms(name)')
    if (userId) {
      query = query.eq('user_id', userId)
    }
    const { data, error } = await query.order('date', { ascending: false })
    if (error) {
      throw error
    }
    return {
      reservations: (data || []).map(normalizeReservationRecord),
      source: 'supabase-no-azure-url',
      fallbackReason: 'VITE_AZURE_API_BASE_URL 환경 변수(설정값)가 비어 있어요.',
    }
  }

  let query = supabase.from('reservations').select('*, rooms(name)')
  if (userId) {
    query = query.eq('user_id', userId)
  }
  const { data, error } = await query.order('date', { ascending: false })
  if (error) {
    throw error
  }
  return { reservations: (data || []).map(normalizeReservationRecord), source: 'supabase', fallbackReason: null }
}

export async function fetchReservations(userId) {
  const { reservations } = await fetchReservationsWithSource(userId)
  return reservations
}
