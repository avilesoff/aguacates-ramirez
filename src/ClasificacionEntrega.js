import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

export default function ClasificacionEntrega() {
  const navigate = useNavigate();

  const [entregas, setEntregas] = useState([]);
  const [entregaSeleccionada, setEntregaSeleccionada] = useState(null);
  const [clasificaciones, setClasificaciones] = useState({});
  const [detalleRecepcion, setDetalleRecepcion] = useState([]);
  const [totalKilosRecepcion, setTotalKilosRecepcion] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [clasificados, setClasificados] = useState(new Set());

  const calibres = [
    'EXTRA', '1RA', '2DA', '3RA', '4TA',
    'CLASE B', 'PROCESO', 'DESECHO', '4TA ROÑA'
  ];

  // Proteger ruta
  useEffect(() => {
    const verificarSesion = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) navigate('/login');
    };
    verificarSesion();
  }, [navigate]);

  // Cargar entregas (agrupación en frontend)
  useEffect(() => {
    const cargarEntregas = async () => {
      // Trae filas con entrega_id reciente (sin usar .group)
      const { data, error } = await supabase
        .from('recepciones')
        .select('entrega_id, cliente_nombre, fecha_hora, kilos')
        .not('entrega_id', 'is', null)
        .order('fecha_hora', { ascending: false })
        .limit(500);

      if (error) {
        console.error(error);
        setEntregas([]);
      } else {
        // Agrupar por entrega_id en JS
        const mapa = new Map();

        for (const row of data) {
          const key = row.entrega_id;
          if (!key) continue;

          const actual = mapa.get(key) || {
            entrega_id: key,
            cliente_nombre: row.cliente_nombre,
            fecha_hora: row.fecha_hora, // guardamos la más reciente
            total_kilos: 0
          };

          actual.total_kilos += parseFloat(row.kilos) || 0;

          if (new Date(row.fecha_hora) > new Date(actual.fecha_hora)) {
            actual.fecha_hora = row.fecha_hora;
          }

          mapa.set(key, actual);
        }

        setEntregas(Array.from(mapa.values()));
      }

      // Entregas ya clasificadas (por entrega_id)
      const { data: clasifData, error: errClasif } = await supabase
        .from('clasificacion')
        .select('entrega_id');

      if (!errClasif && clasifData) {
        setClasificados(new Set(clasifData.map(r => r.entrega_id)));
      }
    };

    cargarEntregas();
  }, []);

  const handleEntregaChange = async (e) => {
    const entregaId = e.target.value;
    const entrega = entregas.find(r => r.entrega_id === entregaId) || null;

    setEntregaSeleccionada(entrega);
    setTotalKilosRecepcion(entrega?.total_kilos || 0);
    setDetalleRecepcion([]);

    if (!entregaId) return;

    // Detalle por tipos de aguacate de ESTA entrega
    const { data: detalle, error: errDetalle } = await supabase
      .from('recepciones')
      .select('tipo, kilos')
      .eq('entrega_id', entregaId);

    if (!errDetalle && Array.isArray(detalle)) {
      setDetalleRecepcion(detalle);
    }
  };

  const handleInputChange = (calibre, campo, valor) => {
    setClasificaciones(prev => ({
      ...prev,
      [calibre]: { ...prev[calibre], [campo]: valor }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!entregaSeleccionada) {
      setMensaje('❌ Debes seleccionar una entrega.');
      return;
    }

    const fechaSolo = new Date(entregaSeleccionada.fecha_hora).toISOString().split('T')[0];

    // Evitar doble clasificación de la misma entrega
    const { data: existentes, error: errorConsulta } = await supabase
      .from('clasificacion')
      .select('id')
      .eq('entrega_id', entregaSeleccionada.entrega_id)
      .limit(1);

    if (!errorConsulta && existentes?.length > 0) {
      setMensaje('❌ Esta entrega ya fue clasificada anteriormente.');
      return;
    }

    const registros = calibres.map(calibre => {
      const datos = clasificaciones[calibre] || {};
      return {
        entrega_id: entregaSeleccionada.entrega_id,
        cliente_nombre: entregaSeleccionada.cliente_nombre,
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

    if (totalClasificadoKg > (totalKilosRecepcion || 0)) {
      setMensaje(`❌ No puedes clasificar más de ${Number(totalKilosRecepcion).toLocaleString()} kg. Ya sumaste ${totalClasificadoKg.toLocaleString()} kg.`);
      return;
    }

    const { error } = await supabase.from('clasificacion').insert(registros);
    if (error) {
      setMensaje('❌ Error al guardar: ' + error.message);
    } else {
      setMensaje('✅ Clasificación guardada.');
      setClasificaciones({});
      setEntregaSeleccionada(null);
      setTotalKilosRecepcion(null);
      setDetalleRecepcion([]);
    }
  };

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const thEstilo = { padding: '0.6rem', textAlign: 'left', fontWeight: 'bold' };
  const tdEstilo = { padding: '0.5rem' };
  const inputTabla = {
    width: '100%',
    maxWidth: '100px',
    padding: '0.4rem',
    borderRadius: '6px',
    border: '1px solid #ccc',
    textAlign: 'center'
  };

  const totalKgClasif = calibres.reduce(
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
              value={entregaSeleccionada?.entrega_id || ''}
              onChange={handleEntregaChange}
              required
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }}
            >
              <option value="">Selecciona una entrega</option>
              {entregas.map((r) => {
                const fechaStr = new Date(r.fecha_hora).toLocaleDateString();
                const yaClasificada = clasificados.has(r.entrega_id);
                return (
                  <option key={r.entrega_id} value={r.entrega_id}>
                    {r.cliente_nombre} – {fechaStr} – {r.total_kilos.toLocaleString()} KG
                    {yaClasificada ? ' ✅' : ''}
                  </option>
                );
              })}
            </select>

            {entregaSeleccionada && totalKilosRecepcion !== null && (
              <>
                <p style={{ marginTop: '0.5rem', fontWeight: 'bold', color: '#444' }}>
                  Total de kilos recibidos: {Number(totalKilosRecepcion).toLocaleString()} KG
                </p>

                {detalleRecepcion.length > 0 && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#333' }}>
                    <strong>Detalle de recepción:</strong>
                    <ul style={{ marginTop: '0.3rem', marginBottom: '0.5rem' }}>
                      {detalleRecepcion.map((d, idx) => (
                        <li key={idx}>
                          {d.tipo}: {Number(d.kilos).toLocaleString()} KG
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
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
                  <tr key={calibre} style={{ backgroundColor: index % 2 === 0 ? '#f9f9f9' : '#fff', borderBottom: '1px solid #ddd' }}>
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
            Total KG clasificados: {totalKgClasif.toLocaleString(undefined, { minimumFractionDigits: 2 })} KG
          </p>

          <button
            type="submit"
            style={{ width: '100%', marginTop: '1rem', backgroundColor: '#2e7d32', color: '#fff', padding: '0.7rem', border: 'none', borderRadius: '8px', fontSize: '1rem' }}
          >
            ✅ Guardar clasificación
          </button>

          {mensaje && (
            <p style={{ textAlign: 'center', marginTop: '1rem', color: mensaje.includes('❌') ? 'red' : 'green' }}>
              {mensaje}
            </p>
          )}
        </form>

        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <button
            onClick={cerrarSesion}
            style={{ backgroundColor: '#aaa', padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
