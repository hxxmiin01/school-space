import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fetchReservationsWithSource, updateReservationStatus, updateReservationSurveyDone, updateRoomStatus } from '../api/reservations'
import { trackApiCall, trackError, trackInteraction } from '../lib/telemetry'

const STATUS_CONFIG = {
  pending:    { label: '⏳ 대기 중',   border: 'border-l-blue-400',   badge: 'bg-blue-50 text-blue-600' },
  approved:   { label: '✅ 승인됨',    border: 'border-l-green-400',  badge: 'bg-green-50 text-green-700' },
  rejected:   { label: '❌ 거부됨',    border: 'border-l-red-400',    badge: 'bg-red-50 text-red-600' },
  checked_in: { label: '🔴 입실 중',   border: 'border-l-amber-400',  badge: 'bg-amber-50 text-amber-700' },
  completed:  { label: '🏁 이용 완료', border: 'border-l-slate-300',  badge: 'bg-slate-50 text-slate-500' },
}

const RESERVATIONS_PER_PAGE = 5

function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatLocalTime(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function isCheckInAvailable(reservation, currentTime) {
  if (reservation.status !== 'approved' || reservation.date !== formatLocalDate(currentTime)) {
    return false
  }

  const currentTimeText = formatLocalTime(currentTime)
  const startTime = String(reservation.start_time || '').slice(0, 5)
  const endTime = String(reservation.end_time || '').slice(0, 5)
  return startTime <= currentTimeText && currentTimeText < endTime
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
  const [currentTime, setCurrentTime] = useState(new Date())
  const [reservationPage, setReservationPage] = useState(1)

  function getSurveyDoneMap() {
    try {
      return JSON.parse(localStorage.getItem('survey_done_map') || '{}')
    } catch {
      return {}
    }
  }

  function setSurveyDoneFlag(reservationId, value) {
    const currentMap = getSurveyDoneMap()
    currentMap[String(reservationId)] = Boolean(value)
    localStorage.setItem('survey_done_map', JSON.stringify(currentMap))
  }

  useEffect(() => { fetchMyData() }, [])

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

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

      const surveyDoneMap = getSurveyDoneMap()
      const mergedReservations = (resResult?.reservations || []).map((reservation) => {
        const storedSurveyDone = surveyDoneMap[String(reservation.id)]
        if (storedSurveyDone === undefined) {
          return reservation
        }

        return { ...reservation, survey_done: Boolean(storedSurveyDone) }
      })

      setReservations(mergedReservations)
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
    trackInteraction('reservation_checkin_click', { reservationId: reservation.id })
    if (!isCheckInAvailable(reservation, currentTime)) {
      alert('예약 날짜와 시간에만 입실할 수 있어요.')
      return
    }

    try {
      await trackApiCall('rooms:update_occupied', () => updateRoomStatus(reservation.room_id, 'occupied'))
      await updateReservationStatus(reservation.id, 'checked_in')
      alert('입실 완료! 방이 사용 중으로 바뀌었어요.')
      fetchMyData()
    } catch (error) {
      trackError(error, { flow: 'checkin' })
      alert('입실 실패: ' + error.message)
    }
  }

  async function handleCheckOut(reservation) {
    trackInteraction('reservation_checkout_click', { reservationId: reservation.id })
    try {
      await trackApiCall('rooms:update_available', () => updateRoomStatus(reservation.room_id, 'available'))
      await updateReservationStatus(reservation.id, 'completed')
      alert('퇴실 완료! 방이 공실로 바뀌었어요.')
      fetchMyData()
    } catch (error) {
      trackError(error, { flow: 'checkout' })
      alert('퇴실 실패: ' + error.message)
    }
  }

  async function handleSurveyDone(reservationId) {
    trackInteraction('reservation_survey_done_click', { reservationId })
    try {
      await trackApiCall('reservations:update_survey_done', () => updateReservationSurveyDone(reservationId, true))
      setSurveyDoneFlag(reservationId, true)
      setReservations((current) =>
        current.map((reservation) =>
          String(reservation.id) === String(reservationId)
            ? { ...reservation, survey_done: true }
            : reservation
        )
      )
      alert('설문 완료로 표시했어요.')
      fetchMyData()
    } catch (error) {
      trackError(error, { flow: 'survey_done' })
      alert('설문 완료 처리 실패: ' + error.message)
    }
  }

  const totalPenalty = penalties.reduce((sum, p) => sum + p.points, 0)
  const isRestricted = totalPenalty >= 10
  const reservationPageCount = Math.max(1, Math.ceil(reservations.length / RESERVATIONS_PER_PAGE))
  const visibleReservationPage = Math.min(reservationPage, reservationPageCount)
  const visibleReservations = reservations.slice(
    (visibleReservationPage - 1) * RESERVATIONS_PER_PAGE,
    visibleReservationPage * RESERVATIONS_PER_PAGE
  )
  const firstVisibleReservation = reservations.length === 0 ? 0 : (visibleReservationPage - 1) * RESERVATIONS_PER_PAGE + 1
  const lastVisibleReservation = Math.min(visibleReservationPage * RESERVATIONS_PER_PAGE, reservations.length)

  if (loading) return (
    <div className="max-w-2xl mx-auto px-4 py-8 text-center text-slate-400">불러오는 중...</div>
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-7">
      <header className="border-b border-slate-200 pb-5">
        <p className="mb-2 text-xs font-semibold tracking-wide text-slate-400">SCHOOL SPACE · MY PAGE</p>
        <h1 className="text-[28px] font-semibold leading-8 tracking-tight text-slate-800">마이페이지</h1>
        <p className="mt-2 text-sm text-slate-500">내 정보와 스터디룸 이용 내역을 확인해요.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* 프로필 카드 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-800">내 정보</h2>
        <div className="space-y-2 text-sm text-slate-600">
          <p>이름: <span className="font-semibold text-slate-800">{userName || '미설정'}</span></p>
          <p className="break-all">계정: <span className="text-slate-500">{userEmail}</span></p>
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
      </section>

      {/* 패널티 현황 카드 */}
      <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${isRestricted ? 'border-t-2 border-t-red-500' : ''}`}>
        <h2 className="mb-3 font-semibold text-slate-800">패널티 현황</h2>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-sm text-slate-600">누적 점수</span>
          <span className={`text-lg font-bold ${isRestricted ? 'text-red-600' : 'text-slate-800'}`}>
            {totalPenalty}
          </span>
          <span className="text-sm text-slate-400">/ 10점</span>
          {isRestricted && (
            <span className="text-xs bg-red-50 text-red-600 font-medium px-2 py-0.5 rounded-full">⚠️ 1주 이용 제한</span>
          )}
        </div>
        {penalties.length > 0 ? (
          <ul className="max-h-36 space-y-2 overflow-y-auto border-t border-slate-100 pt-3">
            {penalties.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 text-xs text-slate-600">
                <span className="min-w-0"><span className="text-slate-400">{new Date(p.created_at).toLocaleDateString()}</span><span className="ml-2 break-words">{p.reason}</span></span>
                <span className="shrink-0 font-semibold text-red-500">+{p.points}점</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-t border-slate-100 pt-3 text-sm text-slate-400">패널티가 없어요.</p>
        )}
      </section>
      </div>

      {/* 예약 내역 */}
      <div className="pt-2">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-bold text-slate-800">내 예약 내역</h2>
            <p className="mt-1 text-sm text-slate-500">최근 예약부터 확인할 수 있어요.</p>
          </div>
          {reservations.length > 0 && <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">총 {reservations.length}건</span>}
        </div>
        {reservations.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
            예약 내역이 없어요.
          </div>
        ) : (
          <div className="space-y-3">
            {visibleReservations.map((r) => {
              const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending
              const canCheckIn = isCheckInAvailable(r, currentTime)
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
                  {r.status === 'approved' && canCheckIn && (
                    <button onClick={() => handleCheckIn(r)}
                      className="mt-3 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
                      입실
                    </button>
                  )}
                  {r.status === 'approved' && !canCheckIn && (
                    <p className="mt-3 text-xs text-slate-500">예약한 날짜와 시간에 입실 버튼이 표시돼요.</p>
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
        {reservations.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <p className="text-xs text-slate-500">{firstVisibleReservation}–{lastVisibleReservation}건 표시 · 전체 {reservations.length}건</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setReservationPage(visibleReservationPage - 1)} disabled={visibleReservationPage === 1}
                className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">이전</button>
              <span className="min-w-14 text-center text-xs text-slate-500">{visibleReservationPage} / {reservationPageCount}</span>
              <button type="button" onClick={() => setReservationPage(visibleReservationPage + 1)} disabled={visibleReservationPage === reservationPageCount}
                className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">다음</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MyPage
