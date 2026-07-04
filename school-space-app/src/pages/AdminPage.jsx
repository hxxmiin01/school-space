import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const STATUS_CONFIG = {
  pending:    { label: '⏳ 대기 중',   badge: 'bg-blue-50 text-blue-600' },
  approved:   { label: '✅ 승인됨',    badge: 'bg-green-50 text-green-700' },
  rejected:   { label: '❌ 거부됨',    badge: 'bg-red-50 text-red-600' },
  checked_in: { label: '🔴 입실 중',   badge: 'bg-amber-50 text-amber-700' },
  completed:  { label: '🏁 이용 완료', badge: 'bg-slate-50 text-slate-500' },
}

function AdminPage() {
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [penaltyTarget, setPenaltyTarget] = useState(null)
  const [penaltyReason, setPenaltyReason] = useState('')
  const [penaltyPoints, setPenaltyPoints] = useState('')
  const [submittingPenalty, setSubmittingPenalty] = useState(false)

  useEffect(() => { fetchReservations() }, [])

  async function fetchReservations() {
    const { data, error } = await supabase
      .from('reservations')
      .select('*, rooms(name)')
      .order('date', { ascending: true })

    if (error) { setErrorMsg('오류: ' + error.message) }
    else { setReservations(data) }
    setLoading(false)
  }

  async function handleStatus(id, newStatus) {
    const { error } = await supabase.from('reservations').update({ status: newStatus }).eq('id', id)
    if (error) alert('상태 변경 실패: ' + error.message)
    else fetchReservations()
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

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-[28px] font-semibold tracking-normal text-slate-800 leading-8">담당자 — 예약 관리</h1>
        <p className="text-slate-500 text-base mt-1 leading-6">총 {reservations.length}건</p>
      </div>

      {/* 필터 탭 */}
      <div className="flex gap-2 flex-wrap mb-6">
        {TABS.map((tab) => {
          const count = tab.key === 'all' ? reservations.length : reservations.filter(r => r.status === tab.key).length
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-3.5 py-2 rounded-lg text-sm leading-5 font-medium transition-colors ${
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
          {filtered.map((r) => {
            const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending
            return (
              <div key={r.id} className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
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
                      <button onClick={() => handleStatus(r.id, 'approved')}
                        className="px-4 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors">
                        승인
                      </button>
                      <button onClick={() => handleStatus(r.id, 'rejected')}
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