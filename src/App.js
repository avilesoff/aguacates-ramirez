import React, { useState } from 'react';
import { supabase } from './supabaseClient';

function App() {
  const [cliente, setCliente] = useState('');
  const [toneladas, setToneladas] = useState('');
  const [mensaje, setMensaje] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    const { data, error } = await supabase
      .from('recepciones')
      .insert([
        {
          cliente_nombre: cliente,
          toneladas: parseFloat(toneladas),
        },
      ]);

    if (error) {
      setMensaje('❌ Error al guardar: ' + error.message);
    } else {
      setMensaje('✅ Datos guardados correctamente.');
      setCliente('');
      setToneladas('');
    }
  };

  return (
    <div style={{
      backgroundColor: '#f5f5f5',
      minHeight: '100vh',
      padding: '2rem',
      fontFamily: 'Arial, sans-serif',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <div style={{
        backgroundColor: '#fff',
        padding: '2rem',
        borderRadius: '12px',
        boxShadow: '0 0 10px rgba(0,0,0,0.1)',
        maxWidth: '400px',
        width: '100%'
      }}>
        <div style={{ textAlign: 'center' }}>
  <img
    src="/aguacate.jpg"
    alt="Logo Aguacates Ramírez"
    style={{ width: '100px', height: '100px', objectFit: 'contain', marginBottom: '0.5rem' }}
  />
  <h1 style={{ color: '#2e7d32' }}>Aguacates Ramírez</h1>
</div>

        <h2 style={{ textAlign: 'center' }}>Recepción de Aguacate</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginTop: '1.5rem' }}>
            <label>Nombre del cliente:</label><br />
            <input
              type="text"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.5rem',
                marginTop: '0.3rem',
                borderRadius: '6px',
                border: '1px solid #ccc'
              }}
            />
          </div>
          <div style={{ marginTop: '1rem' }}>
            <label>Toneladas recibidas:</label><br />
            <input
              type="number"
              step="0.01"
              value={toneladas}
              onChange={(e) => setToneladas(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.5rem',
                marginTop: '0.3rem',
                borderRadius: '6px',
                border: '1px solid #ccc'
              }}
            />
          </div>
          <button type="submit" style={{
            marginTop: '1.5rem',
            width: '100%',
            padding: '0.7rem',
            backgroundColor: '#2e7d32',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '1rem'
          }}>
            Guardar
          </button>
        </form>
        {mensaje && (
          <p style={{ marginTop: '1rem', textAlign: 'center' }}>{mensaje}</p>
        )}
      </div>
    </div>
  );
}

export default App;
