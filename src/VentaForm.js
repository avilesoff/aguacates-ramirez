// src/VentaForm.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

// Helper: fecha local YYYY-MM-DD (sin UTC)
function hoyLocalYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function VentaForm({
  modoSecretaria = false,
  clasificacionIdInicial = null, // entrega_id que viene de ClasificacionEntrega
  entregaResumen = null, // opcional, por si luego quieres mostrar resumen
}) {
  const navigate = useNavigate();

  const [datosCliente, setDatosCliente] = useState({
    nombre: '',
    // Antes: new Date().toISOString().split('T')[0]  (UTC)
    fecha: hoyLocalYMD(), // ahora es fecha local
  });

  const [anticipoMontos, setAnticipoMontos] = useState(['', '', '', '', '']);
  const [saldoAnteriorMontos, setSaldoAnteriorMontos] = useState(['', '', '', '', '']);

  const [productosPorTipo, setProductosPorTipo] = useState({});
  const [mensaje, setMensaje] = useState('');
  const [clasificaciones, setClasificaciones] = useState([]);
  const [clasificacionSeleccionada, setClasificacionSeleccionada] = useState('');
  const [recepcionesConVenta, setRecepcionesConVenta] = useState(new Set());

  // Opciones para el select de descripción
  const OPCIONES_CALIBRE = [
    'SUPER',
    'EXTRA',
    '1RA',
    '2DA',
    '3RA',
    '4TA',
    '4TA ROÑA',
    'CLASE B',
    'PROCESO',
    'DESECHO',
  ];

  // Muestra dd/mm/yyyy SIN tocar zonas horarias
  const fmtFecha = (v) => {
    if (!v) return '';
    const s = String(v).slice(0, 10); // 'YYYY-MM-DD'
    const [yyyy, mm, dd] = s.split('-');
    if (!yyyy || !mm || !dd) return '';
    return `${dd}/${mm}/${yyyy}`;
  };

  // ---- Anticipos (hasta 5) ----
  const limpiarMonto = (v) => {
    if (v === '' || v == null) return '';
    return String(v).replace(/[^\d.]/g, '');
  };

  const anticipoNumeros = (anticipoMontos || [])
  .map((x) => Number(x) || 0)
  .map((n) => (n > 0 ? n : 0));

  const saldoAnteriorNumeros = (saldoAnteriorMontos || [])
  .map((x) => Number(x) || 0)
  .map((n) => (n > 0 ? n : 0));

  const anticipoTotal = anticipoNumeros.reduce((a, b) => a + b, 0);
  const saldoAnteriorTotal = saldoAnteriorNumeros.reduce((a, b) => a + b, 0);

  // ------------ Helpers de carga/refresco ------------
  const refetchVentas = async () => {
    const { data: ven, error: errVen } = await supabase
      .from('ventas')
      .select('recepcion_id, clasificacion_entrega_id');

    if (!errVen && ven) {
      const setIds = new Set();
      for (const v of ven || []) {
        if (v.recepcion_id != null) setIds.add(String(v.recepcion_id));
        if (v.clasificacion_entrega_id) setIds.add(String(v.clasificacion_entrega_id));
      }
      setRecepcionesConVenta(setIds);
    }
  };

  const refetchClasificacion = async () => {
    const { data: cls, error: errCls } = await supabase
      .from('clasificacion')
      .select('entrega_id, cliente_nombre, fecha, kg, finalizado')
      .order('fecha', { ascending: false });

    if (errCls) {
      console.error('Error cargando clasificaciones:', errCls.message);
      setClasificaciones([]);
      return;
    }

    const mapa = new Map();
    for (const row of cls || []) {
      const key = row.entrega_id;
      if (!key) continue;

      const actual = mapa.get(key) || {
        recepcion_id: key, // usamos entrega_id como id
        cliente_nombre: row.cliente_nombre,
        fecha: row.fecha,
        total_kg: 0,
        finalizado: !!row.finalizado,
      };
      actual.total_kg += parseFloat(row.kg) || 0;
      if (!actual.fecha || new Date(row.fecha) > new Date(actual.fecha)) {
        actual.fecha = row.fecha;
      }
      actual.finalizado = actual.finalizado || !!row.finalizado;
      mapa.set(key, actual);
    }
    setClasificaciones(Array.from(mapa.values()));
  };

  // ------------ Carga inicial ------------
  useEffect(() => {
    (async () => {
      await Promise.all([refetchClasificacion(), refetchVentas()]);
    })();
  }, []);

  // ------------ Al seleccionar una clasificación ------------
  const handleSeleccionClasificacion = async (e) => {
    const idStr = e.target.value; // entrega_id (puede ser UUID)
    setClasificacionSeleccionada(idStr);

    setMensaje('');
    setProductosPorTipo({});

    if (!idStr) {
      setDatosCliente((prev) => ({ ...prev, nombre: '' }));
      return;
    }

    const seleccionada = clasificaciones.find((c) => String(c.recepcion_id) === String(idStr));
    if (!seleccionada) {
      setMensaje('❌ No se encontró la clasificación seleccionada.');
      return;
    }

    // Asegura que el input date reciba exactamente 'YYYY-MM-DD'
    const fechaYMD = String(seleccionada.fecha || '').slice(0, 10);

    setDatosCliente((prev) => ({
      ...prev,
      nombre: seleccionada.cliente_nombre,
      fecha: fechaYMD, // fuerza 'YYYY-MM-DD' para el <input type="date">
    }));

    // ⬇️ AHORA TRAEMOS TAMBIÉN CAJAS
    const { data: registros, error } = await supabase
      .from('clasificacion')
      .select('tipo, calibre, kg, cajas')
      .eq('entrega_id', idStr);

    if (error) {
      console.error('Error cargando detalles de clasificacion:', error.message);
      setMensaje('❌ Error al cargar la clasificación.');
      return;
    }

    if (!registros || !registros.length) {
      setMensaje('⚠️ No hay datos válidos en la clasificación seleccionada.');
      return;
    }

    // Agrupar por tipo y calibre, sumando KG y CAJAS
    const porTipo = {};
    for (const reg of registros) {
      const tipo = reg.tipo || 'SIN TIPO';
      const calibre = reg.calibre || 'Sin calibre';
      const kilos = parseFloat(reg.kg) || 0;
      const cajas = parseFloat(reg.cajas) || 0;

      if (!porTipo[tipo]) porTipo[tipo] = {};
      if (!porTipo[tipo][calibre]) porTipo[tipo][calibre] = { kg: 0, cajas: 0 };

      porTipo[tipo][calibre].kg += kilos;
      porTipo[tipo][calibre].cajas += cajas;
    }

    const resultado = {};
    Object.keys(porTipo).forEach((tipo) => {
      resultado[tipo] = Object.entries(porTipo[tipo]).map(([descripcion, agg], i) => ({
        id: `${idStr}-${tipo}-${i}`,
        cantidad: agg.kg, // kilos
        cajas: agg.cajas, // total de cajas por calibre
        descripcion,
        precio: '',
        importe: 0,
      }));
    });

    setProductosPorTipo(resultado);
  };

  // 👉 Auto-seleccionar clasificación cuando venga de Secretaría
  useEffect(() => {
    if (!clasificacionIdInicial) return;
    if (!clasificaciones || clasificaciones.length === 0) return;

    // Si ya está seleccionada, no vuelvas a cargarla
    if (
      clasificacionSeleccionada &&
      String(clasificacionSeleccionada) === String(clasificacionIdInicial)
    ) {
      return;
    }

    // Simular evento del select
    handleSeleccionClasificacion({
      target: { value: String(clasificacionIdInicial) },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clasificacionIdInicial, clasificaciones]);

  // ------------ Edición de filas ------------
  const handleCambioProducto = (tipo, index, campo, valor) => {
    const nuevos = { ...productosPorTipo };
    const fila = { ...nuevos[tipo][index] };

    fila[campo] = valor;
    const cantidad = parseFloat(fila.cantidad) || 0;
    const precio = parseFloat(fila.precio) || 0;
    fila.importe = cantidad * precio;

    nuevos[tipo][index] = fila;
    setProductosPorTipo(nuevos);
  };

  // ------------ Totales ------------
  const totalGeneral = Object.values(productosPorTipo)
    .flat()
    .reduce((sum, p) => sum + (parseFloat(p.importe) || 0), 0);

  // ------------ Guardar compra ------------
  const handleSubmit = async (e) => {
    e.preventDefault();

    const recId = clasificacionSeleccionada ? String(clasificacionSeleccionada) : null;
    const esNumerico = recId && /^\d+$/.test(recId);
    const recepcionIdParaInsert = esNumerico ? Number(recId) : null;

    const filasValidas = Object.entries(productosPorTipo)
      .flatMap(([tipoOrigen, filas]) =>
        filas
          .map((p) => {
            const cantidadNum = parseFloat(p.cantidad);
            const precioNum = parseFloat(p.precio);

            const esCantidadValida = !Number.isNaN(cantidadNum) && cantidadNum > 0;
            const esPrecioValido = !Number.isNaN(precioNum) && precioNum >= 0; // permite 0

            if (!p.descripcion || !esCantidadValida || !esPrecioValido) return null;

            return {
              tipo: p.descripcion,
              tipo_origen: tipoOrigen,
              calibre: p.descripcion,
              kg: cantidadNum,
              cajas: Number(p.cajas) || 0, // guardamos las cajas por renglón
              precio_unitario: precioNum,
              importe: cantidadNum * precioNum,
            };
          })
          .filter(Boolean)
      );

    if (filasValidas.length === 0) {
      setMensaje('❌ Debes ingresar al menos un producto con cantidad, descripción y precio.');
      return;
    }

    const { data: resultado, error: errorNota } = await supabase.rpc('generar_numero_nota');
    if (errorNota || !resultado) {
      setMensaje('❌ Error al generar número de nota.');
      return;
    }
    const numeroNota = resultado;

    const payloadBase = {
      numero_nota: numeroNota,
      fecha: datosCliente.fecha,
      recepcion_id: recepcionIdParaInsert, // null si el id es UUID
      nombre_cliente: datosCliente.nombre,
      productos: filasValidas,
      total: filasValidas.reduce((sum, p) => sum + p.importe, 0),
      anticipo: anticipoTotal + saldoAnteriorTotal, // compatibilidad con lo viejo
      anticipo_montos: anticipoNumeros.filter((n) => n > 0).slice(0, 5),
      saldo_anterior_montos: saldoAnteriorNumeros.filter((n) => n > 0).slice(0, 5),
      anticipo_total: anticipoTotal,
      saldo_anterior_total: saldoAnteriorTotal,
    };

    const payloadConUUID = {
      ...payloadBase,
      clasificacion_entrega_id: !esNumerico ? recId : null, // UUID cuando aplique
    };

    let errorGuardar;
    try {
      ({ error: errorGuardar } = await supabase.from('ventas').insert(payloadConUUID));
      if (errorGuardar && errorGuardar.code === '42703') {
        // si no existe la columna, reintenta sin ella
        ({ error: errorGuardar } = await supabase.from('ventas').insert(payloadBase));
      }
    } catch (e2) {
      errorGuardar = e2;
    }

    if (errorGuardar) {
      setMensaje('❌ Error al guardar: ' + (errorGuardar.message || errorGuardar));
    } else {
      // 1) Ocúltala de inmediato en la UI
      if (recId) {
        setRecepcionesConVenta((prev) => {
          const s = new Set(prev);
          s.add(String(recId));
          return s;
        });
      }
      // 2) Refresca ventas desde la BD para recalcular el set (por si hay cambios/UUID)
      await refetchVentas();

      setMensaje(`✅ Compra guardada correctamente con nota #${numeroNota}`);
      setAnticipoMontos(['', '', '', '', '']);
      setSaldoAnteriorMontos(['', '', '', '', '']);
      setProductosPorTipo({});
      setClasificacionSeleccionada('');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  // Solo clasificaciones PENDIENTES (sin venta)
  const clasificacionesPendientes = clasificaciones.filter((c) => {
    const id = String(c.recepcion_id);
    return !recepcionesConVenta.has(id);
  });

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: 'auto', fontFamily: 'Arial' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <img src="/aguacate.jpg" alt="Logo" style={{ width: '80px', marginBottom: '1rem' }} />
        <h2 style={{ margin: 0, color: '#2e7d32' }}>
          Aguacates <span style={{ fontWeight: 'bold' }}>Ramírez</span>
        </h2>
        <p style={{ margin: '0.3rem 0' }}>
          <strong>Registro SAGARPA:</strong> <span style={{ color: '#333' }}>EMP0416058459/2021</span>
        </p>
        <p style={{ margin: 0 }}>Prolongación Linda Vista Carr. San Juan Nuevo - Tancítaro</p>
      </div>

      <h3 style={{ textAlign: 'center', color: '#2e7d32' }}>Registro de Compra</h3>

      {/* BOTONES SUPERIORES (solo modo normal) */}
      {!modoSecretaria && (
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            justifyContent: 'flex-end',
            marginBottom: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <button onClick={() => navigate('/recepcion')} style={botonRecepcion}>
            📥 Recepción
          </button>
          <button onClick={() => navigate('/clasificacion-entrega')} style={botonClasificacion}>
            📦 Clasificación
          </button>
          <button onClick={() => navigate('/secretaria')} style={botonSecretaria}>
            📁 Secretaría
          </button>
          <button onClick={handleLogout} style={botonCerrarSesion}>
            🔒 Cerrar sesión
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '0.5rem' }}>
          <label>
            <strong>Seleccionar clasificación:</strong>
          </label>
          <select onChange={handleSeleccionClasificacion} style={inputEstilo} value={clasificacionSeleccionada}>
            <option value="">-- Elige una clasificación --</option>
            {clasificacionesPendientes.map((c) => {
              const id = String(c.recepcion_id);
              const label = `${fmtFecha(c.fecha)} - ${c.cliente_nombre} (${(c.total_kg || 0).toLocaleString()} kg)`;
              return (
                <option key={id} value={id}>
                  {label}
                </option>
              );
            })}
          </select>
          {clasificacionesPendientes.length === 0 && (
            <small style={{ color: '#777' }}>No hay clasificaciones pendientes de compra.</small>
          )}
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>
          <input
            type="text"
            name="nombre"
            placeholder="Nombre"
            value={datosCliente.nombre}
            onChange={(e) => setDatosCliente({ ...datosCliente, nombre: e.target.value })}
            style={inputEstilo}
            required
          />
          <input
            type="date"
            name="fecha"
            value={datosCliente.fecha}
            onChange={(e) => setDatosCliente({ ...datosCliente, fecha: e.target.value })}
            style={inputEstilo}
            required
          />
        </div>

        <div style={{ marginTop: '1rem' }}>
  {/* SALDO ANTERIOR */}
  <div style={{ marginBottom: '1.5rem' }}>
    <label>
      <strong>Saldo anterior:</strong>
    </label>

    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 10,
        marginTop: 8,
      }}
    >
      {saldoAnteriorMontos.map((val, idx) => (
        <div key={`saldo-${idx}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.85rem', color: '#555' }}>{idx + 1}.-</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={val}
            onChange={(e) => {
              const v = limpiarMonto(e.target.value);
              setSaldoAnteriorMontos((prev) => {
                const next = [...prev];
                next[idx] = v;
                return next;
              });
            }}
            style={inputEstilo}
            placeholder="0.00"
          />
        </div>
      ))}
    </div>

    <div style={{ marginTop: 10, textAlign: 'right', fontWeight: 'bold' }}>
      Total Saldo anterior: ${saldoAnteriorTotal.toFixed(2)}
    </div>
  </div>

  {/* ANTICIPO */}
  <div>
    <label>
      <strong>Anticipo:</strong>
    </label>

    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 10,
        marginTop: 8,
      }}
    >
      {anticipoMontos.map((val, idx) => (
        <div key={`anticipo-${idx}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.85rem', color: '#555' }}>{idx + 1}.-</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={val}
            onChange={(e) => {
              const v = limpiarMonto(e.target.value);
              setAnticipoMontos((prev) => {
                const next = [...prev];
                next[idx] = v;
                return next;
              });
            }}
            style={inputEstilo}
            placeholder="0.00"
          />
        </div>
      ))}
    </div>

    <div style={{ marginTop: 10, textAlign: 'right', fontWeight: 'bold' }}>
      Total Anticipo: ${anticipoTotal.toFixed(2)}
    </div>
  </div>
</div>

        {Object.keys(productosPorTipo).map((tipo) => (
          <div key={tipo} style={{ marginTop: '2rem' }}>
            <h4 style={{ color: '#2e7d32' }}>{tipo}</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#eee' }}>
                  <th>Cajas</th>
                  <th>Kilos</th>
                  <th>Descripción</th>
                  <th>Precio</th>
                  <th>Importe</th>
                </tr>
              </thead>
              <tbody>
                {productosPorTipo[tipo].map((p, index) => (
                  <tr key={p.id}>
                    {/* Cajas (solo lectura) */}
                    <td style={{ textAlign: 'right' }}>{Number(p.cajas || 0).toLocaleString()}</td>

                    {/* Kilos (editable) */}
                    <td>
                      <input
                        type="number"
                        value={p.cantidad}
                        onChange={(e) => handleCambioProducto(tipo, index, 'cantidad', e.target.value)}
                        style={inputTabla}
                      />
                    </td>

                    {/* Descripción */}
                    <td>
                      <select
                        value={p.descripcion || ''}
                        onChange={(e) => handleCambioProducto(tipo, index, 'descripcion', e.target.value)}
                        style={selectTabla}
                      >
                        <option value="">Selecciona</option>
                        {!OPCIONES_CALIBRE.includes(p.descripcion) && p.descripcion && (
                          <option value={p.descripcion}>{p.descripcion}</option>
                        )}
                        {OPCIONES_CALIBRE.map((op) => (
                          <option key={op} value={op}>
                            {op}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Precio */}
                    <td>
                      <input
                        type="number"
                        value={p.precio}
                        onChange={(e) => handleCambioProducto(tipo, index, 'precio', e.target.value)}
                        style={inputTabla}
                      />
                    </td>

                    {/* Importe */}
                    <td style={{ textAlign: 'right' }}>{p.importe.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <h3 style={{ textAlign: 'right', marginTop: '1rem' }}>Total General: ${totalGeneral.toFixed(2)}</h3>

        <button type="submit" style={botonPrincipal}>
          Guardar compra
        </button>
      </form>

      {mensaje && (
        <p style={{ marginTop: '1rem', textAlign: 'center', color: mensaje.includes('❌') ? 'red' : 'green' }}>
          {mensaje}
        </p>
      )}
    </div>
  );
}

const inputEstilo = {
  width: '100%',
  padding: '0.5rem',
  border: '1px solid #ccc',
  borderRadius: '6px',
};

const inputTabla = {
  width: '100%',
  padding: '0.3rem',
  borderRadius: '4px',
  border: '1px solid #ccc',
};

const selectTabla = {
  width: '100%',
  padding: '0.3rem',
  borderRadius: '4px',
  border: '1px solid #ccc',
  backgroundColor: '#fff',
};

const botonPrincipal = {
  width: '100%',
  padding: '0.8rem',
  backgroundColor: '#2e7d32',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '1rem',
  marginTop: '1.5rem',
};

/* === Botones de navegación (solo modo normal) === */
const botonRecepcion = {
  padding: '0.5rem 1rem',
  backgroundColor: '#1565c0',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
};

const botonClasificacion = {
  padding: '0.5rem 1rem',
  backgroundColor: '#6a1b9a',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
};

const botonSecretaria = {
  padding: '0.5rem 1rem',
  backgroundColor: '#2e7d32',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
};

const botonCerrarSesion = {
  padding: '0.5rem 1rem',
  backgroundColor: '#b71c1c',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
};