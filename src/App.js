import React, { useEffect, useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  Navigate,
  useLocation,
  useNavigate
} from 'react-router-dom';

import Login from './Login';
import Recepcion from './Recepcion';
import ClasificacionEntrega from './ClasificacionEntrega';
import { supabase } from './supabaseClient';

function AppWrapper() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [rol, setRol] = useState(null);
  const [cargando, setCargando] = useState(true); // ← 🔹 control de carga
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const obtenerUsuarioYRol = async () => {
      const { data } = await supabase.auth.getUser();
      const usuario = data?.user;
      setUser(usuario);

      if (usuario) {
        const { data: perfil, error } = await supabase
          .from('profiles')
          .select('rol')
          .eq('id', usuario.id)
          .single();

        if (!error && perfil) {
          setRol(perfil.rol);
        }
      }

      setCargando(false); // ← ✅ importante
    };

    obtenerUsuarioYRol();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        supabase
          .from('profiles')
          .select('rol')
          .eq('id', session.user.id)
          .single()
          .then(({ data, error }) => {
            if (!error && data) {
              setRol(data.rol);
            }
            setCargando(false);
          });
      } else {
        setUser(null);
        setRol(null);
        setCargando(false);
        navigate('/login');
      }
    });

    return () => listener?.subscription.unsubscribe();
  }, [navigate]);

  // Redirige cuando ya tenemos user y rol
  useEffect(() => {
    if (!cargando && user && rol === 'recepcion') {
      navigate('/recepcion', { replace: true });
    } else if (!cargando && user && rol === 'clasificacion') {
      navigate('/clasificacion-entrega', { replace: true });
    }
  }, [cargando, user, rol, navigate]);

  return (
    <div>
      {/* Barra superior */}
      <div style={{ padding: '1rem', background: '#eee' }}>
        <Link to="/login" style={{ marginRight: '1rem' }}>Inicio de Sesión</Link>
        {user && rol === 'recepcion' && (
          <Link to="/recepcion" style={{ marginRight: '1rem' }}>Recepción</Link>
        )}
        {user && rol === 'clasificacion' && (
          <Link to="/clasificacion-entrega">Clasificación (entrega)</Link>
        )}
      </div>

      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/recepcion"
          element={
            cargando ? null : user && rol === 'recepcion' ? (
              <Recepcion />
            ) : (
              <Navigate to="/login" replace state={{ from: location.pathname }} />
            )
          }
        />

        <Route
          path="/clasificacion-entrega"
          element={
            cargando ? null : user && rol === 'clasificacion' ? (
              <ClasificacionEntrega />
            ) : (
              <Navigate to="/login" replace state={{ from: location.pathname }} />
            )
          }
        />

        <Route path="*" element={<h2 style={{ padding: '2rem' }}>Página no encontrada</h2>} />
      </Routes>
    </div>
  );
}

export default AppWrapper;
