import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fetchReservations as fetchReservationsApi, updateReservationStatus, updateRoomStatus } from '../api/reservations'
import { fetchRoomsWithSource } from '../api/rooms'

const STATUS_CONFIG = {
  pending:    { label: '⏳ 대기 중',   badge: 'bg-blue-50 text-blue-600' },
  approved:   { label: '✅ 승인됨',    badge: 'bg-green-50 text-green-700' },
  rejected:   { label: '❌ 거부됨',    badge: 'bg-red-50 text-red-600' },
  checked_in: { label: '🔴 입실 중',   badge: 'bg-amber-50 text-amber-700' },
  completed:  { label: '🏁 이용 완료', badge: 'bg-slate-50 text-slate-500' },
}

const PAGE_SIZE = 6

function AdminPage() {
  const [reservations, setReservations] = useState([])
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [roomErrorMsg, setRoomErrorMsg] = useState('')
  const [updatingRoomId, setUpdatingRoomId] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [penaltyTarget, setPenaltyTarget] = useState(null)
  const [penaltyReason, setPenaltyReason] = useState('')
  const [penaltyPoints, setPenaltyPoints] = useState('')
  const [submittingPenalty, setSubmittingPenalty] = useState(false)

  useEffect(() => {
    fetchReservations()
    fetchRooms()
  }, [])

  async function fetchRooms() {
    try {
      const { rooms: fetchedRooms } = await fetchRoomsWithSource()
      setRooms(fetchedRooms || [])
      setRoomErrorMsg('')
    } catch (error) {
      setRoomErrorMsg('스터디룸 정보를 불러오지 못했어요: ' + error.message)
    } finally {
      setRoomsLoading(false)
    }
  }

  async function handleRoomCleaning(room) {
    const nextStatus = room.status === 'cleaning' ? 'available' : 'cleaning'
    setUpdatingRoomId(room.id)
    setRoomErrorMsg('')

    try {
      await updateRoomStatus(room.id, nextStatus)
      setRooms((currentRooms) => currentRooms.map((currentRoom) =>
        String(currentRoom.id) === String(room.id)
          ? { ...currentRoom, status: nextStatus }
          : currentRoom
      ))
    } catch (error) {
      setRoomErrorMsg(`스터디룸 상태를 바꾸지 못했어요: ${error.message}`)
    } finally {
      setUpdatingRoomId(null)
    }
  }

  async function fetchReservations() {
    try {
      const data = await fetchReservationsApi()
      setReservations(data || [])
    } catch (error) {
      setErrorMsg('오류: ' + error.message)
    }
    setLoading(false)
  }

  async function handleStatus(id, newStatus) {
    if (id === undefined || id === null || id === '') {
      alert('이 예약에는 상태를 변경할 식별자가 없어요.')
      return
    }

    try {
      await updateReservationStatus(id, newStatus)
      fetchReservations()
    } catch (error) {
      alert('상태 변경 실패: ' + error.message)
    }
  }

  function openPenaltyModal(reservation) {
    if (!reservation?.user_id) {
      alert('이 예약에는 사용자 정보(user_id)가 없어 패널티를 부여할 수 없어요.')
      return
    }

    setPenaltyTarget(reservation)
    setPenaltyReason('')
    setPenaltyPoints('')
  }

  function closePenaltyModal() {
    setPenaltyTarget(null)
    setPenaltyReason('')
    setPenaltyPoints('')
    setSubmittingPenalty(false)
  }

  async function submitPenalty() {
    if (!penaltyTarget?.user_id) {
      alert('대상 예약의 사용자 정보가 없어요.')
      return
    }

    const reason = penaltyReason.trim()
    if (!reason) {
      alert('패널티 사유를 입력해주세요.')
      return
    }

    const points = Number(penaltyPoints)
    if (!Number.isInteger(points) || points < 1 || points > 10) {
      alert('1~10 사이의 정수를 입력해주세요.')
      return
    }

    setSubmittingPenalty(true)

    const { error } = await supabase
      .from('penalties')
      .insert({ user_id: penaltyTarget.user_id, reason, points })

    setSubmittingPenalty(false)

    if (error) {
      console.error('패널티 부여 실패 상세:', error)
      alert('패널티 부여 실패: ' + error.message)
      return
    }

    alert(`패널티 ${points}점이 부여됐어요.`)
    closePenaltyModal()
    fetchReservations()
  }

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-8 text-slate-500 text-base leading-6">불러오는 중...</div>
  if (errorMsg) return <div className="max-w-3xl mx-auto px-4 py-8 text-red-500 text-base leading-6">{errorMsg}</div>

  const TABS = [
    { key: 'all',        label: '전체' },
    { key: 'pending',    label: '⏳ 대기 중' },
    { key: 'approved',   label: '✅ 승인됨' },
    { key: 'rejected',   label: '❌ 거부됨' },
    { key: 'checked_in', label: '🔴 입실 중' },
    { key: 'completed',  label: '🏁 이용 완료' },
  ]

  const filtered = activeTab === 'all'
    ? reservations
    : reservations.filter((r) => r.status === activeTab)
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visiblePage = Math.min(currentPage, pageCount)
  const pageReservations = filtered.slice((visiblePage - 1) * PAGE_SIZE, visiblePage * PAGE_SIZE)
  const firstVisibleReservation = filtered.length === 0 ? 0 : (visiblePage - 1) * PAGE_SIZE + 1
  const lastVisibleReservation = Math.min(visiblePage * PAGE_SIZE, filtered.length)

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8 border-b border-slate-200 pb-5">
        <p className="mb-2 text-xs font-semibold tracking-wide text-slate-400">SCHOOL SPACE · ADMIN</p>
        <h1 className="text-[28px] font-semibold tracking-normal text-slate-800 leading-8">담당자 관리</h1>
        <p className="text-slate-500 text-sm mt-2 leading-6">스터디룸 상태와 예약 신청을 관리해요. 예약 {reservations.length}건</p>
      </div>

      <section className="mb-8" aria-labelledby="room-status-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="room-status-heading" className="text-lg font-semibold text-slate-800">스터디룸 상태 관리</h2>
            <p className="mt-1 text-sm text-slate-500">청소를 시작하거나 마친 뒤 상태를 바꿔주세요.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">{rooms.length}개 공간</span>
        </div>

        {roomErrorMsg && (
          <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{roomErrorMsg}</p>
        )}

        {roomsLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">스터디룸 정보를 불러오는 중...</div>
        ) : rooms.length === 0 ? (
          !roomErrorMsg && <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">등록된 스터디룸이 없어요.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {rooms.map((room) => {
              const isCleaning = room.status === 'cleaning'
              const isOccupied = room.status === 'occupied'
              const isUpdating = String(updatingRoomId) === String(room.id)
              const roomStatusLabel = isCleaning ? '청소 중' : isOccupied ? '사용 중' : '공실'
              const roomStatusClass = isCleaning
                ? 'bg-amber-100 text-amber-800'
                : isOccupied
                  ? 'bg-red-100 text-red-700'
                  : 'bg-green-100 text-green-700'

              return (
                <article key={room.id} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="truncate text-sm font-semibold text-slate-800">{room.name}</h3>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${roomStatusClass}`}>
                      <span aria-hidden="true">{isCleaning ? '🟡' : isOccupied ? '🔴' : '🟢'}</span>
                      {roomStatusLabel}
                    </span>
                  </div>
                  <div className="flex min-h-8 items-center justify-between gap-2">
                    {isOccupied && <span className="text-[11px] text-slate-400">퇴실 후 변경 가능</span>}
                    <button
                      type="button"
                      onClick={() => handleRoomCleaning(room)}
                      disabled={isOccupied || isUpdating}
                      className={`ml-auto min-h-8 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        isCleaning
                          ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          : 'bg-slate-700 text-white hover:bg-slate-800'
                      }`}
                      title={isOccupied ? '사용 중인 공간은 퇴실 처리 후 변경할 수 있어요.' : undefined}
                    >
                      {isUpdating ? '저장 중...' : isCleaning ? '청소 완료' : '청소 시작'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* 필터 탭 */}
      <div className="flex gap-2 flex-wrap mb-6">
        {TABS.map((tab) => {
          const count = tab.key === 'all' ? reservations.length : reservations.filter(r => r.status === tab.key).length
          return (
            <button key={tab.key} onClick={() => { setActiveTab(tab.key); setCurrentPage(1) }}
              className={`px-3 py-1.5 rounded-lg text-xs leading-5 font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}>
              {tab.label} <span className={`ml-1 text-xs leading-5 ${ activeTab === tab.key ? 'text-blue-100' : 'text-slate-400'}`}>{count}</span>
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 text-base leading-6">
          해당 상태의 예약이 없어요.
        </div>
      ) : (
        <div className="space-y-3">
          {pageReservations.map((r) => {
            const reservationId = r.id ?? r.reservationId
            const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending
            return (
              <div key={reservationId} className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
                {/* 방 이름 + 상태 뱃지 */}
                <div className="flex justify-between items-start mb-3">
                  <span className="font-semibold text-slate-800 text-lg leading-7">{r.rooms?.name}</span>
                  <span className={`text-xs font-medium leading-5 px-2.5 py-0.5 rounded-full ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                </div>
                {/* 핵심 정보: 날짜·시간 크게 */}
                <p className="text-base font-medium text-slate-700 leading-6 mb-1.5">📅 {r.date} &nbsp; {r.start_time} ~ {r.end_time}</p>
                {/* 부가 정보 */}
                <div className="text-sm text-slate-500 leading-6 space-y-0.5 mb-4">
                  <p>👥 {r.members_count}명</p>
                  <p>📝 {r.purpose}</p>
                </div>

                {/* 버튼 영역 */}
                <div className="flex gap-2 flex-wrap">
                  {r.status === 'pending' && (
                    <>
                      <button onClick={() => handleStatus(reservationId, 'approved')}
                        className="px-4 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors">
                        승인
                      </button>
                      <button onClick={() => handleStatus(reservationId, 'rejected')}
                        className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors">
                        거부
                      </button>
                    </>
                  )}
                  {r.status === 'completed' && (
                    <button onClick={() => openPenaltyModal(r)}
                      className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors">
                      패널티 부여
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <p className="text-xs text-slate-500">{firstVisibleReservation}–{lastVisibleReservation}건 표시 · 전체 {filtered.length}건</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage(visiblePage - 1)}
              disabled={visiblePage === 1}
              className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              이전
            </button>
            <span className="min-w-14 text-center text-xs text-slate-500">{visiblePage} / {pageCount}</span>
            <button
              type="button"
              onClick={() => setCurrentPage(visiblePage + 1)}
              disabled={visiblePage === pageCount}
              className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              다음
            </button>
          </div>
        </div>
      )}

      {penaltyTarget && (
        <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-lg p-5">
            <h2 className="text-lg font-semibold text-slate-800 mb-2">패널티 부여</h2>
            <p className="text-sm text-slate-500 mb-4">방: {penaltyTarget.rooms?.name || '-'}</p>

            <label className="block text-sm font-medium text-slate-700 mb-1">사유</label>
            <textarea
              value={penaltyReason}
              onChange={(e) => setPenaltyReason(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 mb-3"
              rows={3}
              placeholder="예: 정리 미흡"
            />

            <label className="block text-sm font-medium text-slate-700 mb-1">점수 (1~10)</label>
            <input
              type="number"
              min={1}
              max={10}
              value={penaltyPoints}
              onChange={(e) => setPenaltyPoints(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closePenaltyModal}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitPenalty}
                disabled={submittingPenalty}
                className="px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm"
              >
                {submittingPenalty ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminPage
