// src/App.js
import React, { useEffect, useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  Navigate,
  useLocation,
  useNavigate,
} from 'react-router-dom';

import Login from './Login';
import Recepcion from './Recepcion';
import ClasificacionEntrega from './ClasificacionEntrega';
import VentaForm from './VentaForm';
import VentasAdmin from './VentasAdmin';
import SecretariaAdmin from './SecretariaAdmin';
import SecretariaFlujoCompleto from './SecretariaFlujoCompleto';
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
        if (!error && perfil) setRol(perfil.rol);
      }

      setCargando(false);
    };

    obtenerUsuarioYRol();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          setUser(session.user);
          supabase
            .from('profiles')
            .select('rol')
            .eq('id', session.user.id)
            .single()
            .then(({ data, error }) => {
              if (!error && data) setRol(data.rol);
              setCargando(false);
            });
        } else {
          setUser(null);
          setRol(null);
          setCargando(false);
          navigate('/login');
        }
      }
    );

    return () => listener?.subscription.unsubscribe();
  }, [navigate]);

  // Redirección automática por rol
  useEffect(() => {
    if (!cargando && user) {
      const currentPath = location.pathname;

      if (rol === 'recepcion' && currentPath !== '/recepcion') {
        navigate('/recepcion', { replace: true });
      } else if (
        rol === 'clasificacion' &&
        currentPath !== '/clasificacion-entrega'
      ) {
        navigate('/clasificacion-entrega', { replace: true });
      } else if (
        rol === 'secretaria' &&
        ![
          '/secretaria-flujo',
          '/ventas',
          '/ventas-admin',
          '/secretaria',
          '/recepcion',
          '/clasificacion-entrega',
        ].includes(currentPath)
      ) {
        // por defecto la secretaria cae al flujo completo
        navigate('/secretaria-flujo', { replace: true });
      }
    }
  }, [cargando, user, rol, navigate, location.pathname]);

  // 👇 NUEVO: ocultar barra en la ruta del flujo
  // Ocultar barra en flujo completo y en la vista principal de Secretaría
const ocultarBarra =
  location.pathname === '/secretaria-flujo' ||
  location.pathname === '/secretaria';


  return (
    <div>
      {/* Barra superior (solo si NO estamos en /secretaria-flujo) */}
      {!ocultarBarra && (
        <div style={{ padding: '1rem', background: '#eee' }}>
          <Link to="/login" style={{ marginRight: '1rem' }}>
            Inicio de Sesión
          </Link>

          {user && rol === 'recepcion' && (
            <Link to="/recepcion" style={{ marginRight: '1rem' }}>
              Recepción
            </Link>
          )}

          {user && rol === 'clasificacion' && (
            <Link to="/clasificacion-entrega" style={{ marginRight: '1rem' }}>
              Clasificación (entrega)
            </Link>
          )}

          {user && rol === 'secretaria' && (
            <>
              <Link
                to="/secretaria-flujo"
                style={{ marginRight: '1rem' }}
              >
                Flujo completo
              </Link>
              <Link to="/ventas" style={{ marginRight: '1rem' }}>
                Ventas
              </Link>
              <Link to="/ventas-admin" style={{ marginRight: '1rem' }}>
                Admin
              </Link>
              <Link to="/secretaria">Secretaría</Link>
            </>
          )}
        </div>
      )}

      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Recepción: recepcionista + secretaria */}
        <Route
          path="/recepcion"
          element={
            cargando ? null : user &&
              (rol === 'recepcion' || rol === 'secretaria') ? (
              <Recepcion />
            ) : (
              <Navigate
                to="/login"
                replace
                state={{ from: location.pathname }}
              />
            )
          }
        />

        {/* Clasificación: clasificador + secretaria */}
        <Route
          path="/clasificacion-entrega"
          element={
            cargando ? null : user &&
              (rol === 'clasificacion' || rol === 'secretaria') ? (
              <ClasificacionEntrega />
            ) : (
              <Navigate
                to="/login"
                replace
                state={{ from: location.pathname }}
              />
            )
          }
        />

        {/* Venta individual (pantalla vieja) */}
        <Route
          path="/ventas"
          element={
            cargando ? null : user && rol === 'secretaria' ? (
              <VentaForm />
            ) : (
              <Navigate
                to="/login"
                replace
                state={{ from: location.pathname }}
              />
            )
          }
        />

        {/* Admin de ventas */}
        <Route
          path="/ventas-admin"
          element={
            cargando ? null : user && rol === 'secretaria' ? (
              <VentasAdmin />
            ) : (
              <Navigate
                to="/login"
                replace
                state={{ from: location.pathname }}
              />
            )
          }
        />

        {/* Secretaría (notas, PDFs) */}
        <Route
          path="/secretaria"
          element={
            cargando ? null : user && rol === 'secretaria' ? (
              <SecretariaAdmin />
            ) : (
              <Navigate
                to="/login"
                replace
                state={{ from: location.pathname }}
              />
            )
          }
        />

        {/* Flujo completo en una sola pantalla (Recepción + Clasificación + Compra) */}
        <Route
          path="/secretaria-flujo"
          element={
            cargando ? null : user && rol === 'secretaria' ? (
              <SecretariaFlujoCompleto />
            ) : (
              <Navigate
                to="/login"
                replace
                state={{ from: location.pathname }}
              />
            )
          }
        />

        {/* Default */}
        <Route path="*" element={<Navigate to="/ventas" replace />} />
      </Routes>
    </div>
  );
}

export default AppWrapper;
