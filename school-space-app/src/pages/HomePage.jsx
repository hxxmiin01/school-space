import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

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
  const navigate = useNavigate()

  useEffect(() => {
    async function fetchRooms() {
      const { data, error } = await supabase.from('rooms').select('*')
      if (error) {
        console.error('방 데이터를 불러오지 못했어요:', error)
      } else {
        setRooms(data)
      }
    }
    fetchRooms()

    // 실시간으로 방 상태 변경 감지
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
      </div>

      {/* 방 카드 목록 */}
      <div className="grid grid-cols-2 gap-5">
        {rooms.map((room) => {
          const config = STATUS_CONFIG[room.status] || STATUS_CONFIG.cleaning
          const isAvailable = room.status === 'available'

          return (
            <div
              key={room.id}
              onClick={() => isAvailable && navigate('/reservation', { state: { room } })}
              className={[
                'bg-white rounded-2xl shadow-sm border border-slate-200 border-t-4 px-6 py-7 flex flex-col items-center text-center',
                config.borderColor,
                isAvailable
                  ? 'cursor-pointer hover:-translate-y-1 hover:shadow-md transition-all duration-150'
                  : 'opacity-55 cursor-default',
              ].join(' ')}
            >
              {/* 아이콘 */}
              <span className="text-4xl mb-4">{config.icon}</span>

              {/* 방 이름 — 가장 중요하므로 가장 크게 */}
              <h3 className="font-bold text-slate-800 text-base mb-3">{room.name}</h3>

              {/* 상태 뱃지 */}
              <span className={`text-xs font-medium px-3 py-1 rounded-full ${config.badgeBg}`}>
                {config.label}
              </span>

              {/* 공실일 때만 예약 안내 표시 */}
              {isAvailable && (
                <p className="text-xs text-blue-500 font-medium mt-4">클릭해서 예약 →</p>
              )}
            </div>
          )
        })}

        {/* 방 데이터가 없을 때 안내 */}
        {rooms.length === 0 && (
          <div className="col-span-4 text-center py-16 text-slate-400">
            <p className="text-4xl mb-3">🏫</p>
            <p className="text-sm">공간 정보를 불러오는 중이에요...</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default HomePage
