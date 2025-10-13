import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

export default function ClasificacionEntrega() {
  const navigate = useNavigate();

  const [entregas, setEntregas] = useState([]);
  const [entregaSeleccionada, setEntregaSeleccionada] = useState(null);
  const [detalleRecepcion, setDetalleRecepcion] = useState([]);
  const [clasificaciones, setClasificaciones] = useState({});
  const [totalKilosRecepcion, setTotalKilosRecepcion] = useState(null);
  const [toast, setToast] = useState({ text: '', color: '' });
  const [clasificados, setClasificados] = useState(new Set());

  const calibres = [
    'EXTRA', '1RA', '2DA', '3RA', '4TA',
    'CLASE B', 'PROCESO', 'DESECHO', '4TA ROÑA'
  ];

  // 🔒 Proteger ruta
  useEffect(() => {
    const verificarSesion = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) navigate('/login');
    };
    verificarSesion();
  }, [navigate]);

  // 📦 Cargar entregas (solo no clasificadas)
  useEffect(() => {
    const cargarEntregas = async () => {
      const { data, error } = await supabase
        .from('recepciones')
        .select('entrega_id, cliente_nombre, fecha_hora, kilos')
        .not('entrega_id', 'is', null)
        .order('fecha_hora', { ascending: false })
        .limit(500);

      if (error) {
        console.error(error);
        setEntregas([]);
        return;
      }

      const mapa = new Map();
      for (const row of data) {
        const key = row.entrega_id;
        if (!key) continue;
        const actual = mapa.get(key) || {
          entrega_id: key,
          cliente_nombre: row.cliente_nombre,
          fecha_hora: row.fecha_hora,
          total_kilos: 0
        };
        actual.total_kilos += parseFloat(row.kilos) || 0;
        if (new Date(row.fecha_hora) > new Date(actual.fecha_hora)) {
          actual.fecha_hora = row.fecha_hora;
        }
        mapa.set(key, actual);
      }

      const { data: clasifData, error: errClasif } = await supabase
        .from('clasificacion')
        .select('entrega_id');

      let clasificadasSet = new Set();
      if (!errClasif && clasifData) {
        clasificadasSet = new Set(clasifData.map(r => r.entrega_id));
        setClasificados(clasificadasSet);
      }

      const noClasificadas = Array.from(mapa.values()).filter(
        e => !clasificadasSet.has(e.entrega_id)
      );

      setEntregas(noClasificadas);
    };
    cargarEntregas();
  }, []);

  // 📋 Selección de entrega
  const handleEntregaChange = async (e) => {
    const entregaId = e.target.value;
    const entrega = entregas.find(r => r.entrega_id === entregaId) || null;

    setEntregaSeleccionada(entrega);
    setTotalKilosRecepcion(entrega?.total_kilos || 0);
    setDetalleRecepcion([]);
    setClasificaciones({});

    if (!entregaId) return;

    const { data: detalle, error: errDetalle } = await supabase
      .from('recepciones')
      .select('tipo, kilos')
      .eq('entrega_id', entregaId);

    if (!errDetalle && Array.isArray(detalle)) {
      setDetalleRecepcion(detalle);
    }
  };

  // ✏️ Actualizar inputs
  const handleInputChange = (tipo, calibre, campo, valor) => {
    setClasificaciones(prev => {
      const porTipo = prev[tipo] || {};
      return {
        ...prev,
        [tipo]: {
          ...porTipo,
          [calibre]: { ...porTipo[calibre], [campo]: valor }
        }
      };
    });
  };

  // 🧮 Totales
  const totalPorTipo = (tipo) => {
    if (!clasificaciones[tipo]) return 0;
    return Object.values(clasificaciones[tipo]).reduce(
      (sum, val) => sum + (parseFloat(val.kg) || 0),
      0
    );
  };

  const totalGeneral = () => {
    return detalleRecepcion.reduce(
      (sum, item) => sum + totalPorTipo(item.tipo),
      0
    );
  };

  // 📤 Guardar clasificación
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!entregaSeleccionada) {
      setToast({ text: '❌ Debes seleccionar una entrega.', color: 'red' });
      setTimeout(() => setToast({ text: '', color: '' }), 4000);
      return;
    }

    const fechaSolo = new Date(entregaSeleccionada.fecha_hora).toISOString().split('T')[0];

    const registros = [];
    for (const tipo in clasificaciones) {
      for (const calibre in clasificaciones[tipo]) {
        const datos = clasificaciones[tipo][calibre];
        if ((datos.cajas || datos.kg) && (datos.cajas > 0 || datos.kg > 0)) {
          registros.push({
            entrega_id: entregaSeleccionada.entrega_id,
            cliente_nombre: entregaSeleccionada.cliente_nombre,
            fecha: fechaSolo,
            tipo,
            calibre,
            cajas: parseInt(datos.cajas || 0),
            kg: parseFloat(datos.kg || 0)
          });
        }
      }
    }

    if (registros.length === 0) {
      setToast({ text: '❌ Debes llenar al menos una fila con cajas o kg.', color: 'red' });
      setTimeout(() => setToast({ text: '', color: '' }), 4000);
      return;
    }

    // 🧮 Nueva validación: debe clasificar exactamente la misma cantidad
    const totalClasificadoKg = totalGeneral();
    const diferencia = Math.abs(totalClasificadoKg - totalKilosRecepcion);

    // Más kilos que los recibidos
    if (totalClasificadoKg > totalKilosRecepcion) {
      setToast({
        text: `❌ No puedes clasificar más de ${totalKilosRecepcion} kg.`,
        color: 'red'
      });
      setTimeout(() => setToast({ text: '', color: '' }), 4000);
      return;
    }

    // Menos kilos que los recibidos
    if (totalClasificadoKg < totalKilosRecepcion) {
      setToast({
        text: `⚠️ Has clasificado ${diferencia.toLocaleString()} kg menos de los recibidos (${totalClasificadoKg.toLocaleString()} / ${totalKilosRecepcion.toLocaleString()} kg). Debes clasificar la cantidad exacta.`,
        color: 'red'
      });
      setTimeout(() => setToast({ text: '', color: '' }), 5000);
      return;
    }

    const { error } = await supabase.from('clasificacion').insert(registros);
    if (error) {
      setToast({ text: '❌ Error al guardar: ' + error.message, color: 'red' });
      setTimeout(() => setToast({ text: '', color: '' }), 4000);
    } else {
      setToast({
        text: '✅ Clasificación guardada correctamente. Entrega eliminada del listado de pendientes.',
        color: 'green'
      });

      // Quitar la entrega del menú local
      setEntregas((prev) => prev.filter(e => e.entrega_id !== entregaSeleccionada.entrega_id));

      // Limpiar campos
      setEntregaSeleccionada(null);
      setDetalleRecepcion([]);
      setClasificaciones({});

      setTimeout(() => setToast({ text: '', color: '' }), 4000);
    }
  };

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  // 🎨 Estilos
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

  const toastAnimation = `
    @keyframes slideFade {
      0% { opacity: 0; transform: translateX(100%); }
      10% { opacity: 1; transform: translateX(0); }
      90% { opacity: 1; transform: translateX(0); }
      100% { opacity: 0; transform: translateX(100%); }
    }
  `;

  return (
    <div style={{
      backgroundColor: '#f5f5f5',
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      paddingTop: '2rem',
      fontFamily: 'Arial'
    }}>
      <style>{toastAnimation}</style>

      <div style={{
        backgroundColor: '#fff',
        padding: '2rem',
        borderRadius: '10px',
        boxShadow: '0 0 10px rgba(0,0,0,0.1)',
        maxWidth: '1000px',
        width: '100%',
        position: 'relative'
      }}>
        {toast.text && (
          <div
            style={{
              position: 'fixed',
              top: '20px',
              right: '20px',
              backgroundColor: toast.color === 'red' ? '#c62828' : '#2e7d32',
              color: '#fff',
              padding: '1rem 1.5rem',
              borderRadius: '8px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
              zIndex: 1000,
              animation: 'slideFade 4s ease-in-out'
            }}
          >
            {toast.text}
          </div>
        )}

        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <img src="/aguacate.jpg" alt="Logo" style={{ width: '80px', marginBottom: '1rem' }} />
          <h2 style={{ color: '#2e7d32' }}>Clasificación por tipo de aguacate</h2>
        </div>

        {entregas.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#666', fontStyle: 'italic' }}>
            ✅ No hay entregas pendientes por clasificar.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label>Entrega:</label>
            <select
              value={entregaSeleccionada?.entrega_id || ''}
              onChange={handleEntregaChange}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }}
            >
              <option value="">Selecciona una entrega</option>
              {entregas.map(r => {
                const fechaStr = new Date(r.fecha_hora).toLocaleDateString();
                return (
                  <option key={r.entrega_id} value={r.entrega_id}>
                    {r.cliente_nombre} – {fechaStr} – {r.total_kilos.toLocaleString()} KG
                  </option>
                );
              })}
            </select>

            {entregaSeleccionada && totalKilosRecepcion && (
              <>
                <p style={{ marginTop: '0.5rem', fontWeight: 'bold' }}>
                  Total de kilos recibidos: {Number(totalKilosRecepcion).toLocaleString()} KG
                </p>

                {detalleRecepcion.map((item, i) => (
                  <div key={i} style={{ marginTop: '1.5rem' }}>
                    <h4 style={{ color: '#2e7d32' }}>{item.tipo.toUpperCase()} ({item.kilos} KG)</h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
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
                          <tr key={index} style={{ backgroundColor: index % 2 === 0 ? '#f9f9f9' : '#fff' }}>
                            <td style={tdEstilo}>{index + 1}</td>
                            <td style={tdEstilo}>{calibre}</td>
                            <td style={tdEstilo}>
                              <input
                                type="number"
                                min="0"
                                value={clasificaciones[item.tipo]?.[calibre]?.cajas || ''}
                                onChange={(e) =>
                                  handleInputChange(item.tipo, calibre, 'cajas', e.target.value)
                                }
                                style={inputTabla}
                              />
                            </td>
                            <td style={tdEstilo}>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={clasificaciones[item.tipo]?.[calibre]?.kg || ''}
                                onChange={(e) =>
                                  handleInputChange(item.tipo, calibre, 'kg', e.target.value)
                                }
                                style={inputTabla}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p style={{
                      textAlign: 'right',
                      fontWeight: 'bold',
                      color: totalPorTipo(item.tipo) > item.kilos ? 'red' : '#2e7d32',
                      marginTop: '0.4rem'
                    }}>
                      Total clasificado ({item.tipo}): {totalPorTipo(item.tipo).toLocaleString()} / {item.kilos.toLocaleString()} KG
                    </p>
                  </div>
                ))}

                <h3 style={{
                  textAlign: 'right',
                  color: totalGeneral() > totalKilosRecepcion ? 'red' : '#2e7d32',
                  marginTop: '1.5rem'
                }}>
                  Total general clasificado: {totalGeneral().toLocaleString()} / {totalKilosRecepcion.toLocaleString()} KG
                </h3>
              </>
            )}

            <button
              type="submit"
              style={{
                width: '100%',
                marginTop: '1.5rem',
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
          </form>
        )}

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
