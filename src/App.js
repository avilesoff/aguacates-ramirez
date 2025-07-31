import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Login from './Login';

function App() {
  const [tipo, setTipo] = useState([]);
  const [kilosExtra, setKilosExtra] = useState('');
  const [cliente, setCliente] = useState('');
  const [toneladas, setToneladas] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [usuario, setUsuario] = useState(null);

  // Verifica si hay sesión activa al cargar
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUsuario(user);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setUsuario(session?.user || null);
    });
  }, []);

  const handleSubmit = async (e) => {
  e.preventDefault();

  const { error } = await supabase
    .from('recepciones')
    .insert([
      {
        cliente_nombre: cliente,
        toneladas: parseFloat(toneladas),
        tipo: tipo.join(', '), // convierte array a texto: "Flor Loca, Desecho"
        kilos_extra: parseFloat(kilosExtra || 0),
      },
    ]);

  if (error) {
    setMensaje('❌ Error al guardar: ' + error.message);
  } else {
    setMensaje('✅ Datos guardados correctamente.');
    setCliente('');
    setToneladas('');
    setTipo([]);
    setKilosExtra('');
  }
};


  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    setUsuario(null);
  };

  // Si no hay sesión, mostrar login
  if (!usuario) {
    return <Login onLogin={() => window.location.reload()} />;
  }

  // Si hay sesión, mostrar formulario
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
        width: '100%',
        position: 'relative'
      }}>
        <div style={{ textAlign: 'center' }}>
          <img
            src="/aguacate.jpg"
            alt="Logo Aguacates Ramírez"
            style={{ width: '100px', height: '100px', objectFit: 'contain', marginBottom: '0.5rem' }}
          />
          <h1 style={{ color: '#2e7d32' }}>Aguacates Ramírez</h1>
        </div>

        <button
          onClick={cerrarSesion}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            backgroundColor: '#ccc',
            border: 'none',
            padding: '5px 10px',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Salir
        </button>

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

          <div style={{ marginTop: '1rem' }}>
            <label>Kilos adicionales (si no se completó tonelada):</label><br />
            <input
              type="number"
              step="0.01"
              value={kilosExtra}
              onChange={(e) => setKilosExtra(e.target.value)}
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
            <label>Tipo de aguacate recibido:</label><br />
            {['Flor Loca', 'Negro', 'Desecho'].map((opcion) => (
              <div key={opcion}>
                <label>
                  <input
                    type="checkbox"
                    value={opcion}
                    checked={tipo.includes(opcion)}
                    onChange={(e) => {
                      const valor = e.target.value;
                      setTipo((prev) =>
                        prev.includes(valor)
                          ? prev.filter((item) => item !== valor)
                          : [...prev, valor]
                      );
                    }}
                  />
                  {' '}{opcion}
                </label>
              </div>
            ))}
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
