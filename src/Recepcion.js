// src/Recepcion.js
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Select from 'react-select';
import Login from './Login';
import { useNavigate } from 'react-router-dom';

function App({ modoSecretaria = false, onEntregaCreada }) {
  const navigate = useNavigate();

  const [usuario, setUsuario] = useState(null);
  const [cliente, setCliente] = useState('');
  const [clienteNuevo, setClienteNuevo] = useState('');
  const [telefonoNuevo, setTelefonoNuevo] = useState('');
  const [clientesRegistrados, setClientesRegistrados] = useState([]);
  const [clientesTelefonos, setClientesTelefonos] = useState({});
  const [lineas, setLineas] = useState([{ tipo: '', kilos: '', cajas: '' }]);
  const [mensaje, setMensaje] = useState('');
  const [nombreEditado, setNombreEditado] = useState('');

  const tiposDisponibles = [
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

  // Cargar usuario (solo para modo normal)
  useEffect(() => {
    if (modoSecretaria) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUsuario(user);
    });
  }, [modoSecretaria]);

  // Función para cargar clientes (persistentes)
  // 🔸 Preferimos la tabla "clientes" (lista estable en el tiempo).
  // 🔸 Si no existe aún, hacemos fallback a "recepciones" para no romper la app.
  const cargarClientes = async () => {
    // 1) Intentar desde tabla clientes
    try {
      const { data: dataClientes, error: errClientes } = await supabase
        .from('clientes')
        .select('nombre, telefono')
        .order('nombre', { ascending: true });

      if (!errClientes && dataClientes) {
        const nombres = dataClientes
          .map((c) => (c.nombre || '').trim())
          .filter(Boolean);

        const telMap = {};
        (dataClientes || []).forEach((c) => {
          const n = (c.nombre || '').trim();
          if (n) telMap[n] = c.telefono || '';
        });

        setClientesRegistrados(nombres);
        setClientesTelefonos(telMap);
        return;
      }
    } catch (e) {
      // si la tabla no existe o falla, seguimos al fallback
    }

    // 2) Fallback: clientes únicos desde recepciones (puede fallar si hay RLS por fecha)
    const { data, error } = await supabase
      .from('recepciones')
      .select('cliente_nombre')
      .neq('cliente_nombre', '')
      .order('cliente_nombre', { ascending: true });

    if (!error && data) {
      const unicos = [
        ...new Set(
          data
            .map((item) => (item.cliente_nombre || '').trim())
            .filter(Boolean)
        ),
      ];
      setClientesRegistrados(unicos);
      setClientesTelefonos({});
    }
  };

  // Cargar clientes al inicio
  useEffect(() => {
    cargarClientes();
  }, []);

  // Login solo en modo normal
  if (!usuario && !modoSecretaria) {
    return <Login onLogin={(user) => setUsuario(user)} />;
  }

  // Manejo de líneas de tipos de aguacate
  const handleLineaChange = (index, campo, valor) => {
    const nuevasLineas = [...lineas];
    nuevasLineas[index][campo] = valor;
    setLineas(nuevasLineas);
  };

  const agregarLinea = () => {
    setLineas([...lineas, { tipo: '', kilos: '', cajas: '' }]);
  };

  const eliminarLinea = (index) => {
    const nuevasLineas = [...lineas];
    nuevasLineas.splice(index, 1);
    setLineas(nuevasLineas);
  };

  // Eliminar cliente seleccionado
  const handleEliminarCliente = async () => {
    if (!cliente || cliente === '__nuevo__') {
      setMensaje('❌ Primero selecciona un cliente existente para eliminar.');
      return;
    }

    const confirmar = window.confirm(
      `¿Seguro que deseas eliminar al cliente "${cliente}" y todas sus recepciones registradas?`
    );
    if (!confirmar) return;

    const { error } = await supabase
      .from('recepciones')
      .delete()
      .eq('cliente_nombre', cliente);

    if (error) {
      setMensaje('❌ Error al eliminar cliente: ' + error.message);
      return;
    }

    // También eliminar de la tabla clientes (si existe)
    try {
      await supabase.from('clientes').delete().eq('nombre', cliente);
    } catch (e) {
      // ignorar si no existe
    }

    setMensaje('✅ Cliente eliminado correctamente.');
    setCliente('');
    setClienteNuevo('');
    setTelefonoNuevo('');
    setNombreEditado('');
    await cargarClientes();
  };

  // Renombrar cliente
  const handleRenombrarCliente = async () => {
    if (!cliente || cliente === '__nuevo__') {
      setMensaje('❌ Primero selecciona un cliente existente para renombrar.');
      return;
    }

    const nuevoNombre = nombreEditado.trim();
    if (!nuevoNombre) {
      setMensaje('❌ El nuevo nombre no puede estar vacío.');
      return;
    }

    if (nuevoNombre.toLowerCase() === cliente.toLowerCase()) {
      setMensaje('⚠️ El nombre nuevo es igual al actual.');
      return;
    }

    const yaExiste = clientesRegistrados.some(
      (n) => n.toLowerCase() === nuevoNombre.toLowerCase()
    );
    if (yaExiste) {
      setMensaje('❌ Ya existe otro cliente con ese nombre.');
      return;
    }

    const confirmar = window.confirm(
      `¿Seguro que deseas cambiar el nombre de "${cliente}" a "${nuevoNombre}"?`
    );
    if (!confirmar) return;

    const { error } = await supabase
      .from('recepciones')
      .update({ cliente_nombre: nuevoNombre })
      .eq('cliente_nombre', cliente);

    if (error) {
      setMensaje('❌ Error al renombrar cliente: ' + error.message);
      return;
    }

    // También renombrar en tabla clientes (si existe)
    try {
      await supabase
        .from('clientes')
        .update({ nombre: nuevoNombre })
        .eq('nombre', cliente);
    } catch (e) {
      // ignorar si no existe
    }

    setMensaje('✅ Nombre de cliente actualizado correctamente.');
    setCliente(nuevoNombre);
    await cargarClientes();
  };

  // Fecha local a mediodía con offset
  function localISOWithOffsetAtNoon(d = new Date()) {
    const yyyy = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');

    const offsetMin = -d.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const oh = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
    const om = String(Math.abs(offsetMin) % 60).padStart(2, '0');

    return `${yyyy}-${MM}-${dd}T12:00:00${sign}${oh}:${om}`;
  }

  // Guardar recepción
  const handleSubmit = async (e) => {
    e.preventDefault();

    const nombreClienteFinal =
      cliente === '__nuevo__' ? clienteNuevo.trim() : cliente;

    if (!nombreClienteFinal) {
      setMensaje('❌ Debes escribir o seleccionar un nombre de cliente.');
      return;
    }

    if (cliente === '__nuevo__') {
      const yaExiste = clientesRegistrados.some(
        (nombre) => nombre.toLowerCase() === nombreClienteFinal.toLowerCase()
      );
      if (yaExiste) {
        setMensaje(
          '❌ Este cliente ya está registrado. Selecciónalo desde la lista.'
        );
        return;
      }

      if (telefonoNuevo && !/^\d{10}$/.test(telefonoNuevo)) {
        setMensaje('❌ El número de teléfono debe tener exactamente 10 dígitos.');
        return;
      }

      // Guardar también en tabla "clientes" (si existe) para que aparezca siempre en el selector
      try {
        const payload = {
          nombre: nombreClienteFinal,
          telefono: telefonoNuevo ? telefonoNuevo : null,
        };
        const { error: errCli } = await supabase.from('clientes').insert([payload]);
        // Si ya existía por race condition, no detenemos el flujo
        if (errCli && !String(errCli.message || '').toLowerCase().includes('duplicate')) {
          console.warn('No se pudo guardar en clientes:', errCli.message);
        }
      } catch (e) {
        // si no existe la tabla, ignoramos
      }
    }

    const entregaId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const fechaHoraLocal = localISOWithOffsetAtNoon();

    const registros = lineas
      .filter((linea) => linea.tipo && linea.kilos)
      .map((linea) => ({
        entrega_id: entregaId,
        cliente_nombre: nombreClienteFinal,
        tipo: linea.tipo,
        kilos: parseFloat(linea.kilos),
        cajas: linea.cajas ? parseFloat(linea.cajas) : null,
        telefono_cliente: cliente === '__nuevo__' ? telefonoNuevo : null,
        fecha_hora: fechaHoraLocal,
      }));

    if (registros.length === 0) {
      setMensaje('❌ Debes llenar al menos un tipo con kilos.');
      return;
    }

    const { error } = await supabase.from('recepciones').insert(registros);

    if (error) {
      setMensaje('❌ Error al guardar: ' + error.message);
    } else {
      setMensaje('✅ Registros guardados correctamente.');

      const totalKilosInsertados = registros.reduce(
        (sum, r) => sum + (r.kilos || 0),
        0
      );
      const totalCajasInsertadas = registros.reduce(
        (sum, r) => sum + (r.cajas || 0),
        0
      );

      if (onEntregaCreada) {
        onEntregaCreada({
          entregaId,
          clienteNombre: nombreClienteFinal,
          fecha: fechaHoraLocal,
          kilos: totalKilosInsertados,
          cajas: totalCajasInsertadas,
        });
      }

      setCliente('');
      setClienteNuevo('');
      setTelefonoNuevo('');
      setNombreEditado('');
      setLineas([{ tipo: '', kilos: '', cajas: '' }]);
      await cargarClientes();
    }
  };

  const totalKilos = lineas.reduce(
    (sum, linea) => sum + parseFloat(linea.kilos || 0),
    0
  );
  const totalToneladas = (totalKilos / 1000).toFixed(2);

  // CARD PRINCIPAL
  const card = (
    <div
      style={{
        backgroundColor: '#fff',
        padding: '2rem',
        borderRadius: '10px',
        boxShadow: '0 0 10px rgba(0,0,0,0.1)',
        maxWidth: '600px',
        width: '100%',
        margin: '0 auto', // 👈 esto centra el card en su contenedor
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <img
          src="/aguacate.jpg"
          alt="Logo Aguacates Ramírez"
          style={{ width: '80px', marginBottom: '1rem' }}
        />
        <h2 style={{ color: '#2e7d32' }}>Recepción de Aguacate</h2>
      </div>

      {/* botones superiores (solo modo normal) */}
      {!modoSecretaria && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            marginBottom: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={() => navigate('/ventas')}
            style={btnVolver}
          >
            ← Registrar compra
          </button>

          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              setUsuario(null);
              navigate('/login');
            }}
            style={btnCerrar}
          >
            🔒 Cerrar sesión
          </button>
        </div>
      )}

      {/* FORMULARIO */}
      <form onSubmit={handleSubmit}>
        <label>Nombre del cliente:</label>
        <br />
        <Select
          options={[
            ...clientesRegistrados.map((nombre) => ({
              label: nombre,
              value: nombre,
            })),
            { label: '➕ Nuevo cliente', value: '__nuevo__' },
          ]}
          value={
            cliente
              ? {
                  label: cliente === '__nuevo__' ? '➕ Nuevo cliente' : cliente,
                  value: cliente,
                }
              : null
          }
          onChange={(opt) => {
            const value = opt ? opt.value : '';
            setCliente(value);
            if (value && value !== '__nuevo__') {
              setNombreEditado(value);
            } else {
              setNombreEditado('');
            }
          }}
          placeholder="Selecciona un cliente"
          isSearchable
        />

        {/* botones para eliminar / renombrar cliente */}
        <div
          style={{
            marginTop: '0.5rem',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={handleEliminarCliente}
            disabled={!cliente || cliente === '__nuevo__'}
            style={{
              padding: '0.35rem 0.7rem',
              borderRadius: 6,
              border: 'none',
              fontSize: '0.8rem',
              cursor:
                !cliente || cliente === '__nuevo__'
                  ? 'not-allowed'
                  : 'pointer',
              backgroundColor:
                !cliente || cliente === '__nuevo__' ? '#ccc' : '#e53935',
              color: '#fff',
            }}
          >
            🗑 Eliminar cliente
          </button>
          <span style={{ fontSize: '0.8rem', color: '#555' }}>
            Borra al cliente y sus recepciones.
          </span>
        </div>

        {cliente && cliente !== '__nuevo__' && (
          <div
            style={{
              marginTop: '0.5rem',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <input
              type="text"
              value={nombreEditado}
              onChange={(e) => setNombreEditado(e.target.value)}
              style={{ ...inputEstilo, width: '60%' }}
              placeholder="Nuevo nombre del cliente"
            />
            <button
              type="button"
              onClick={handleRenombrarCliente}
              style={{
                padding: '0.35rem 0.7rem',
                borderRadius: 6,
                border: 'none',
                fontSize: '0.8rem',
                cursor: 'pointer',
                backgroundColor: '#1976d2',
                color: '#fff',
              }}
            >
              ✏️ Renombrar cliente
            </button>
          </div>
        )}

        {/* campos para nuevo cliente */}
        {cliente === '__nuevo__' && (
          <>
            <input
              type="text"
              placeholder="Escribe nuevo cliente"
              value={clienteNuevo}
              onChange={(e) => setClienteNuevo(e.target.value)}
              required
              style={inputEstilo}
            />
            <input
              type="tel"
              placeholder="Número de teléfono (10 dígitos, opcional)"
              value={telefonoNuevo}
              onChange={(e) => {
                const valor = e.target.value;
                if (/^\d{0,10}$/.test(valor)) {
                  setTelefonoNuevo(valor);
                }
              }}
              style={inputEstilo}
            />
          </>
        )}

        {/* líneas de tipos */}
        {lineas.map((linea, index) => {
          const kilos = parseFloat(linea.kilos || 0);
          const toneladas = kilos / 1000;

          return (
            <div
              key={index}
              style={{
                marginTop: '1.5rem',
                padding: '1rem',
                backgroundColor: '#f9f9f9',
                borderRadius: '8px',
                border: '1px solid #ddd',
              }}
            >
              <h4>Tipo #{index + 1}</h4>

              <label>Tipo de aguacate:</label>
              <br />
              <select
                value={linea.tipo}
                onChange={(e) =>
                  handleLineaChange(index, 'tipo', e.target.value)
                }
                required
                style={{ ...inputEstilo, marginBottom: '1rem' }}
              >
                <option value="">Selecciona tipo</option>
                {tiposDisponibles.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {tipo}
                  </option>
                ))}
              </select>

              <div
                style={{
                  display: 'flex',
                  gap: '1rem',
                  alignItems: 'flex-end',
                  marginBottom: '0.6rem',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: '120px' }}>
                  <label>Cajas:</label>
                  <br />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={linea.cajas}
                    onChange={(e) =>
                      handleLineaChange(index, 'cajas', e.target.value)
                    }
                    style={{
                      width: '100%',
                      padding: '0.3rem 0.4rem',
                      borderRadius: '6px',
                      border: '1px solid #ccc',
                      fontSize: '0.9rem',
                      height: '34px',
                    }}
                  />
                </div>

                <div style={{ flex: 1, minWidth: '120px' }}>
                  <label>Kilos:</label>
                  <br />
                  <input
                    type="number"
                    step="0.01"
                    value={linea.kilos}
                    onChange={(e) =>
                      handleLineaChange(index, 'kilos', e.target.value)
                    }
                    required
                    style={{
                      width: '100%',
                      padding: '0.3rem 0.4rem',
                      borderRadius: '6px',
                      border: '1px solid #ccc',
                      fontSize: '0.9rem',
                      height: '34px',
                    }}
                  />
                </div>
              </div>

              <p style={{ fontSize: '0.9rem', color: '#555' }}>
                ≈ {toneladas.toFixed(2)} toneladas
              </p>

              {lineas.length > 1 && (
                <div style={{ marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => eliminarLinea(index)}
                    style={{
                      backgroundColor: '#ccc',
                      border: 'none',
                      padding: '0.5rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'block',
                    }}
                  >
                    Eliminar esta línea
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <p
          style={{
            marginTop: '1rem',
            fontWeight: 'bold',
            textAlign: 'right',
          }}
        >
          Total: {totalKilos.toLocaleString()} kg ≈ {totalToneladas} toneladas
        </p>

        <button type="button" onClick={agregarLinea} style={botonSecundario}>
          ➕ Agregar otro tipo
        </button>

        <button type="submit" style={botonPrincipal}>
          Guardar recepción
        </button>
      </form>

      {mensaje && (
        <p
          style={{
            marginTop: '1rem',
            textAlign: 'center',
            color: mensaje.includes('❌') ? 'red' : 'green',
          }}
        >
          {mensaje}
        </p>
      )}
    </div>
  );

  // En modo secretaria lo centramos dentro de la sección
  if (modoSecretaria) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {card}
      </div>
    );
  }

  // En modo normal, sigue con su layout de pantalla completa
  return (
    <div
      style={{
        backgroundColor: '#f5f5f5',
        minHeight: '100vh',
        paddingTop: '2rem',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      {card}
    </div>
  );
}

const inputEstilo = {
  width: '100%',
  padding: '0.5rem',
  marginTop: '0.5rem',
  borderRadius: '6px',
  border: '1px solid #ccc',
};

const botonPrincipal = {
  marginTop: '1rem',
  width: '100%',
  padding: '0.7rem',
  backgroundColor: '#2e7d32',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '1rem',
};

const botonSecundario = {
  marginTop: '1rem',
  width: '100%',
  padding: '0.7rem',
  backgroundColor: '#1976d2',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '1rem',
};

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
  background: '#b71c1c',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
};

export default App;
