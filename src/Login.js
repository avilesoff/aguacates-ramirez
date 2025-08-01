import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

function Login() {
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [mensaje, setMensaje] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setMensaje('');

    const { data: sessionData, error } = await supabase.auth.signInWithPassword({
      email,
      password: contrasena,
    });

    if (error) {
      setMensaje('❌ Error al iniciar sesión: ' + error.message);
      return;
    }

    const userId = sessionData.user?.id;
    if (userId) {
      const { data: perfil, error: errorPerfil } = await supabase
        .from('profiles')
        .select('rol')
        .eq('id', userId)
        .single();

      if (errorPerfil || !perfil) {
        setMensaje('❌ No se pudo obtener el perfil del usuario.');
        return;
      }

      const rol = perfil.rol;
      if (rol === 'recepcion') {
        navigate('/recepcion', { replace: true });
      } else if (rol === 'clasificacion') {
        navigate('/clasificacion-entrega', { replace: true });
      } else {
        setMensaje('❌ Rol desconocido.');
      }
    } else {
      setMensaje('❌ No se pudo obtener el ID del usuario.');
    }
  };

  return (
    <div style={{
      backgroundColor: '#f5f5f5',
      height: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      fontFamily: 'Arial',
    }}>
      <div style={{
        backgroundColor: '#fff',
        padding: '2rem',
        borderRadius: '10px',
        boxShadow: '0 0 10px rgba(0,0,0,0.1)',
        maxWidth: '400px',
        width: '100%'
      }}>
        <div style={{ textAlign: 'center' }}>
          <img src="/aguacate.jpg" alt="Logo" style={{ width: '80px', marginBottom: '1rem' }} />
          <h2>Aguacates Ramírez</h2>
          <h3>Iniciar sesión</h3>
        </div>
        <form onSubmit={handleLogin}>
          <label>Email:</label><br />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          /><br />
          <label>Contraseña:</label><br />
          <input
            type="password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            required
            style={inputStyle}
          /><br />
          <button type="submit" style={btnStyle}>Iniciar sesión</button>
        </form>
        {mensaje && <p style={{ marginTop: '1rem', color: 'red', textAlign: 'center' }}>{mensaje}</p>}
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '0.5rem',
  marginTop: '0.3rem',
  marginBottom: '1rem',
  borderRadius: '6px',
  border: '1px solid #ccc'
};

const btnStyle = {
  width: '100%',
  padding: '0.6rem',
  backgroundColor: '#2e7d32',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer'
};

export default Login;
