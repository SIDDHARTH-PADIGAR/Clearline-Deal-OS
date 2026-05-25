import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import LoginPage from './modules/Login';
import MainApp from './MainApp';
import Landing from './pages/Landing';
import Privacy from './pages/Privacy';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div className="loading-screen">Loading...</div>;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={session ? <Navigate to="/app" /> : <Landing />} />
        <Route path="/login" element={session ? <Navigate to="/app" /> : <LoginPage />} />
        <Route path="/signup" element={session ? <Navigate to="/app" /> : <LoginPage initialMode="signup" />} />
        <Route path="/app" element={session ? <MainApp session={session} /> : <Navigate to="/login" />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
