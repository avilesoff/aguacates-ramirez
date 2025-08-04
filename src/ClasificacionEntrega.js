import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

export default function ClasificacionEntrega() {
  const navigate = useNavigate();

  const [recepciones, setRecepciones] = useState([]);
  const [recepcionSeleccionada, setRecepcionSeleccionada] = useState(null);
  const [clasificaciones, setClasificaciones] = useState({});
  const [kilosRecibidos, setKilosRecibidos] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [clasificados, setClasificados] = useState(new Set());

  const calibres = ['EXTRA', '1RA', '2DA', '3RA', '4TA', 'CLASE B', 'PROCESO', 'DESECHO', '4TA ROÑA'];

  useEffect(() => {
    const verificarSesion = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) {
        navigate('/login');
      }
    };
    verificarSesion();
  }, [navigate]);

  useEffect(() => {
    const cargarRecepciones = async () => {
      const { data, error } = await supabase
        .from('recepciones')
        .select('id, cliente_nombre, fecha_hora, kilos')
        .neq('cliente_nombre', '')
        .order('id', { ascending: false })
        .limit(30);

      if (!error && data) setRecepciones(data);

      const { data: clasificados, error: errClasif } = await supabase
        .from('clasificacion')
        .select('recepcion_id');

      if (!errClasif && clasificados) {
        setClasificados(new Set(clasificados.map(r => r.recepcion_id)));
      }
    };
    cargarRecepciones();
  }, []);

  const handleRecepcionChange = (e) => {
    const id = parseInt(e.target.value);
    const recepcion = recepciones.find(r => r.id === id);
    setRecepcionSeleccionada(recepcion);
    setKilosRecibidos(recepcion?.kilos || 0);
  };

  const handleInputChange = (calibre, campo, valor) => {
    setClasificaciones(prev => ({
      ...prev,
      [calibre]: {
        ...prev[calibre],
        [campo]: valor
      }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!recepcionSeleccionada) {
      setMensaje('❌ Debes seleccionar una entrega.');
      return;
    }

    const fechaSolo = new Date(recepcionSeleccionada.fecha_hora).toISOString().split('T')[0];

    const { data: existentes, error: errorConsulta } = await supabase
      .from('clasificacion')
      .select('id')
      .eq('recepcion_id', recepcionSeleccionada.id)
      .limit(1);

    if (!errorConsulta && existentes.length > 0) {
      setMensaje('❌ Esta entrega ya fue clasificada anteriormente.');
      return;
    }

    const registros = calibres.map(calibre => {
      const datos = clasificaciones[calibre] || {};
      return {
        recepcion_id: recepcionSeleccionada.id,
        cliente_nombre: recepcionSeleccionada.cliente_nombre,
        fecha: fechaSolo,
        calibre,
        cajas: parseInt(datos.cajas || 0),
        kg: parseFloat(datos.kg || 0)
      };
    }).filter(r => r.cajas > 0 || r.kg > 0);

    if (registros.length === 0) {
      setMensaje('❌ Debes llenar al menos una fila con cajas o kg.');
      return;
    }

    const totalClasificadoKg = registros.reduce((acc, r) => acc + r.kg, 0);

    if (totalClasificadoKg > kilosRecibidos) {
      setMensaje(`❌ No puedes clasificar más de ${kilosRecibidos.toLocaleString()} kg. Ya sumaste ${totalClasificadoKg.toLocaleString()} kg.`);
      return;
    }

    const { error } = await supabase.from('clasificacion').insert(registros);
    if (error) {
      setMensaje('❌ Error al guardar: ' + error.message);
    } else {
      setMensaje('✅ Clasificación guardada.');
      setClasificaciones({});
      setRecepcionSeleccionada(null);
      setKilosRecibidos(null);
    }
  };

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const thEstilo = {
    padding: '0.6rem',
    textAlign: 'left',
    fontWeight: 'bold'
  };

  const tdEstilo = {
    padding: '0.5rem'
  };

  const inputTabla = {
    width: '100%',
    maxWidth: '100px',
    padding: '0.4rem',
    borderRadius: '6px',
    border: '1px solid #ccc',
    textAlign: 'center'
  };

  const totalKg = calibres.reduce(
    (sum, cal) => sum + parseFloat(clasificaciones[cal]?.kg || 0),
    0
  );

  return (
    <div style={{
      backgroundColor: '#f5f5f5',
      height: '100%',
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      paddingTop: '2rem',
      fontFamily: 'Arial'
    }}>
      <div style={{
        backgroundColor: '#fff',
        padding: '2rem',
        borderRadius: '10px',
        boxShadow: '0 0 10px rgba(0,0,0,0.1)',
        maxWidth: '900px',
        width: '100%'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <img src="/aguacate.jpg" alt="Logo" style={{ width: '80px', marginBottom: '1rem' }} />
          <h2 style={{ color: '#2e7d32' }}>Clasificación (por entrega específica)</h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label>Entrega:</label><br />
            <select
              value={recepcionSeleccionada?.id || ''}
              onChange={handleRecepcionChange}
              required
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid #ccc'
              }}
            >
              <option value="">Selecciona una entrega</option>
              {recepciones.map((r) => {
                const fechaStr = new Date(r.fecha_hora).toLocaleDateString();
                const yaClasificada = clasificados.has(r.id);
                return (
                  <option key={r.id} value={r.id}>
                    {r.cliente_nombre} – {fechaStr} – {r.kilos.toLocaleString()} KG
                    {yaClasificada ? ' ✅' : ''}
                  </option>
                );
              })}
            </select>

            {recepcionSeleccionada && kilosRecibidos !== null && (
              <p style={{ marginTop: '0.5rem', fontWeight: 'bold', color: '#444' }}>
                Total de kilos recibidos: {kilosRecibidos.toLocaleString()} KG
              </p>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
              <thead style={{ backgroundColor: '#2e7d32', color: '#fff' }}>
                <tr>
                  <th style={thEstilo}>#</th>
                  <th style={thEstilo}>Calibre</th>
                  <th style={thEstilo}>Cajas</th>
                  <th style={thEstilo}>KG</th>
                </tr>
              </thead>
              <tbody>
                {calibres.map((calibre, index) => (
                  <tr
                    key={calibre}
                    style={{
                      backgroundColor: index % 2 === 0 ? '#f9f9f9' : '#fff',
                      borderBottom: '1px solid #ddd'
                    }}
                  >
                    <td style={tdEstilo}>{index + 1}</td>
                    <td style={tdEstilo}>{calibre}</td>
                    <td style={tdEstilo}>
                      <input
                        type="number"
                        min="0"
                        value={clasificaciones[calibre]?.cajas || ''}
                        onChange={(e) => handleInputChange(calibre, 'cajas', e.target.value)}
                        style={inputTabla}
                      />
                    </td>
                    <td style={tdEstilo}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={clasificaciones[calibre]?.kg || ''}
                        onChange={(e) => handleInputChange(calibre, 'kg', e.target.value)}
                        style={inputTabla}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ textAlign: 'right', fontWeight: 'bold', marginTop: '0.5rem' }}>
            Total KG clasificados: {totalKg.toLocaleString(undefined, { minimumFractionDigits: 2 })} KG
          </p>

          <button
            type="submit"
            style={{
              width: '100%',
              marginTop: '1rem',
              backgroundColor: '#2e7d32',
              color: '#fff',
              padding: '0.7rem',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem'
            }}
          >
            ✅ Guardar clasificación
          </button>

          {mensaje && (
            <p style={{
              textAlign: 'center',
              marginTop: '1rem',
              color: mensaje.includes('❌') ? 'red' : 'green'
            }}>
              {mensaje}
            </p>
          )}
        </form>

        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <button
            onClick={cerrarSesion}
            style={{
              backgroundColor: '#aaa',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
