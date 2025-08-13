import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

export default function VentaForm() {
  const navigate = useNavigate();

  const [datosCliente, setDatosCliente] = useState({
    nombre: '',
    domicilio: '',
    ciudad: '',
    placas: '',
    fecha: new Date().toISOString().split('T')[0]
  });

  const [productos, setProductos] = useState([]);
  const [mensaje, setMensaje] = useState('');
  const [clasificaciones, setClasificaciones] = useState([]);
  const [clasificacionSeleccionada, setClasificacionSeleccionada] = useState(null); // string

  // ✅ recepciones que YA tienen una venta registrada
  const [recepcionesConVenta, setRecepcionesConVenta] = useState(new Set());

  // Cargar clasificaciones pendientes y recepciones con venta
  useEffect(() => {
    const cargar = async () => {
      // Clasificaciones agrupadas no finalizadas (con recepcion_id)
      const { data: cls, error: errCls } = await supabase
        .from('clasificaciones_agrupadas')
        .select('*')
        .eq('finalizado', false);

      if (!errCls && cls) {
        const filtradas = cls.filter(c => c.recepcion_id !== null);
        setClasificaciones(filtradas);
      } else if (errCls) {
        console.error(errCls);
      }

      // Ventas que ya apuntan a una recepción (para poner la ✅ y bloquear)
      const { data: ven, error: errVen } = await supabase
        .from('ventas')
        .select('recepcion_id')
        .not('recepcion_id', 'is', null);

      if (!errVen && ven) {
        const setIds = new Set(ven.map(v => Number(v.recepcion_id)).filter(Boolean));
        setRecepcionesConVenta(setIds);
      } else if (errVen) {
        console.error(errVen);
      }
    };

    cargar();
  }, []);

  const handleSeleccionClasificacion = (e) => {
    const idStr = e.target.value; // select devuelve string
    if (!idStr) {
      setClasificacionSeleccionada(null);
      setProductos([]);
      setDatosCliente(prev => ({ ...prev, nombre: '' }));
      return;
    }

    const idNum = Number(idStr);
    const seleccionada = clasificaciones.find(c => Number(c.recepcion_id) === idNum);
    if (!seleccionada) return;

    setClasificacionSeleccionada(idStr);

    setDatosCliente(prev => ({
      ...prev,
      nombre: seleccionada.cliente_nombre,
      fecha: seleccionada.fecha
    }));

    const detalles = Array.isArray(seleccionada.detalles) ? seleccionada.detalles : [];
    const productosDesdeClasificacion = detalles.map((det, i) => ({
      id: `${idStr}-${i}`,
      cantidad: det.kilos,
      descripcion: det.calibre,
      precio: '',
      importe: 0
    }));

    setProductos(productosDesdeClasificacion);
  };

  const handleCambioCliente = (e) => {
    const { name, value } = e.target;
    setDatosCliente(prev => ({ ...prev, [name]: value }));
  };

  const handleCambioProducto = (index, campo, valor) => {
    const nuevos = [...productos];
    nuevos[index][campo] = valor;
    const cantidad = parseFloat(nuevos[index].cantidad) || 0;
    const precio = parseFloat(nuevos[index].precio) || 0;
    nuevos[index].importe = cantidad * precio;
    setProductos(nuevos);
  };

  const agregarFila = () => {
    setProductos([
      ...productos,
      {
        id: `manual-${Date.now()}`,
        cantidad: '',
        descripcion: '',
        precio: '',
        importe: 0
      }
    ]);
  };

  const eliminarFila = (index) => {
    const nuevos = [...productos];
    nuevos.splice(index, 1);
    setProductos(nuevos);
  };

  const total = productos.reduce((sum, p) => sum + (parseFloat(p.importe) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // 🛑 Bloqueo doble: no permitir si la recepción ya tiene venta
    const recId = clasificacionSeleccionada ? Number(clasificacionSeleccionada) : null;
    if (recId && recepcionesConVenta.has(recId)) {
      setMensaje('❌ Esta clasificación ya tiene una venta registrada.');
      return;
    }

    const filasValidas = productos
      .filter(p => p.descripcion && parseFloat(p.cantidad) > 0 && parseFloat(p.precio) > 0)
      .map(p => {
        const kg = parseFloat(p.cantidad);
        const precio = parseFloat(p.precio);
        const importe = kg * precio;
        return {
          calibre: p.descripcion,
          kg,
          precio_unitario: precio,
          importe
        };
      });

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

    const payload = {
      numero_nota: numeroNota,
      fecha: datosCliente.fecha,
      recepcion_id: recId ?? null,
      nombre_cliente: datosCliente.nombre,
      domicilio: datosCliente.domicilio || null,
      ciudad: datosCliente.ciudad || null,
      placas: datosCliente.placas || null,
      productos: filasValidas,
      total: filasValidas.reduce((sum, p) => sum + p.importe, 0)
    };

    const { error: errorGuardar } = await supabase.from('ventas').insert(payload);

    if (errorGuardar) {
      // Si el backend tiene índice único, podemos capturar duplicado:
      if (errorGuardar.code === '23505') {
        setMensaje('❌ Ya existe una venta para esta clasificación.');
      } else {
        setMensaje('❌ Error al guardar: ' + errorGuardar.message);
      }
    } else {
      // ✅ actualiza el set para mostrar la paloma en la lista
      if (recId) {
        setRecepcionesConVenta(prev => {
          const next = new Set(prev);
          next.add(recId);
          return next;
        });
      }

      setMensaje(`✅ Venta guardada correctamente con nota #${numeroNota}`);
      setDatosCliente({
        nombre: '',
        domicilio: '',
        ciudad: '',
        placas: '',
        fecha: new Date().toISOString().split('T')[0]
      });
      setProductos([]);
      setClasificacionSeleccionada(null);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: 'auto', fontFamily: 'Arial' }}>
      {/* Encabezado */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <img src="/aguacate.jpg" alt="Logo" style={{ width: '80px', marginBottom: '1rem' }} />
        <h2 style={{ margin: '0', color: '#2e7d32' }}>
          Aguacates <span style={{ fontWeight: 'bold' }}>Ramírez</span>
        </h2>
        <p style={{ margin: '0.3rem 0' }}>
          <strong>Registro SAGARPA:</strong> <span style={{ color: '#333' }}>EMP0416058459/2021</span>
        </p>
        <p style={{ margin: '0' }}>Prolongación Linda Vista Carr. San Juan Nuevo - Tancítaro</p>
      </div>

      <h3 style={{ textAlign: 'center', color: '#2e7d32' }}>Registro de Venta</h3>

      {/* Botones superiores */}
      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button onClick={() => navigate('/secretaria')} style={botonSecretaria}>
          📁 Secretaría
        </button>
        <button onClick={handleLogout} style={botonCerrarSesion}>
          🔒 Cerrar sesión
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '0.5rem' }}>
          <label><strong>Seleccionar clasificación:</strong></label>
          <select
            onChange={handleSeleccionClasificacion}
            style={inputEstilo}
            value={clasificacionSeleccionada || ''}
          >
            <option value="">-- Elige una clasificación --</option>
            {clasificaciones.map((c) => {
              const id = Number(c.recepcion_id);
              const yaVendida = recepcionesConVenta.has(id);
              const label = `${yaVendida ? '✅ ' : ''}${c.fecha} - ${c.cliente_nombre} (${c.total_kg} kg)`;
              return (
                <option
                  key={String(c.recepcion_id)}
                  value={String(c.recepcion_id)}
                  disabled={yaVendida}     // las ya vendidas quedan deshabilitadas
                >
                  {label}
                </option>
              );
            })}
          </select>
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>
          <input type="text" name="nombre" placeholder="Nombre" value={datosCliente.nombre} onChange={handleCambioCliente} style={inputEstilo} required />
          <input type="text" name="domicilio" placeholder="Domicilio" value={datosCliente.domicilio} onChange={handleCambioCliente} style={inputEstilo} />
          <input type="text" name="ciudad" placeholder="Ciudad" value={datosCliente.ciudad} onChange={handleCambioCliente} style={inputEstilo} />
          <input type="text" name="placas" placeholder="Placas" value={datosCliente.placas} onChange={handleCambioCliente} style={inputEstilo} />
          <input type="date" name="fecha" value={datosCliente.fecha} onChange={handleCambioCliente} style={inputEstilo} required />
        </div>

        <table style={{ width: '100%', marginTop: '2rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#eee' }}>
              <th>Kilos</th>
              <th>Descripción</th>
              <th>Precio</th>
              <th>Importe</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p, index) => (
              <tr key={p.id}>
                <td><input type="number" value={p.cantidad} onChange={e => handleCambioProducto(index, 'cantidad', e.target.value)} style={inputTabla} /></td>
                <td>
                  <select value={p.descripcion} onChange={e => handleCambioProducto(index, 'descripcion', e.target.value)} style={inputTabla}>
                    <option value="">Selecciona</option>
                    <option value="SUPER">SUPER</option>
                    <option value="EXTRA">EXTRA</option>
                    <option value="1RA">1RA</option>
                    <option value="2DA">2DA</option>
                    <option value="3RA">3RA</option>
                    <option value="4TA">4TA</option>
                    <option value="4TA ROÑA">4TA ROÑA</option>
                    <option value="CLASE B">CLASE B</option>
                    <option value="PROCESO">PROCESO</option>
                    <option value="DESECHO">DESECHO</option>
                  </select>
                </td>
                <td><input type="number" value={p.precio} onChange={e => handleCambioProducto(index, 'precio', e.target.value)} style={inputTabla} /></td>
                <td style={{ textAlign: 'right' }}>{p.importe.toFixed(2)}</td>
                <td><button type="button" onClick={() => eliminarFila(index)} style={{ cursor: 'pointer' }}>🗑️</button></td>
              </tr>
            ))}
          </tbody>
        </table>

        <button type="button" onClick={agregarFila} style={botonSecundario}>➕ Agregar fila</button>

        <p style={{ textAlign: 'right', marginTop: '1rem', fontWeight: 'bold' }}>Total: ${total.toFixed(2)}</p>

        <button type="submit" style={botonPrincipal}>Guardar venta</button>
      </form>

      {mensaje && (
        <p style={{
          marginTop: '1rem',
          textAlign: 'center',
          color: mensaje.includes('❌') ? 'red' : 'green'
        }}>
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
  borderRadius: '6px'
};

const inputTabla = {
  width: '100%',
  padding: '0.3rem',
  borderRadius: '4px',
  border: '1px solid #ccc'
};

const botonPrincipal = {
  width: '100%',
  padding: '0.8rem',
  backgroundColor: '#2e7d32',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '1rem',
  marginTop: '1.5rem'
};

const botonSecundario = {
  marginTop: '1rem',
  padding: '0.5rem 1rem',
  backgroundColor: '#1976d2',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer'
};

const botonSecretaria = {
  padding: '0.5rem 1rem',
  backgroundColor: '#2e7d32',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer'
};

const botonCerrarSesion = {
  padding: '0.5rem 1rem',
  backgroundColor: '#b71c1c',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer'
};
