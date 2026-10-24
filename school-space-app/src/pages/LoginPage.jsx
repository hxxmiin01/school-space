import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { trackApiCall, trackError, trackInteraction } from '../lib/telemetry'

function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [grade, setGrade] = useState('')
  const [classNum, setClassNum] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [canResendVerification, setCanResendVerification] = useState(false)
  const trimmedEmail = email.trim()
  const trimmedName = name.trim()
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const isValidEmail = emailPattern.test(trimmedEmail)
  const loginReady = trimmedEmail && password
  const signUpReady = trimmedName && isValidEmail && password.length >= 6 && grade && classNum

  function toFriendlyAuthError(error, actionLabel) {
    const rawMessage = String(error?.message || '')
    if (rawMessage.includes('Failed to fetch')) {
      return `${actionLabel} 실패: 인증 서버에 연결하지 못했어요. .env의 VITE_SUPABASE_URL 주소가 올바른지 확인해주세요.`
    }
    return `${actionLabel} 실패: ${rawMessage || '알 수 없는 오류가 발생했어요.'}`
  }

  function switchMode(toSignUp) {
    setIsSignUp(toSignUp)
    setEmail(''); setPassword(''); setName(''); setGrade(''); setClassNum('')
    setErrorMsg('')
    setCanResendVerification(false)
  }

  async function handleLogin(e) {
    e.preventDefault()
    trackInteraction('login_submit')
    setLoading(true)
    setErrorMsg('')
    const { data, error } = await trackApiCall('auth:signInWithPassword', () =>
      supabase.auth.signInWithPassword({ email: trimmedEmail, password })
    )
    if (error) {
      trackError(error, { flow: 'login' })
      setErrorMsg(toFriendlyAuthError(error, '로그인'))
    } else if (!data.user?.email_confirmed_at) {
      await supabase.auth.signOut()
      setErrorMsg('이메일 인증(메일함에서 링크 누르기) 후 로그인해주세요.')
    }
    setLoading(false)
  }

  async function handleSignUp(e) {
    e.preventDefault()
    trackInteraction('signup_submit')
    if (!name) { setErrorMsg('이름을 입력해주세요.'); return }
    if (!isValidEmail) { setErrorMsg('이메일 형식이 올바르지 않아요. 예: student@school.com'); return }
    if (!grade) { setErrorMsg('학년을 선택해주세요.'); return }
    if (!classNum) { setErrorMsg('반을 선택해주세요.'); return }
    setLoading(true)
    setErrorMsg('')

    const className = `${grade}학년 ${classNum}반`

    const { data, error } = await trackApiCall('auth:signUp', () =>
      supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: {
            name: trimmedName,
            class_name: className,
          },
        },
      })
    )
    if (error) {
      trackError(error, { flow: 'signup' })
      setErrorMsg(toFriendlyAuthError(error, '회원가입'))
      setLoading(false)
      return
    }

    setCanResendVerification(true)
    setPassword('')
    setErrorMsg(
      data.user?.email_confirmed_at
        ? '✅ 가입이 완료됐어요! 로그인해주세요.'
        : '📩 가입 완료! 이메일 인증(메일함에서 링크 누르기) 후 로그인해주세요.'
    )
    setLoading(false)
  }

  async function handleResendVerification() {
    if (!isValidEmail) {
      setErrorMsg('먼저 올바른 이메일을 입력해주세요. 예: student@school.com')
      return
    }
    setLoading(true)
    setErrorMsg('')
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: trimmedEmail,
    })
    if (error) {
      setErrorMsg(toFriendlyAuthError(error, '인증메일 재전송'))
    } else {
      setErrorMsg('📩 인증메일을 다시 보냈어요. 메일함(스팸함 포함)을 확인해주세요.')
    }
    setLoading(false)
  }

  const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-colors focus:border-slate-500 focus:ring-4 focus:ring-slate-100'
  const selectClass = 'min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none transition-colors focus:border-slate-500 focus:ring-4 focus:ring-slate-100'
  const isSuccessMessage = errorMsg.startsWith('✅') || errorMsg.startsWith('📩')

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F8FA] px-4 py-10">
      <div className="w-full max-w-[420px] rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_28px_rgba(16,24,40,0.06)] sm:p-8">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-2xl">🏫</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">스쿨스페이스</h1>
          <p className="text-slate-500 text-sm mt-1.5">
            {isSignUp ? '새 계정을 만들고 스터디룸을 예약해보세요' : '계정에 로그인하고 공간 현황을 확인해보세요'}
          </p>
        </div>

        <div className="relative mb-5 flex select-none overflow-hidden rounded-lg bg-slate-100 p-1">
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-white shadow-sm transition-transform duration-300 ease-out ${
              isSignUp ? 'translate-x-full' : 'translate-x-0'
            }`}
          />
          <button
            type="button"
            onClick={() => switchMode(false)}
            className={`relative z-10 min-h-10 flex-1 rounded-md py-2 text-sm font-semibold transition-colors duration-200 cursor-pointer ${
              !isSignUp
                ? 'text-slate-800'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            로그인
          </button>
          <button
            type="button"
            onClick={() => switchMode(true)}
            className={`relative z-10 min-h-10 flex-1 rounded-md py-2 text-sm font-semibold transition-colors duration-200 cursor-pointer ${
              isSignUp
                ? 'text-slate-800'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            회원가입
          </button>
        </div>

        <form className="flex flex-col gap-4">
          {isSignUp && (
            <label className="block space-y-1.5 text-sm font-medium text-slate-700">
              이름
              <input type="text" autoComplete="name" placeholder="이름을 입력해주세요" value={name}
                onChange={(e) => setName(e.target.value)} className={inputClass} />
            </label>
          )}
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            이메일
            <input type="email" autoComplete="email" placeholder="이메일 주소를 입력해주세요" value={email}
              onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            비밀번호
            <span className="relative block">
            <input type={showPassword ? 'text' : 'password'} autoComplete={isSignUp ? 'new-password' : 'current-password'} placeholder={isSignUp ? '6자리 이상 입력해주세요' : '비밀번호를 입력해주세요'} value={password}
              onChange={(e) => setPassword(e.target.value)} className={inputClass + ' pr-11'} />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
              {showPassword ? (
                // 눈 감기 아이콘
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                // 눈 뜨기 아이콘
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
            </span>
          </label>
          {isSignUp && (
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                학년
                <select value={grade} onChange={(e) => setGrade(e.target.value)} className={selectClass}>
                  <option value="">학년 선택</option>
                  <option value="1">1학년</option>
                  <option value="2">2학년</option>
                  <option value="3">3학년</option>
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                반
                <select value={classNum} onChange={(e) => setClassNum(e.target.value)} className={selectClass}>
                  <option value="">반 선택</option>
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <option key={n} value={n}>{n}반</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {errorMsg && (
            <p role="status" className={`text-sm px-3 py-2.5 rounded-lg border ${isSuccessMessage ? 'text-green-800 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200'}`}>
              {errorMsg}
            </p>
          )}
          {isSignUp ? (
            <>
              <button onClick={handleSignUp} disabled={loading || !signUpReady}
                className="mt-1 min-h-12 w-full rounded-lg bg-slate-700 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
                {loading ? '처리 중...' : '회원가입 완료'}
              </button>
              {canResendVerification && (
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={loading || !isValidEmail}
                  className="min-h-11 w-full rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  인증메일 다시 보내기
                </button>
              )}
            </>
          ) : (
            <>
              <button onClick={handleLogin} disabled={loading || !loginReady}
                className="mt-1 min-h-12 w-full rounded-lg bg-slate-700 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
                {loading ? '처리 중...' : '로그인'}
              </button>
            </>
          )}
        </form>
      </div>
    </main>
  )
}

export default LoginPage
