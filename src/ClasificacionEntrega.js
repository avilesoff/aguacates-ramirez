import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

export default function ClasificacionEntrega({
  modoSecretaria = false,
  entregaIdInicial = null,
  onClasificacionGuardada,
}) {
  const navigate = useNavigate();

  const [entregas, setEntregas] = useState([]);
  const [entregaSeleccionada, setEntregaSeleccionada] = useState(null);
  const [detalleRecepcion, setDetalleRecepcion] = useState([]);
  const [clasificaciones, setClasificaciones] = useState({});
  const [totalKilosRecepcion, setTotalKilosRecepcion] = useState(null);
  const [totalCajasRecepcion, setTotalCajasRecepcion] = useState(null);
  const [toast, setToast] = useState({ text: '', color: '' });
  const [clasificados] = useState(new Set()); // (lo de clasificados se deja por compatibilidad)

  // 1) Claves estables de calibres
  const calibreKeys = [
    'EXTRA',
    '1RA',
    '2DA',
    '3RA',
    '4TA',
    'CLASE_B',
    'PROCESO',
    'DESECHO',
    '4TA_ROÑA',
    'OTRO_1',
    'OTRO_2',
    'OTRO_3',
  ];

  // 2) Nombres por defecto
  const defaultCalibreNames = {
    EXTRA: 'EXTRA',
    '1RA': '1RA',
    '2DA': '2DA',
    '3RA': '3RA',
    '4TA': '4TA',
    CLASE_B: 'CLASE B',
    PROCESO: 'PROCESO',
    DESECHO: 'DESECHO',
    '4TA_ROÑA': '4TA ROÑA',
    OTRO_1: 'OTRO 1',
    OTRO_2: 'OTRO 2',
    OTRO_3: 'OTRO 3',
  };

  // 3) Nombres personalizables solo para OTROs
  const [customNames, setCustomNames] = useState({
    OTRO_1: '',
    OTRO_2: '',
    OTRO_3: '',
  });

  // Aux: etiqueta que se muestra/guarda
  const labelFor = (key) =>
    key.startsWith('OTRO_')
      ? customNames[key] || defaultCalibreNames[key]
      : defaultCalibreNames[key];

  // 🔒 Proteger ruta (igual que antes)
  useEffect(() => {
    const verificarSesion = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) navigate('/login');
    };
    verificarSesion();
  }, [navigate]);

  // Cargar entregas pendientes desde la vista
  useEffect(() => {
    const cargarEntregas = async () => {
      const { data, error } = await supabase
        .from('v_entregas_pendientes')
        .select('entrega_id, cliente_nombre, fecha_hora, total_kilos')
        .order('fecha_hora', { ascending: false });

      if (error) {
        console.error(error);
        setEntregas([]);
        return;
      }

      setEntregas(data || []);
    };

    cargarEntregas();
  }, []);

  // Helper para cargar una entrega completa por ID
  const cargarEntregaPorId = async (entregaId) => {
    if (!entregaId) {
      setEntregaSeleccionada(null);
      setDetalleRecepcion([]);
      setTotalKilosRecepcion(null);
      setTotalCajasRecepcion(null);
      setClasificaciones({});
      return;
    }

    const entrega =
      entregas.find((r) => String(r.entrega_id) === String(entregaId)) || null;

    setEntregaSeleccionada(entrega);
    setTotalKilosRecepcion(entrega?.total_kilos || 0);
    setTotalCajasRecepcion(null);
    setDetalleRecepcion([]);
    setClasificaciones({});

    // Traemos también cajas desde recepciones
    const { data: detalle, error: errDetalle } = await supabase
      .from('recepciones')
      .select('tipo, kilos, cajas')
      .eq('entrega_id', entregaId);

    if (errDetalle || !Array.isArray(detalle)) return;

    // AGRUPA POR tipo exacto, suma kilos y cajas
    const mapTipo = new Map(); // tipo -> { kilos, cajas }

    for (const r of detalle) {
      const t = String(r.tipo || '').trim();
      const kg = parseFloat(r.kilos || 0);
      const cj = parseFloat(r.cajas || 0);

      const current = mapTipo.get(t) || { kilos: 0, cajas: 0 };
      current.kilos += isNaN(kg) ? 0 : kg;
      current.cajas += isNaN(cj) ? 0 : cj;
      mapTipo.set(t, current);
    }

    // Orden preferente; lo demás alfabético
    const ordenPreferente = [
      'Loca',
      'Loca Tamaño',
      'Loca Proceso',
      'Negro',
      'Negro Tamaño',
      'Negro Proceso',
      'Aventajado',
      'Aventajado Tamaño',
      'Aventajado Proceso',
      'Desecho',
    ];

    const lista = Array.from(mapTipo.entries())
      .sort((a, b) => {
        const ia = ordenPreferente.indexOf(a[0]);
        const ib = ordenPreferente.indexOf(b[0]);
        if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      })
      .map(([tipo, agg]) => ({
        tipo,
        kilos: agg.kilos,
        cajas: agg.cajas,
      }));

    setDetalleRecepcion(lista);

    // Total de cajas recibidas
    const totalCj = lista.reduce(
      (sum, it) => sum + (Number(it.cajas) || 0),
      0
    );
    setTotalCajasRecepcion(totalCj);
  };

  // 📋 Selección desde el select
  const handleEntregaChange = async (e) => {
    const entregaId = e.target.value;
    await cargarEntregaPorId(entregaId);
  };

  // Si recibimos entregaIdInicial (modo Secretaría), seleccionarla automáticamente
  useEffect(() => {
    if (!entregaIdInicial) return;
    if (!entregas || entregas.length === 0) return;
    if (
      entregaSeleccionada &&
      String(entregaSeleccionada.entrega_id) === String(entregaIdInicial)
    ) {
      return;
    }
    cargarEntregaPorId(entregaIdInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entregaIdInicial, entregas]);

  // ✏️ Actualizar inputs de tabla
  const handleInputChange = (tipo, calibreKey, campo, valor) => {
    setClasificaciones((prev) => {
      const porTipo = prev[tipo] || {};
      const porCalibre = porTipo[calibreKey] || {};
      return {
        ...prev,
        [tipo]: {
          ...porTipo,
          [calibreKey]: {
            ...porCalibre,
            [campo]: valor,
          },
        },
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

    // Fecha sin desfase: YYYY-MM-DD
    const fechaSolo = String(entregaSeleccionada.fecha_hora || '').slice(0, 10);

    const registros = [];
    for (const tipo in clasificaciones) {
      for (const calibreKey in clasificaciones[tipo]) {
        const datos = clasificaciones[tipo][calibreKey];
        if ((datos.cajas || datos.kg) && (datos.cajas > 0 || datos.kg > 0)) {
          registros.push({
            entrega_id: entregaSeleccionada.entrega_id,
            cliente_nombre: entregaSeleccionada.cliente_nombre,
            fecha: fechaSolo,
            tipo,
            calibre: labelFor(calibreKey),
            cajas: parseInt(datos.cajas || 0, 10),
            kg: parseFloat(datos.kg || 0),
          });
        }
      }
    }

    if (registros.length === 0) {
      setToast({
        text: '❌ Debes llenar al menos una fila con cajas o kg.',
        color: 'red',
      });
      setTimeout(() => setToast({ text: '', color: '' }), 4000);
      return;
    }

    // Debe coincidir exactamente la cantidad de KG
    const totalClasificadoKg = totalGeneral();
    const diferencia = Math.abs(totalClasificadoKg - totalKilosRecepcion);

    if (totalClasificadoKg > totalKilosRecepcion) {
      setToast({
        text: `❌ No puedes clasificar más de ${totalKilosRecepcion} kg.`,
        color: 'red',
      });
      setTimeout(() => setToast({ text: '', color: '' }), 4000);
      return;
    }

    if (totalClasificadoKg < totalKilosRecepcion) {
      setToast({
        text: `⚠️ Has clasificado ${diferencia.toLocaleString()} kg menos de los recibidos (${totalClasificadoKg.toLocaleString()} / ${totalKilosRecepcion.toLocaleString()} kg). Debes clasificar la cantidad exacta.`,
        color: 'red',
      });
      setTimeout(() => setToast({ text: '', color: '' }), 5000);
      return;
    }

    const { data: inserted, error } = await supabase
      .from('clasificacion')
      .insert(registros)
      .select('id');

    if (error) {
      setToast({
        text: '❌ Error al guardar: ' + error.message,
        color: 'red',
      });
      setTimeout(() => setToast({ text: '', color: '' }), 4000);
    } else {
      setToast({
        text:
          '✅ Clasificación guardada correctamente. Entrega eliminada del listado de pendientes.',
        color: 'green',
      });

      // Sacar la entrega del listado de pendientes
      setEntregas((prev) =>
        prev.filter((e) => e.entrega_id !== entregaSeleccionada.entrega_id)
      );
      setEntregaSeleccionada(null);
      setDetalleRecepcion([]);
      setClasificaciones({});
      setTotalCajasRecepcion(null);

      // Avisar al padre (modo Secretaría)
      if (typeof onClasificacionGuardada === 'function') {
        onClasificacionGuardada({
          entregaId: entregaSeleccionada.entrega_id,
          clienteNombre: entregaSeleccionada.cliente_nombre,
          totalKgRecepcion: totalKilosRecepcion,
          totalCajasRecepcion,
          registrosInsertadosIds: inserted ? inserted.map((r) => r.id) : [],
        });
      }

      setTimeout(() => setToast({ text: '', color: '' }), 4000);
    }
  };

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const irAVentas = () => navigate('/ventas');

  // 🎨 Estilos
  const thEstilo = { padding: '0.6rem', textAlign: 'left', fontWeight: 'bold' };
  const tdEstilo = { padding: '0.5rem' };
  const inputTabla = {
    width: '100%',
    maxWidth: '100px',
    padding: '0.4rem',
    borderRadius: '6px',
    border: '1px solid #ccc',
    textAlign: 'center',
  };

  const toastAnimation = `
    @keyframes slideFade {
      0% { opacity: 0; transform: translateX(100%); }
      10% { opacity: 1; transform: translateX(0); }
      90% { opacity: 1; transform: translateX(0); }
      100% { opacity: 0; transform: translateX(100%); }
    }
  `;

  const btnVolver = {
    padding: '0.45rem 0.9rem',
    background: '#2e7d32',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  };

  const btnCerrar = {
    padding: '0.45rem 0.9rem',
    background: '#d32f2f',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  };

  // Wrapper: mismo que antes (fondo gris) para modo normal
  const wrapperStyle = modoSecretaria
    ? {
        fontFamily: 'Arial, sans-serif',
      }
    : {
        minHeight: '100vh',
        background: '#f5f5f5',
        display: 'flex',
        justifyContent: 'center',
        padding: '2rem 1rem',
        fontFamily: 'Arial, sans-serif',
      };

  const cardStyle = {
    maxWidth: 1100,
    width: '100%',
    background: '#fff',
    padding: '1.5rem',
    borderRadius: 8,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    margin: modoSecretaria ? '1rem 0' : '0',
  };

  return (
    <div style={wrapperStyle}>
      <style>{toastAnimation}</style>

      <div style={cardStyle}>
        {/* Encabezado */}
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <img
            src="/aguacate.jpg"
            alt="Logo"
            style={{ width: '80px', marginBottom: '1rem' }}
          />
          <h2 style={{ color: '#2e7d32' }}>
            Clasificación por tipo de aguacate
          </h2>
        </div>

        {/* Barra de acciones: solo en modo normal */}
        {!modoSecretaria && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              justifyContent: 'flex-end',
              margin: '-8px 0 12px 0',
              flexWrap: 'wrap',
            }}
          >
            <button onClick={irAVentas} style={btnVolver}>
              ← Registrar compra
            </button>
            <button onClick={cerrarSesion} style={btnCerrar}>
              🔒 Cerrar sesión
            </button>
          </div>
        )}

        {entregas.length === 0 ? (
          <p
            style={{
              textAlign: 'center',
              color: '#666',
              fontStyle: 'italic',
              marginTop: '1rem',
            }}
          >
            ✅ No hay entregas pendientes por clasificar.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label>Entrega:</label>
            <select
              value={entregaSeleccionada?.entrega_id || ''}
              onChange={handleEntregaChange}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid #ccc',
              }}
            >
              <option value="">Selecciona una entrega</option>
              {entregas.map((r) => {
                const ymd = String(r.fecha_hora || '').slice(0, 10);
                const [yyyy, mm, dd] = ymd.split('-');
                const fechaStr = `${dd}/${mm}/${yyyy}`;
                return (
                  <option key={r.entrega_id} value={r.entrega_id}>
                    {r.cliente_nombre} – {fechaStr} –{' '}
                    {r.total_kilos.toLocaleString()} KG
                  </option>
                );
              })}
            </select>

            {entregaSeleccionada && totalKilosRecepcion && (
              <>
                <p style={{ marginTop: '0.5rem', fontWeight: 'bold' }}>
                  Total de kilos recibidos:{' '}
                  {Number(totalKilosRecepcion).toLocaleString()} KG
                  {totalCajasRecepcion != null && (
                    <>
                      {' '}
                      —{' '}
                      {Number(totalCajasRecepcion).toLocaleString()} CAJAS
                    </>
                  )}
                </p>

                {detalleRecepcion.map((item, i) => (
                  <div key={i} style={{ marginTop: '1.5rem' }}>
                    <h4 style={{ color: '#2e7d32' }}>
                      {item.tipo.toUpperCase()} (
                      {item.kilos.toLocaleString()} KG
                      {item.cajas
                        ? ` / ${item.cajas.toLocaleString()} CAJAS`
                        : ''}
                      )
                    </h4>
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        marginTop: '0.5rem',
                      }}
                    >
                      <thead
                        style={{
                          backgroundColor: '#2e7d32',
                          color: '#fff',
                        }}
                      >
                        <tr>
                          <th style={thEstilo}>#</th>
                          <th style={thEstilo}>Calibre</th>
                          <th style={thEstilo}>Cajas</th>
                          <th style={thEstilo}>KG</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calibreKeys.map((key, index) => {
                          const isOtro = key.startsWith('OTRO_');
                          const label = labelFor(key);

                          return (
                            <tr
                              key={key}
                              style={{
                                backgroundColor:
                                  index % 2 === 0 ? '#f9f9f9' : '#fff',
                              }}
                            >
                              <td style={tdEstilo}>{index + 1}</td>
                              <td style={tdEstilo}>
                                {isOtro ? (
                                  <input
                                    type="text"
                                    value={customNames[key]}
                                    placeholder={defaultCalibreNames[key]}
                                    onChange={(e) =>
                                      setCustomNames((prev) => ({
                                        ...prev,
                                        [key]: e.target.value.toUpperCase(),
                                      }))
                                    }
                                    style={{
                                      width: '100%',
                                      maxWidth: 180,
                                      padding: '0.35rem',
                                      border: '1px solid #ccc',
                                      borderRadius: 6,
                                    }}
                                  />
                                ) : (
                                  label
                                )}
                              </td>
                              <td style={tdEstilo}>
                                <input
                                  type="number"
                                  min="0"
                                  value={
                                    clasificaciones[item.tipo]?.[key]?.cajas ||
                                    ''
                                  }
                                  onChange={(e) =>
                                    handleInputChange(
                                      item.tipo,
                                      key,
                                      'cajas',
                                      e.target.value
                                    )
                                  }
                                  style={inputTabla}
                                />
                              </td>
                              <td style={tdEstilo}>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={
                                    clasificaciones[item.tipo]?.[key]?.kg ||
                                    ''
                                  }
                                  onChange={(e) =>
                                    handleInputChange(
                                      item.tipo,
                                      key,
                                      'kg',
                                      e.target.value
                                    )
                                  }
                                  style={inputTabla}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <p
                      style={{
                        textAlign: 'right',
                        fontWeight: 'bold',
                        color:
                          totalPorTipo(item.tipo) > item.kilos
                            ? 'red'
                            : '#2e7d32',
                        marginTop: '0.4rem',
                      }}
                    >
                      Total clasificado ({item.tipo}):{' '}
                      {totalPorTipo(item.tipo).toLocaleString()} kg de{' '}
                      {item.kilos.toLocaleString()} kg
                    </p>
                  </div>
                ))}

                <p
                  style={{
                    textAlign: 'right',
                    marginTop: '1rem',
                    fontWeight: 'bold',
                  }}
                >
                  Total clasificado:{' '}
                  {totalGeneral().toLocaleString()} kg
                </p>

                <div style={{ textAlign: 'right', marginTop: '0.5rem' }}>
                  <button
                    type="submit"
                    style={{
                      padding: '0.6rem 1.2rem',
                      background: '#2e7d32',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                  >
                    Guardar clasificación
                  </button>
                </div>
              </>
            )}
          </form>
        )}

        {/* Toast flotante */}
        {toast.text && (
          <div
            style={{
              position: 'fixed',
              right: 16,
              bottom: 16,
              background: toast.color === 'red' ? '#d32f2f' : '#2e7d32',
              color: '#fff',
              padding: '0.7rem 1.1rem',
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              animation: 'slideFade 4s ease-in-out',
              zIndex: 9999,
              maxWidth: '360px',
            }}
          >
            {toast.text}
          </div>
        )}
      </div>
    </div>
  );
}
