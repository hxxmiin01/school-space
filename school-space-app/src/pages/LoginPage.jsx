import { useState } from 'react'
import { supabase } from '../supabaseClient'

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

  function switchMode(toSignUp) {
    setIsSignUp(toSignUp)
    setEmail(''); setPassword(''); setName(''); setGrade(''); setClassNum('')
    setErrorMsg('')
  }

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setErrorMsg('로그인 실패: ' + error.message)
    setLoading(false)
  }

  async function handleSignUp(e) {
    e.preventDefault()
    if (!name) { setErrorMsg('이름을 입력해주세요.'); return }
    if (!grade) { setErrorMsg('학년을 선택해주세요.'); return }
    if (!classNum) { setErrorMsg('반을 선택해주세요.'); return }
    setLoading(true)
    setErrorMsg('')

    const className = `${grade}학년 ${classNum}반`

    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setErrorMsg('회원가입 실패: ' + error.message)
      setLoading(false)
      return
    }

    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        role: 'student',
        name,
        class_name: className,
      })
      if (profileError) {
        setErrorMsg('프로필 저장 실패: ' + profileError.message)
        setLoading(false)
        return
      }
    }

    setIsSignUp(false)
    setEmail(''); setPassword(''); setName(''); setGrade(''); setClassNum('')
    setErrorMsg('✅ 가입이 완료됐어요! 로그인해주세요.')
    setLoading(false)
  }

  const inputClass = 'w-full px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 caret-slate-800 border border-slate-300 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all bg-slate-100 hover:bg-slate-200/70 focus:bg-blue-50'
  const selectClass = 'flex-1 px-3 py-3 text-sm text-slate-800 border border-slate-300 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all bg-slate-100 hover:bg-slate-200/70 focus:bg-blue-50'

  return (
    <div className="min-h-screen px-4 flex items-center justify-center bg-[radial-gradient(circle_at_15%_12%,rgba(59,130,246,0.22),transparent_35%),radial-gradient(circle_at_87%_18%,rgba(14,165,233,0.2),transparent_30%),linear-gradient(180deg,#f8fbff_0%,#f3f7ff_48%,#eef3ff_100%)]">
      <div className="w-full max-w-md rounded-3xl border border-white/70 bg-white/86 backdrop-blur shadow-[0_22px_60px_rgba(15,23,42,0.16)] p-7 sm:p-8">
        <div className="text-center mb-7">
          <p className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide text-blue-700 bg-blue-50 border border-blue-100">
            STUDY SPACE ACCESS
          </p>
          <div className="text-4xl mt-3 mb-3">🏫</div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">스쿨스페이스</h1>
          <p className="text-slate-500 text-sm mt-1.5">
            {isSignUp ? '새 계정을 만들고 스터디룸을 예약해보세요' : '계정에 로그인하고 공간 현황을 확인해보세요'}
          </p>
        </div>

        <div className="relative flex bg-slate-100/80 rounded-xl p-1 mb-4 overflow-hidden select-none">
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-white shadow-sm transition-transform duration-300 ease-out ${
              isSignUp ? 'translate-x-full' : 'translate-x-0'
            }`}
          />
          <button
            type="button"
            onClick={() => switchMode(false)}
            className={`relative z-10 flex-1 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 cursor-pointer ${
              !isSignUp
                ? 'text-slate-800'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/70'
            }`}
          >
            로그인
          </button>
          <button
            type="button"
            onClick={() => switchMode(true)}
            className={`relative z-10 flex-1 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 cursor-pointer ${
              isSignUp
                ? 'text-slate-800'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/70'
            }`}
          >
            회원가입
          </button>
        </div>

        <form className="flex flex-col gap-3">
          {isSignUp && (
            <input type="text" placeholder="이름" value={name}
              onChange={(e) => setName(e.target.value)} className={inputClass} />
          )}
          <input type="email" placeholder="이메일" value={email}
            onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          <div className="relative">
            <input type={showPassword ? 'text' : 'password'} placeholder={isSignUp ? '비밀번호 (6자리 이상)' : '비밀번호'} value={password}
              onChange={(e) => setPassword(e.target.value)} className={inputClass + ' pr-11'} />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
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
          </div>
          {isSignUp && (
            <div className="flex gap-2">
              <select value={grade} onChange={(e) => setGrade(e.target.value)} className={selectClass}>
                <option value="">학년 선택</option>
                <option value="1">1학년</option>
                <option value="2">2학년</option>
                <option value="3">3학년</option>
              </select>
              <select value={classNum} onChange={(e) => setClassNum(e.target.value)} className={selectClass}>
                <option value="">반 선택</option>
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <option key={n} value={n}>{n}반</option>
                ))}
              </select>
            </div>
          )}
          {errorMsg && (
            <p className={`text-sm px-3 py-2.5 rounded-xl border ${errorMsg.startsWith('✅') ? 'text-blue-700 bg-blue-50 border-blue-100' : 'text-red-600 bg-red-50 border-red-100'}`}>
              {errorMsg}
            </p>
          )}
          {isSignUp ? (
            <>
              <button onClick={handleSignUp} disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-50 mt-1 shadow-[0_10px_22px_rgba(37,99,235,0.24)]">
                {loading ? '처리 중...' : '회원가입 완료'}
              </button>
            </>
          ) : (
            <>
              <button onClick={handleLogin} disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-50 mt-1 shadow-[0_10px_22px_rgba(37,99,235,0.24)]">
                {loading ? '처리 중...' : '로그인'}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  )
}

export default LoginPage