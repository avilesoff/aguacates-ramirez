import React, { useState } from 'react';
import { supabase } from './supabaseClient';

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mensaje, setMensaje] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setMensaje(''); // limpiar antes de nuevo intento

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMensaje('❌ ' + error.message);
    } else {
      setMensaje('✅ Inicio de sesión exitoso');
      setTimeout(() => onLogin(), 800); // recarga luego de login
    }
  };

  return (
    <div style={{
      backgroundColor: '#f5f5f5',
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      fontFamily: 'Arial, sans-serif'
    }}>
      <div style={{
        backgroundColor: '#fff',
        padding: '2rem',
        borderRadius: '12px',
        boxShadow: '0 0 10px rgba(0,0,0,0.1)',
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center'
      }}>
        <img
          src="/aguacate.jpg"
          alt="Logo Aguacates Ramírez"
          style={{ width: '100px', height: '100px', objectFit: 'contain', marginBottom: '1rem' }}
        />
        <h1 style={{ color: '#2e7d32' }}>Aguacates Ramírez</h1>
        <h2>Iniciar sesión</h2>

        <form onSubmit={handleLogin} style={{ marginTop: '1.5rem' }}>
          <div>
            <label>Email</label><br />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid #ccc',
                marginBottom: '1rem'
              }}
            />
          </div>
          <div>
            <label>Contraseña</label><br />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid #ccc',
                marginBottom: '1.5rem'
              }}
            />
          </div>
          <button type="submit" style={{
            width: '100%',
            padding: '0.7rem',
            backgroundColor: '#2e7d32',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '1rem'
          }}>
            Entrar
          </button>
        </form>

        {mensaje && (
          <p style={{ marginTop: '1rem', color: mensaje.includes('❌') ? 'red' : 'green' }}>
            {mensaje}
          </p>
        )}
      </div>
    </div>
  );
}

export default Login;
