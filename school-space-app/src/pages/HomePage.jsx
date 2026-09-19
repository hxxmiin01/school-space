import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { fetchRoomsWithSource } from '../api/rooms'
import { backendProvider } from '../config/backend'
import { getRoomCode } from '../lib/roomName'

const STATUS_CONFIG = {
  available: {
    label: '공실',
    icon: '🟢',
    borderColor: 'border-t-green-500',
    badgeBg: 'bg-green-100 text-green-700',
  },
  occupied: {
    label: '사용 중',
    icon: '🔴',
    borderColor: 'border-t-red-500',
    badgeBg: 'bg-red-100 text-red-700',
  },
  cleaning: {
    label: '청소 중',
    icon: '🟡',
    borderColor: 'border-t-yellow-400',
    badgeBg: 'bg-yellow-100 text-yellow-700',
  },
}

function HomePage() {
  const [rooms, setRooms] = useState([])
  const [sourceInfo, setSourceInfo] = useState({ source: '', fallbackReason: null })
  const navigate = useNavigate()
  const roomStatusCards = useMemo(() => {
    const sorted = [...rooms].sort((a, b) => {
      const codeA = getRoomCode(a?.name) || ''
      const codeB = getRoomCode(b?.name) || ''
      return codeA.localeCompare(codeB)
    })

    return sorted.map((room) => {
      const code = getRoomCode(room?.name)
      const status = STATUS_CONFIG[room?.status] || STATUS_CONFIG.cleaning
      // 방이 지금 사용 중/청소 중이어도 다른 날짜·시간에는 예약할 수 있어야 하므로
      // 상태는 표시만 하고, 예약 이동 자체는 항상 허용한다.
      return {
        id: room.id,
        title: code ? `스터디룸 ${code}` : room.name,
        status,
        room,
        isReservable: true,
      }
    })
  }, [rooms])

  useEffect(() => {
    async function fetchRooms() {
      try {
        const { rooms: fetchedRooms, source, fallbackReason } = await fetchRoomsWithSource()
        setRooms(fetchedRooms)
        setSourceInfo({ source, fallbackReason })
      } catch (error) {
        console.error('방 데이터를 불러오지 못했어요:', error)
      }
    }
    fetchRooms()

    if (backendProvider !== 'supabase') {
      return undefined
    }

    // 실시간으로 방 상태 변경 감지 (Supabase 모드일 때만 사용)
    const channel = supabase
      .channel('rooms-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        fetchRooms()
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* 페이지 제목 영역 */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">공간 현황</h1>
        <p className="text-slate-500 mt-1 text-sm">공실인 방을 클릭하면 바로 예약할 수 있어요</p>
        {sourceInfo.source === 'azure' && (
          <p className="mt-2 text-xs text-blue-600 font-medium">현재 Azure API(데이터를 가져오는 통로)로 방 정보를 불러오고 있어요.</p>
        )}
        {sourceInfo.source === 'supabase' && (
          <p className="mt-2 text-xs text-slate-600 font-medium">현재 Supabase(기존 데이터 저장소)에서 방 정보를 불러오고 있어요.</p>
        )}
        {sourceInfo.source === 'supabase-fallback' && (
          <p className="mt-2 text-xs text-amber-600 font-medium">
            Azure API 연결이 실패해서 Supabase로 자동 전환했어요.
            {sourceInfo.fallbackReason ? ` (${sourceInfo.fallbackReason})` : ''}
          </p>
        )}
        {sourceInfo.source === 'supabase-no-azure-url' && (
          <p className="mt-2 text-xs text-amber-600 font-medium">
            Azure 주소 설정이 없어서 Supabase를 사용 중이에요.
            {' '}VITE_AZURE_API_BASE_URL(Azure API 주소 설정값)을 .env.local에 넣으면 Azure 연결을 시도해요.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {roomStatusCards.map((room) => (
          <button
            key={room.id}
            type="button"
            disabled={!room.isReservable}
            onClick={() => navigate('/reservation', { state: { room: room.room } })}
            className={`text-left rounded-2xl border bg-white border-t-8 ${room.status.borderColor} p-6 min-h-[180px] shadow-sm transition ${
              room.isReservable
                ? 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
                : 'opacity-90 cursor-not-allowed'
            }`}
          >
            <p className="text-xl font-bold text-slate-800">{room.title}</p>
            <p className={`inline-flex mt-3 text-sm font-semibold px-3 py-1.5 rounded-full ${room.status.badgeBg}`}>
              {room.status.icon} {room.status.label}
            </p>
            <p className="mt-5 text-sm text-slate-500">
              클릭하면 예약 창으로 이동해요. (지금 상태는 참고용이에요)
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}

export default HomePage
