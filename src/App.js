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
import VentaForm from './VentaForm';
import VentasAdmin from './VentasAdmin';
import SecretariaAdmin from './SecretariaAdmin'; // <-- NUEVO
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
  const [cargando, setCargando] = useState(true);
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

      setCargando(false);
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

  useEffect(() => {
    if (!cargando && user) {
      const currentPath = location.pathname;

      if (rol === 'recepcion' && currentPath !== '/recepcion') {
        navigate('/recepcion', { replace: true });
      } else if (rol === 'clasificacion' && currentPath !== '/clasificacion-entrega') {
        navigate('/clasificacion-entrega', { replace: true });
      } else if (
        rol === 'secretaria' &&
        !['/ventas', '/ventas-admin', '/secretaria'].includes(currentPath) // <-- PERMITE /secretaria
      ) {
        navigate('/ventas', { replace: true });
      }
    }
  }, [cargando, user, rol, navigate, location.pathname]);

  return (
    <div>
      {/* Barra superior */}
      <div style={{ padding: '1rem', background: '#eee' }}>
        <Link to="/login" style={{ marginRight: '1rem' }}>Inicio de Sesión</Link>
        {user && rol === 'recepcion' && (
          <Link to="/recepcion" style={{ marginRight: '1rem' }}>Recepción</Link>
        )}
        {user && rol === 'clasificacion' && (
          <Link to="/clasificacion-entrega" style={{ marginRight: '1rem' }}>Clasificación (entrega)</Link>
        )}
        {user && rol === 'secretaria' && (
          <>
            <Link to="/ventas" style={{ marginRight: '1rem' }}>Ventas</Link>
            <Link to="/ventas-admin" style={{ marginRight: '1rem' }}>Admin</Link>
            <Link to="/secretaria">Secretaría</Link> {/* <-- NUEVO */}
          </>
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

        <Route
          path="/ventas"
          element={
            cargando ? null : user && rol === 'secretaria' ? (
              <VentaForm />
            ) : (
              <Navigate to="/login" replace state={{ from: location.pathname }} />
            )
          }
        />

        <Route
          path="/ventas-admin"
          element={
            cargando ? null : user && rol === 'secretaria' ? (
              <VentasAdmin />
            ) : (
              <Navigate to="/login" replace state={{ from: location.pathname }} />
            )
          }
        />

        {/* <-- NUEVA RUTA SECRETARÍA */}
        <Route
          path="/secretaria"
          element={
            cargando ? null : user && rol === 'secretaria' ? (
              <SecretariaAdmin />
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
