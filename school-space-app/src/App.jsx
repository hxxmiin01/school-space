import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { supabase } from './supabaseClient'
import HomePage from './pages/HomePage'
import ReservationPage from './pages/ReservationPage'
import MyPage from './pages/MyPage'
import LoginPage from './pages/LoginPage'
import AdminPage from './pages/AdminPage'
import AssistantWidget from './components/AssistantWidget'
import { trackApiCall, trackInteraction, trackPageView } from './lib/telemetry'
import './App.css'

// Records a page-view event every time the route changes. Rendered inside
// <BrowserRouter> (below) since `useLocation` requires a router ancestor.
// This is the "page interaction" half of the observability starter — see
// src/lib/telemetry.js and docs/observability-plan.md.
function PageViewTracker() {
  const location = useLocation()

  useEffect(() => {
    trackPageView(location.pathname, { search: location.search || undefined })
  }, [location.pathname, location.search])

  return null
}

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
    trackInteraction('logout_click')
    await trackApiCall('auth:signOut', () => supabase.auth.signOut())
  }

  if (!session) return <LoginPage />

  return (
    <BrowserRouter>
      <PageViewTracker />
      <nav className="navbar">
        <div className="navbar-brand-wrap">
          <span className="navbar-brand-emoji">🏫</span>
          <span className="navbar-brand">스쿨스페이스</span>
        </div>
        <NavLink to="/" end onClick={() => trackInteraction('nav_click', { to: '/' })} className={({ isActive }) => isActive ? 'navbar-link-active' : ''}>공간 현황</NavLink>
        <NavLink to="/mypage" onClick={() => trackInteraction('nav_click', { to: '/mypage' })} className={({ isActive }) => isActive ? 'navbar-link-active' : ''}>마이페이지</NavLink>
        {isAdmin && <NavLink to="/admin" onClick={() => trackInteraction('nav_click', { to: '/admin' })} className={({ isActive }) => isActive ? 'navbar-link-active' : ''}>담당자 관리</NavLink>}
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

      <AssistantWidget />
    </BrowserRouter>
  )
}

export default App
