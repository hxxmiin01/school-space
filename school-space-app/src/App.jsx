import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import HomePage from './pages/HomePage'
import ReservationPage from './pages/ReservationPage'
import MyPage from './pages/MyPage'
import LoginPage from './pages/LoginPage'
import AdminPage from './pages/AdminPage'
import './App.css'

function App() {
  const [session, setSession] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setIsAdmin(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
    setIsAdmin(data?.role === 'admin')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  if (!session) return <LoginPage />

  return (
    <BrowserRouter>
      <nav className="navbar">
        <div className="navbar-brand-wrap">
          <span className="navbar-brand-emoji">🏫</span>
          <span className="navbar-brand">스쿨스페이스</span>
        </div>
        <NavLink to="/" end className={({ isActive }) => isActive ? 'navbar-link-active' : ''}>공간 현황</NavLink>
        <NavLink to="/mypage" className={({ isActive }) => isActive ? 'navbar-link-active' : ''}>마이페이지</NavLink>
        {isAdmin && <NavLink to="/admin" className={({ isActive }) => isActive ? 'navbar-link-active' : ''}>담당자 관리</NavLink>}
        <button onClick={handleLogout} className="navbar-logout">로그아웃</button>
      </nav>

      <div className="app-shell">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/reservation" element={<ReservationPage />} />
          <Route path="/mypage" element={<MyPage />} />
          <Route path="/admin" element={isAdmin ? <AdminPage /> : <Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
