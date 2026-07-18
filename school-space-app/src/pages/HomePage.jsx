import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { fetchRoomsWithSource } from '../api/rooms'
import { backendProvider } from '../config/backend'
import RoomMap3D from '../components/RoomMap3D'
import { getRoomCode } from '../lib/roomName'

// 상태별 색상·아이콘·텍스트 정보
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
  const [interactionRoom, setInteractionRoom] = useState(null)
  const [nearRoom, setNearRoom] = useState(null)
  const navigate = useNavigate()
  const interactionRoomStatus = useMemo(
    () => STATUS_CONFIG[interactionRoom?.status] || STATUS_CONFIG.cleaning,
    [interactionRoom]
  )
  const roomStatusCards = useMemo(() => {
    const sorted = [...rooms].sort((a, b) => {
      const codeA = getRoomCode(a?.name) || ''
      const codeB = getRoomCode(b?.name) || ''
      return codeA.localeCompare(codeB)
    })

    return sorted.map((room) => {
      const code = getRoomCode(room?.name)
      const status = STATUS_CONFIG[room?.status] || STATUS_CONFIG.cleaning
      return {
        id: room.id,
        title: code ? `스터디룸 ${code}` : room.name,
        status,
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

      {/* 3D 공간 예약 영역 */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">3D 공간 보기 (Three.js)</h2>
        <p className="text-sm text-slate-500 mb-3">
          W/A/S/D(이동 키)로 캐릭터(움직이는 점)를 길 따라 움직이고, 방 문 앞에서 E(상호작용 키)를 누르면 예약 창이 열려요.
        </p>
        <RoomMap3D
          rooms={rooms}
          nearRoomId={nearRoom?.id || null}
          isInteractionOpen={Boolean(interactionRoom)}
          onNearRoomChange={(room) => setNearRoom(room)}
          onInteractRoom={(room) => setInteractionRoom(room)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {roomStatusCards.map((room) => (
          <div key={room.id} className={`rounded-xl border bg-white px-4 py-3 border-t-4 ${room.status.borderColor}`}>
            <p className="text-sm font-semibold text-slate-800">{room.title}</p>
            <p className={`inline-flex mt-2 text-xs font-medium px-2.5 py-1 rounded-full ${room.status.badgeBg}`}>
              {room.status.icon} {room.status.label}
            </p>
          </div>
        ))}
      </div>

      {interactionRoom && (
        <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[1px] flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-6">
            <p className="text-xs font-semibold text-indigo-600 mb-2">상호작용 완료</p>
            <h3 className="text-lg font-bold text-slate-800">{interactionRoom.name}</h3>
            <p className="mt-2 text-sm text-slate-500">
              방 문 앞에서 상호작용했어요. 예약 신청 창(예약 입력 화면)으로 이동할까요?
            </p>
            <p className={`inline-block mt-3 text-xs font-medium px-3 py-1 rounded-full ${interactionRoomStatus.badgeBg}`}>
              현재 상태: {interactionRoomStatus.icon} {interactionRoomStatus.label}
            </p>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setInteractionRoom(null)}
                className="flex-1 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50"
              >
                닫기
              </button>
              <button
                type="button"
                disabled={interactionRoom.status !== 'available'}
                onClick={() => navigate('/reservation', { state: { room: interactionRoom } })}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {interactionRoom.status === 'available' ? '예약하기' : '지금은 예약 불가'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HomePage
