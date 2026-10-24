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
import { BookOpenCheck, LayoutDashboard, LogOut, ShieldCheck, School } from 'lucide-react'
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
  const [userEmail, setUserEmail] = useState('')

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
    setIsAdmin(data?.role === 'admin')
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUserEmail(session?.user?.email || '')
      if (session) fetchProfile(session.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUserEmail(session?.user?.email || '')
      if (session) fetchProfile(session.user.id)
      else setIsAdmin(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    trackInteraction('logout_click')
    await trackApiCall('auth:signOut', () => supabase.auth.signOut())
  }

  if (!session) return <LoginPage />

  return (
    <BrowserRouter>
      <PageViewTracker />
      <div className="app-frame">
        <aside className="app-sidebar">
          <NavLink to="/" className="sidebar-brand" aria-label="스쿨스페이스 홈">
            <span className="sidebar-brand-mark"><School size={21} strokeWidth={1.8} /></span>
            <span className="sidebar-brand-name">스쿨스페이스</span>
          </NavLink>
          <p className="sidebar-section-label">메뉴</p>
          <nav className="sidebar-nav" aria-label="주 메뉴">
            <NavLink to="/" end onClick={() => trackInteraction('nav_click', { to: '/' })} className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link-active' : ''}`} title="공간 현황">
              <LayoutDashboard size={19} strokeWidth={1.8} /><span className="sidebar-link-label">공간 현황</span>
            </NavLink>
            <NavLink to="/mypage" onClick={() => trackInteraction('nav_click', { to: '/mypage' })} className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link-active' : ''}`} title="마이페이지">
              <BookOpenCheck size={19} strokeWidth={1.8} /><span className="sidebar-link-label">마이페이지</span>
            </NavLink>
            {isAdmin && <NavLink to="/admin" onClick={() => trackInteraction('nav_click', { to: '/admin' })} className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link-active' : ''}`} title="담당자 관리">
              <ShieldCheck size={19} strokeWidth={1.8} /><span className="sidebar-link-label">담당자 관리</span>
            </NavLink>}
          </nav>
          <div className="sidebar-bottom">
            <button onClick={handleLogout} className="sidebar-logout" title="로그아웃"><LogOut size={18} strokeWidth={1.8} /><span className="sidebar-link-label">로그아웃</span></button>
            <div className="sidebar-user" title={userEmail}>{userEmail}</div>
          </div>
        </aside>
        <main className="app-content app-shell">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/reservation" element={<ReservationPage />} />
            <Route path="/mypage" element={<MyPage />} />
            <Route path="/admin" element={isAdmin ? <AdminPage /> : <Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      <AssistantWidget />
    </BrowserRouter>
  )
}

export default App
