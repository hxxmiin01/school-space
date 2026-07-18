import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fetchReservationsWithSource } from '../api/reservations'

const STATUS_CONFIG = {
  pending:    { label: '⏳ 대기 중',   border: 'border-l-blue-400',   badge: 'bg-blue-50 text-blue-600' },
  approved:   { label: '✅ 승인됨',    border: 'border-l-green-400',  badge: 'bg-green-50 text-green-700' },
  rejected:   { label: '❌ 거부됨',    border: 'border-l-red-400',    badge: 'bg-red-50 text-red-600' },
  checked_in: { label: '🔴 입실 중',   border: 'border-l-amber-400',  badge: 'bg-amber-50 text-amber-700' },
  completed:  { label: '🏁 이용 완료', border: 'border-l-slate-300',  badge: 'bg-slate-50 text-slate-500' },
}

function MyPage() {
  const [reservations, setReservations] = useState([])
  const [penalties, setPenalties] = useState([])
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [className, setClassName] = useState('')
  const [classInput, setClassInput] = useState('')
  const [userName, setUserName] = useState('')
  const [editingClass, setEditingClass] = useState(false)
  const [reservationSourceInfo, setReservationSourceInfo] = useState({ source: '', fallbackReason: null })

  useEffect(() => { fetchMyData() }, [])

  async function fetchMyData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setUserEmail(user.email)
      setUserId(user.id)

      const [resResult, penResult, profileResult] = await Promise.all([
        fetchReservationsWithSource(user.id),
        supabase.from('penalties').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('profiles').select('class_name, name').eq('id', user.id).single(),
      ])

      setReservations(resResult?.reservations || [])
      setReservationSourceInfo({ source: resResult?.source || '', fallbackReason: resResult?.fallbackReason || null })
      if (!penResult.error) setPenalties(penResult.data)
      if (!profileResult.error) {
        setClassName(profileResult.data?.class_name || '')
        setClassInput(profileResult.data?.class_name || '')
        setUserName(profileResult.data?.name || '')
      }
    } catch (error) {
      console.error('마이페이지 데이터를 불러오지 못했어요:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveClass() {
    const { error } = await supabase.from('profiles').update({ class_name: classInput }).eq('id', userId)
    if (!error) { setClassName(classInput); setEditingClass(false) }
  }

  async function handleCheckIn(reservation) {
    const { error } = await supabase.from('rooms').update({ status: 'occupied' }).eq('id', reservation.room_id)
    if (error) { alert('입실 실패: ' + error.message) } else {
      await supabase.from('reservations').update({ status: 'checked_in' }).eq('id', reservation.id)
      alert('입실 완료! 방이 사용 중으로 바뀌었어요.')
      fetchMyData()
    }
  }

  async function handleCheckOut(reservation) {
    const { error } = await supabase.from('rooms').update({ status: 'available' }).eq('id', reservation.room_id)
    if (error) { alert('퇴실 실패: ' + error.message) } else {
      await supabase.from('reservations').update({ status: 'completed' }).eq('id', reservation.id)
      alert('퇴실 완료! 방이 공실로 바뀌었어요.')
      fetchMyData()
    }
  }

  async function handleSurveyDone(reservationId) {
    const { error } = await supabase.from('reservations').update({ survey_done: true }).eq('id', reservationId)
    if (!error) fetchMyData()
  }

  const totalPenalty = penalties.reduce((sum, p) => sum + p.points, 0)
  const isRestricted = totalPenalty >= 10

  if (loading) return (
    <div className="max-w-2xl mx-auto px-4 py-8 text-center text-slate-400">불러오는 중...</div>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">

      {/* 프로필 카드 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h1 className="text-lg font-bold text-slate-800 mb-4">마이페이지</h1>
        <div className="space-y-2 text-sm text-slate-600">
          <p>이름: <span className="font-semibold text-slate-800">{userName || '미설정'}</span></p>
          <p>계정: <span className="text-slate-500">{userEmail}</span></p>
          <div className="flex items-center gap-2 flex-wrap">
            <span>학급:</span>
            {editingClass ? (
              <>
                <input value={classInput} onChange={(e) => setClassInput(e.target.value)}
                  placeholder="예: 1학년 2반"
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
                <button onClick={handleSaveClass}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">저장</button>
                <button onClick={() => setEditingClass(false)}
                  className="px-3 py-1.5 border border-slate-200 text-slate-500 text-sm rounded-lg hover:bg-slate-50 transition-colors">취소</button>
              </>
            ) : (
              <>
                <span className="font-semibold text-slate-800">{className || '미설정'}</span>
                <button onClick={() => setEditingClass(true)}
                  className="px-2.5 py-1 border border-slate-200 text-slate-400 text-xs rounded-lg hover:bg-slate-50 transition-colors">수정</button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 패널티 현황 카드 */}
      <div className={`bg-white rounded-xl border shadow-sm p-5 border-l-4 ${isRestricted ? 'border-l-red-500' : 'border-l-blue-500'}`}>
        <h2 className="font-bold text-slate-800 mb-3">패널티 현황</h2>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-sm text-slate-600">누적 점수</span>
          <span className={`text-lg font-bold ${isRestricted ? 'text-red-600' : 'text-slate-800'}`}>
            {totalPenalty}점
          </span>
          <span className="text-sm text-slate-400">/ 10점</span>
          {isRestricted && (
            <span className="text-xs bg-red-50 text-red-600 font-medium px-2 py-0.5 rounded-full">⚠️ 1주 이용 제한</span>
          )}
        </div>
        {penalties.length > 0 ? (
          <ul className="space-y-1.5">
            {penalties.map((p) => (
              <li key={p.id} className="text-sm text-slate-600 flex justify-between">
                <span>{new Date(p.created_at).toLocaleDateString()} — {p.reason}</span>
                <span className="font-semibold text-red-500">+{p.points}점</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">패널티 없음 🎉</p>
        )}
      </div>

      {/* 예약 내역 */}
      <div className="pt-2">
        <h2 className="font-bold text-slate-800 mb-5">내 예약 내역</h2>
        {reservationSourceInfo.source === 'azure' && (
          <p className="mb-3 text-xs text-blue-600 font-medium">예약 목록은 Azure API(데이터 통로)에서 불러오고 있어요.</p>
        )}
        {reservationSourceInfo.source === 'supabase' && (
          <p className="mb-3 text-xs text-slate-600 font-medium">예약 목록은 Supabase(기존 저장소)에서 불러오고 있어요.</p>
        )}
        {reservationSourceInfo.source === 'supabase-fallback' && (
          <p className="mb-3 text-xs text-amber-600 font-medium">
            Azure 예약 API 연결이 실패해서 Supabase로 자동 전환했어요.
            {reservationSourceInfo.fallbackReason ? ` (${reservationSourceInfo.fallbackReason})` : ''}
          </p>
        )}
        {reservationSourceInfo.source === 'supabase-no-azure-url' && (
          <p className="mb-3 text-xs text-amber-600 font-medium">
            Azure 주소 설정이 없어서 Supabase를 사용 중이에요.
            {' '}VITE_AZURE_API_BASE_URL(Azure API 주소 설정값)을 .env.local에 넣으면 Azure 연결을 시도해요.
          </p>
        )}
        {reservations.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
            예약 내역이 없어요.
          </div>
        ) : (
          <div className="space-y-4">
            {reservations.map((r) => {
              const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending
              return (
                <div key={r.id} className={`bg-white rounded-xl border border-slate-200 border-l-4 shadow-sm px-5 py-4 ${cfg.border}`}>
                  <div className="flex justify-between items-start mb-3">
                    <span className="font-bold text-slate-800">{r.rooms?.name}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                  </div>
                  {/* 핵심 정보: 날짜·시간 크게 */}
                  <p className="text-sm font-semibold text-slate-700 mb-1">📅 {r.date} &nbsp; {r.start_time} ~ {r.end_time}</p>
                  {/* 부가 정보: 인원·목적 작게 */}
                  <div className="text-xs text-slate-400 space-y-0.5 mb-4">
                    <p>👥 {r.members_count}명</p>
                    <p>📝 {r.purpose}</p>
                  </div>

                  {/* 입실 버튼 */}
                  {r.status === 'approved' && (
                    <button onClick={() => handleCheckIn(r)}
                      className="mt-3 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
                      입실
                    </button>
                  )}

                  {/* 퇴실 버튼 */}
                  {r.status === 'checked_in' && (
                    <button onClick={() => handleCheckOut(r)}
                      className="mt-3 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors">
                      퇴실
                    </button>
                  )}

                  {/* 설문 버튼 */}
                  {r.status === 'completed' && !r.survey_done && (
                    <div className="mt-3 flex gap-2 flex-wrap">
                      <a href="https://docs.google.com/forms/d/e/1FAIpQLScOLI7fQS47GsjZhZcJYown00OZVfLDj5LtjJyV6IhvBfhOXw/viewform?usp=publish-editor"
                        target="_blank" rel="noreferrer"
                        className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium rounded-lg transition-colors">
                        📋 만족도 설문 참여하기
                      </a>
                      <button onClick={() => handleSurveyDone(r.id)}
                        className="px-4 py-2 bg-slate-400 hover:bg-slate-500 text-white text-sm font-medium rounded-lg transition-colors">
                        ✅ 설문 완료했어요
                      </button>
                    </div>
                  )}
                  {r.status === 'completed' && r.survey_done && (
                    <p className="mt-2 text-xs text-slate-400">설문 완료 ✅</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default MyPage