import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, Building2, CalendarDays, CircleCheck, CircleDot, Clock3 } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { fetchRoomsWithSource } from '../api/rooms'
import { backendProvider } from '../config/backend'
import { getRoomCode } from '../lib/roomName'

const STATUS_CONFIG = {
  available: { label: '공실', Icon: CircleCheck, className: 'room-status-available' },
  occupied: { label: '사용 중', Icon: CircleDot, className: 'room-status-occupied' },
  cleaning: { label: '청소 중', Icon: Clock3, className: 'room-status-cleaning' },
}

function HomePage() {
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const sortedRooms = useMemo(() => [...rooms].sort((a, b) => {
    const codeA = getRoomCode(a?.name) || ''
    const codeB = getRoomCode(b?.name) || ''
    return codeA.localeCompare(codeB)
  }), [rooms])

  const roomCounts = useMemo(() => rooms.reduce((counts, room) => {
    if (room.status in counts) counts[room.status] += 1
    return counts
  }, { available: 0, occupied: 0, cleaning: 0 }), [rooms])

  useEffect(() => {
    let active = true
    async function loadRooms() {
      try {
        const { rooms: fetchedRooms } = await fetchRoomsWithSource()
        if (active) { setRooms(fetchedRooms); setError('') }
      } catch (loadError) {
        console.error('방 데이터를 불러오지 못했어요:', loadError)
        if (active) setError('스터디룸 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.')
      } finally {
        if (active) setLoading(false)
      }
    }
    loadRooms()

    if (backendProvider !== 'supabase') return () => { active = false }

    const channel = supabase
      .channel('rooms-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, loadRooms)
      .subscribe()

    return () => { active = false; supabase.removeChannel(channel) }
  }, [])

  const summaries = [
    { label: '전체 스터디룸', value: rooms.length, Icon: Building2, tone: 'summary-neutral' },
    { label: '공실', value: roomCounts.available, Icon: CircleCheck, tone: 'summary-available' },
    { label: '사용 중', value: roomCounts.occupied, Icon: CircleDot, tone: 'summary-occupied' },
    { label: '청소 중', value: roomCounts.cleaning, Icon: Clock3, tone: 'summary-cleaning' },
  ]

  return (
      <div className="dashboard-layout">
      <section className="dashboard-main">
        <header className="dashboard-heading">
          <div>
            <p className="dashboard-eyebrow">SCHOOL SPACE</p>
            <h1>공간 현황</h1>
            <p className="dashboard-description">스터디룸 상태를 확인하고 필요한 공간을 예약해보세요.</p>
          </div>
          <div className="dashboard-date"><CalendarDays size={16} /><span>실시간 현황</span></div>
        </header>

        <section className="summary-grid" aria-label="스터디룸 현황 요약">
          {summaries.map(({ label, value, Icon, tone }) => (
            <article className="summary-card" key={label}>
              <span className={`summary-icon ${tone}`}><Icon size={19} strokeWidth={1.8} /></span>
              <div><p>{label}</p><strong>{value}<small>개</small></strong></div>
            </article>
          ))}
        </section>

        <section className="room-section">
          <div className="section-heading">
            <div><h2>스터디룸</h2><p>방을 선택하면 예약 신청으로 이동해요.</p></div>
            <span className="room-count">{rooms.length}개 공간</span>
          </div>

          {loading ? (
            <div className="dashboard-state"><span className="state-spinner" />스터디룸을 불러오고 있어요.</div>
          ) : error ? (
            <div className="dashboard-state dashboard-state-error">{error}</div>
          ) : sortedRooms.length === 0 ? (
            <div className="dashboard-state">표시할 스터디룸이 없어요.</div>
          ) : (
            <div className="room-grid">
              {sortedRooms.map((room) => {
                const status = STATUS_CONFIG[room?.status] || STATUS_CONFIG.cleaning
                const { Icon } = status
                const title = getRoomCode(room?.name) ? `스터디룸 ${getRoomCode(room.name)}` : room.name
                return (
                  <article className="room-card" key={room.id}>
                    <div className="room-card-top">
                      <span className="room-icon"><Building2 size={21} strokeWidth={1.7} /></span>
                      <span className={`room-status ${status.className}`}><Icon size={14} strokeWidth={2} />{status.label}</span>
                    </div>
                    <h3>{title}</h3>
                    <p className="room-card-hint">예약 일정과 이용 목적을 입력할 수 있어요.</p>
                    <button type="button" onClick={() => navigate('/reservation', { state: { room } })} className="room-reserve-button">
                      예약 신청 <ArrowUpRight size={16} />
                    </button>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </section>

    </div>
  )
}

export default HomePage
