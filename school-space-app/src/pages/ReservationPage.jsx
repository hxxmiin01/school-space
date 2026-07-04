import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 6 }, (_, i) => String(i * 10).padStart(2, '0'))

function splitTime(time) {
  if (!time || !time.includes(':')) return { hour: '', minute: '' }
  const [hour, minute] = time.split(':')
  return { hour, minute }
}

function combineTime(hour, minute) {
  if (!hour || !minute) return ''
  return `${hour}:${minute}`
}

function getDefaultEndTime(hour, minute) {
  if (!hour || !minute) return null
  const total = Number(hour) * 60 + Number(minute)
  const next = total + 30
  if (next >= 24 * 60) return null
  const nextHour = String(Math.floor(next / 60)).padStart(2, '0')
  const nextMinute = String(next % 60).padStart(2, '0')
  return { hour: nextHour, minute: nextMinute }
}

function ReservationPage() {
  const location = useLocation()   // 홈에서 넘겨준 방 정보를 받아옴
  const navigate = useNavigate()
  const room = location.state?.room  // 선택한 방

  const [date, setDate] = useState('')
  const [startHour, setStartHour] = useState('')
  const [startMinute, setStartMinute] = useState('')
  const [endHour, setEndHour] = useState('')
  const [endMinute, setEndMinute] = useState('')
  const [membersCount, setMembersCount] = useState(1)
  const [purpose, setPurpose] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const startTimePreview = combineTime(startHour, startMinute)
  const endTimePreview = combineTime(endHour, endMinute)
  const fieldLabelClass = 'block text-sm font-medium text-slate-700'
  const inputClass = 'w-full mt-1.5 px-3 py-2.5 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white'
  const selectClass = 'w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400'

  // 방 선택 없이 직접 접근한 경우
  if (!room) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center">
          <p className="text-slate-600 mb-4">홈 화면에서 방을 먼저 선택해주세요.</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
          >
            홈으로 이동
          </button>
        </div>
      </div>
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    const startTime = combineTime(startHour, startMinute)
    const endTime = combineTime(endHour, endMinute)

    if (!startTime || !endTime) {
      setErrorMsg('시작 시간과 종료 시간의 시/분을 모두 선택해주세요.')
      setLoading(false)
      return
    }

    // 기본 시간 검증: 시작 시간은 종료 시간보다 빨라야 함
    if (startTime >= endTime) {
      setErrorMsg('시작 시간은 종료 시간보다 빨라야 해요.')
      setLoading(false)
      return
    }

    // 기본 날짜 검증: 오늘 이전 날짜는 예약 불가
    const selectedDate = new Date(`${date}T00:00:00`)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (selectedDate < today) {
      setErrorMsg('지난 날짜는 예약할 수 없어요. 오늘 이후 날짜를 선택해주세요.')
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()

    // 1. 패널티 10점 이상이면 예약 차단
    const { data: penalties } = await supabase
      .from('penalties')
      .select('points')
      .eq('user_id', user.id)
    const totalPoints = penalties?.reduce((sum, p) => sum + p.points, 0) || 0
    if (totalPoints >= 10) {
      setErrorMsg('패널티 누적 10점으로 이용이 제한됐어요. 담당자에게 문의해주세요.')
      setLoading(false)
      return
    }

    // 2. 선택한 날짜의 주(월~일) 계산
    const day = selectedDate.getDay() // 0=일, 1=월 ... 6=토
    const monday = new Date(selectedDate)
    monday.setDate(selectedDate.getDate() - (day === 0 ? 6 : day - 1))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    const toStr = (d) => d.toISOString().split('T')[0]

    // 3. 같은 학급의 이번 주 예약 수 확인
    const { data: profile } = await supabase.from('profiles').select('class_name').eq('id', user.id).single()
    if (profile?.class_name) {
      // 같은 학급 사용자 id 목록 가져오기
      const { data: classmates } = await supabase
        .from('profiles')
        .select('id')
        .eq('class_name', profile.class_name)
      const classmateIds = classmates?.map(c => c.id) || []

      const { data: weekReservations } = await supabase
        .from('reservations')
        .select('id')
        .in('user_id', classmateIds)
        .gte('date', toStr(monday))
        .lte('date', toStr(sunday))
        .neq('status', 'rejected')

      if ((weekReservations?.length || 0) >= 3) {
        setErrorMsg(`우리 반(${profile.class_name})은 이번 주에 이미 3일 이상 예약했어요. 다음 주에 다시 시도해주세요.`)
        setLoading(false)
        return
      }
    }

    // 4. 같은 방/같은 날짜 시간 겹침 예약 차단
    const { data: sameRoomReservations, error: overlapFetchError } = await supabase
      .from('reservations')
      .select('start_time, end_time, status')
      .eq('room_id', room.id)
      .eq('date', date)
      .neq('status', 'rejected')

    if (overlapFetchError) {
      setErrorMsg('기존 예약 확인 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.')
      setLoading(false)
      return
    }

    const hasOverlap = (sameRoomReservations || []).some((reservation) => {
      const existingStart = reservation.start_time
      const existingEnd = reservation.end_time
      // 겹침 조건: 새 시작 < 기존 종료 && 새 종료 > 기존 시작
      return startTime < existingEnd && endTime > existingStart
    })

    if (hasOverlap) {
      setErrorMsg('선택한 시간에 이미 예약이 있어요. 다른 시간을 선택해주세요.')
      setLoading(false)
      return
    }

    // 5. 같은 사용자/같은 날짜 시간 겹침 예약 차단 (다른 방 포함)
    const { data: myReservations, error: myOverlapFetchError } = await supabase
      .from('reservations')
      .select('start_time, end_time, status')
      .eq('user_id', user.id)
      .eq('date', date)
      .neq('status', 'rejected')

    if (myOverlapFetchError) {
      setErrorMsg('내 예약 확인 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.')
      setLoading(false)
      return
    }

    const hasMyOverlap = (myReservations || []).some((reservation) => {
      const existingStart = reservation.start_time
      const existingEnd = reservation.end_time
      return startTime < existingEnd && endTime > existingStart
    })

    if (hasMyOverlap) {
      setErrorMsg('내 예약 시간과 겹쳐요. 다른 시간을 선택해주세요.')
      setLoading(false)
      return
    }

    const { error } = await supabase.from('reservations').insert({
      room_id: room.id,
      user_id: user.id,
      date,
      start_time: startTime,
      end_time: endTime,
      members_count: membersCount,
      purpose,
      status: 'pending',
    })

    if (error) {
      setErrorMsg('예약 실패: ' + error.message)
    } else {
      setDate('')
      setStartHour('')
      setStartMinute('')
      setEndHour('')
      setEndMinute('')
      setMembersCount(1)
      setPurpose('')
      alert('예약 신청이 완료됐어요! 담당자 승인을 기다려주세요.')
      navigate('/')
    }
    setLoading(false)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-7">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">예약 신청</h1>
          <p className="text-sm text-slate-500 mt-1">
            선택한 공간: <span className="font-semibold text-slate-700">{room.name}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className={fieldLabelClass}>
            날짜
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={todayStr}
              required
              className={inputClass}
            />
          </label>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
            <p className="text-sm font-semibold text-slate-700">이용 시간 선택</p>
            <p className="text-xs text-slate-500 mt-1 mb-3">분은 10분 단위로 선택할 수 있어요.</p>
            {(startTimePreview || endTimePreview) && (
              <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                선택 시간: <span className="font-semibold">{startTimePreview || '--:--'} ~ {endTimePreview || '--:--'}</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className={fieldLabelClass}>
                시작 시간
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <select
                    value={startHour}
                    onChange={(e) => {
                      const nextHour = e.target.value
                      const nextMinute = startMinute || '00'
                      const nextStartTime = combineTime(nextHour, nextMinute)
                      const currentEndTime = combineTime(endHour, endMinute)
                      setStartHour(nextHour)
                      if (!startMinute && nextHour) setStartMinute('00')

                      if (!currentEndTime || (nextStartTime && currentEndTime <= nextStartTime)) {
                        const suggestedEnd = getDefaultEndTime(nextHour, nextMinute)
                        if (suggestedEnd) {
                          setEndHour(suggestedEnd.hour)
                          setEndMinute(suggestedEnd.minute)
                        } else {
                          setEndHour('')
                          setEndMinute('')
                        }
                      }
                    }}
                    required
                    className={selectClass}
                  >
                    <option value="">시</option>
                    {HOURS.map((h) => (
                      <option key={h} value={h}>{h}시</option>
                    ))}
                  </select>
                  <select
                    value={startMinute}
                    onChange={(e) => {
                      const nextMinute = e.target.value
                      const nextStartTime = combineTime(startHour, nextMinute)
                      const currentEndTime = combineTime(endHour, endMinute)
                      setStartMinute(nextMinute)

                      if (!currentEndTime || (nextStartTime && currentEndTime <= nextStartTime)) {
                        const suggestedEnd = getDefaultEndTime(startHour, nextMinute)
                        if (suggestedEnd) {
                          setEndHour(suggestedEnd.hour)
                          setEndMinute(suggestedEnd.minute)
                        } else {
                          setEndHour('')
                          setEndMinute('')
                        }
                      }
                    }}
                    required
                    disabled={!startHour}
                    className={selectClass}
                  >
                    <option value="">분</option>
                    {MINUTES.map((m) => (
                      <option key={m} value={m}>{m}분</option>
                    ))}
                  </select>
                </div>
              </label>

              <label className={fieldLabelClass}>
                종료 시간
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <select
                    value={endHour}
                    onChange={(e) => {
                      setEndHour(e.target.value)
                      if (e.target.value && !endMinute) setEndMinute('00')
                    }}
                    required
                    className={selectClass}
                  >
                    <option value="">시</option>
                    {HOURS.map((h) => (
                      <option key={h} value={h}>{h}시</option>
                    ))}
                  </select>
                  <select
                    value={endMinute}
                    onChange={(e) => setEndMinute(e.target.value)}
                    required
                    disabled={!endHour}
                    className={selectClass}
                  >
                    <option value="">분</option>
                    {MINUTES.map((m) => (
                      <option key={m} value={m}>{m}분</option>
                    ))}
                  </select>
                </div>
              </label>
            </div>
          </div>

          <label className={fieldLabelClass}>
            사용 인원
            <input
              type="number"
              min="1"
              max="10"
              value={membersCount}
              onChange={(e) => setMembersCount(Number(e.target.value))}
              required
              className={inputClass}
            />
          </label>

          <label className={fieldLabelClass}>
            사용 목적 (학습 계획 포함)
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              required
              rows={4}
              placeholder="예: 수학 시험 대비 그룹 스터디"
              className="w-full mt-1.5 px-3 py-2.5 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 resize-y bg-white"
            />
          </label>

          {errorMsg && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {errorMsg}
            </p>
          )}

          <div className="pt-2 space-y-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-60"
            >
              {loading ? '처리 중...' : '예약 신청하기'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 text-sm font-medium transition-colors"
            >
              취소하고 홈으로
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ReservationPage
