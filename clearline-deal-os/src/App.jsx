import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import LoginPage from './modules/Login';
import MainApp from './MainApp'; // Sidebar + Topbar + module router

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
  if (!session) return <LoginPage />;
  return <MainApp session={session} />;
}
