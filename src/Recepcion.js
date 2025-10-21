import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Select from 'react-select';
import Login from './Login';
import { useNavigate } from 'react-router-dom';

function App() {
  const navigate = useNavigate();

  const [usuario, setUsuario] = useState(null);
  const [cliente, setCliente] = useState('');
  const [clienteNuevo, setClienteNuevo] = useState('');
  const [telefonoNuevo, setTelefonoNuevo] = useState('');
  const [clientesRegistrados, setClientesRegistrados] = useState([]);
  const [lineas, setLineas] = useState([{ tipo: '', kilos: '' }]);
  const [mensaje, setMensaje] = useState('');

  const tiposDisponibles = [
   'Loca',                 //  NUEVO
  'Loca Tamaño',
  'Loca Proceso',
  'Negro',                //  NUEVO
  'Negro Tamaño',
  'Negro Proceso',
  'Aventajado',           //  NUEVO
  'Aventajado Tamaño',
  'Aventajado Proceso',
  'Desecho'
  ];

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUsuario(user);
    });
  }, []);

  useEffect(() => {
    const cargarClientes = async () => {
      const { data, error } = await supabase
        .from('recepciones')
        .select('cliente_nombre')
        .neq('cliente_nombre', '')
        .order('cliente_nombre', { ascending: true });

      if (!error && data) {
        const unicos = [...new Set(data.map(item => (item.cliente_nombre || '').trim()).filter(Boolean))];
        setClientesRegistrados(unicos);
      }
    };
    cargarClientes();
  }, []);

  if (!usuario) {
    return <Login onLogin={(user) => setUsuario(user)} />;
  }

  const handleLineaChange = (index, campo, valor) => {
    const nuevasLineas = [...lineas];
    nuevasLineas[index][campo] = valor;
    setLineas(nuevasLineas);
  };

  const agregarLinea = () => {
    setLineas([...lineas, { tipo: '', kilos: '' }]);
  };

  const eliminarLinea = (index) => {
    const nuevasLineas = [...lineas];
    nuevasLineas.splice(index, 1);
    setLineas(nuevasLineas);
  };

  // >>> NUEVO: fecha local con offset (12:00) para evitar saltos de día
  function localISOWithOffsetAtNoon(d = new Date()) {
    const yyyy = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');

    // offset en minutos respecto a UTC (negativo en América)
    const offsetMin = -d.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const oh = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
    const om = String(Math.abs(offsetMin) % 60).padStart(2, '0');

    // 12:00 local para evitar cruces de día
    return `${yyyy}-${MM}-${dd}T12:00:00${sign}${oh}:${om}`;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();

    const nombreClienteFinal = cliente === '__nuevo__' ? clienteNuevo.trim() : cliente;

    if (!nombreClienteFinal) {
      setMensaje('❌ Debes escribir o seleccionar un nombre de cliente.');
      return;
    }

    if (cliente === '__nuevo__') {
      const yaExiste = clientesRegistrados.some(
        (nombre) => nombre.toLowerCase() === nombreClienteFinal.toLowerCase()
      );
      if (yaExiste) {
        setMensaje('❌ Este cliente ya está registrado. Selecciónalo desde la lista.');
        return;
      }

      if (telefonoNuevo && !/^\d{10}$/.test(telefonoNuevo)) {
        setMensaje('❌ El número de teléfono debe tener exactamente 10 dígitos.');
        return;
      }
    }

    // Generar entrega_id (mismo para todas las filas de esta recepción)
    const entregaId =
      (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    // >>> NUEVO: calcular una sola vez la "fecha_hora" local con offset (a mediodía)
    const fechaHoraLocal = localISOWithOffsetAtNoon();

    const registros = lineas
      .filter((linea) => linea.tipo && linea.kilos)
      .map((linea) => ({
        entrega_id: entregaId,
        cliente_nombre: nombreClienteFinal,
        tipo: linea.tipo,
        kilos: parseFloat(linea.kilos),
        telefono_cliente: cliente === '__nuevo__' ? telefonoNuevo : null,
        // >>> NUEVO: enviar fecha_hora explícita
        fecha_hora: fechaHoraLocal
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
      setCliente('');
      setClienteNuevo('');
      setTelefonoNuevo('');
      setLineas([{ tipo: '', kilos: '' }]);
    }
  };

  const totalKilos = lineas.reduce((sum, linea) => sum + parseFloat(linea.kilos || 0), 0);
  const totalToneladas = (totalKilos / 1000).toFixed(2);

  return (
    <div style={{
      backgroundColor: '#f5f5f5',
      minHeight: '100vh',
      paddingTop: '2rem',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      fontFamily: 'Arial, sans-serif',
    }}>
      <div style={{
        backgroundColor: '#fff',
        padding: '2rem',
        borderRadius: '10px',
        boxShadow: '0 0 10px rgba(0,0,0,0.1)',
        maxWidth: '600px',
        width: '100%'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <img
            src="/aguacate.jpg"
            alt="Logo Aguacates Ramírez"
            style={{ width: '80px', marginBottom: '1rem' }}
          />
          <h2 style={{ color: '#2e7d32' }}>Recepción de Aguacate</h2>
        </div>

        {/* BOTONES SUPERIORES */}
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginBottom:'1rem', flexWrap:'wrap' }}>
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

        <form onSubmit={handleSubmit}>
          <label>Nombre del cliente:</label><br />
          <Select
            options={[
              ...clientesRegistrados.map(nombre => ({ label: nombre, value: nombre })),
              { label: '➕ Nuevo cliente', value: '__nuevo__' }
            ]}
            value={
              cliente
                ? { label: cliente === '__nuevo__' ? '➕ Nuevo cliente' : cliente, value: cliente }
                : null
            }
            onChange={(opt) => setCliente(opt ? opt.value : '')}
            placeholder="Selecciona un cliente"
            isSearchable
          />

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

          {lineas.map((linea, index) => {
            const kilos = parseFloat(linea.kilos || 0);
            const toneladas = kilos / 1000;

            return (
              <div key={index} style={{
                marginTop: '1.5rem',
                padding: '1rem',
                backgroundColor: '#f9f9f9',
                borderRadius: '8px',
                border: '1px solid #ddd'
              }}>
                <h4>Tipo #{index + 1}</h4>

                <label>Tipo de aguacate:</label><br />
                <select
                  value={linea.tipo}
                  onChange={(e) => handleLineaChange(index, 'tipo', e.target.value)}
                  required
                  style={{ ...inputEstilo, marginBottom: '1rem' }}
                >
                  <option value="">Selecciona tipo</option>
                  {tiposDisponibles.map((tipo) => (
                    <option key={tipo} value={tipo}>{tipo}</option>
                  ))}
                </select>

                <label>Kilos:</label><br />
                <input
                  type="number"
                  step="0.01"
                  value={linea.kilos}
                  onChange={(e) => handleLineaChange(index, 'kilos', e.target.value)}
                  required
                  style={{
                    width: '50%',
                    padding: '0.3rem 0.4rem',
                    marginBottom: '0.4rem',
                    borderRadius: '6px',
                    border: '1px solid #ccc',
                    fontSize: '0.9rem',
                    height: '34px'
                  }}
                />

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
                        display: 'block'
                      }}
                    >
                      Eliminar esta línea
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          <p style={{ marginTop: '1rem', fontWeight: 'bold', textAlign: 'right' }}>
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
          <p style={{
            marginTop: '1rem',
            textAlign: 'center',
            color: mensaje.includes('❌') ? 'red' : 'green'
          }}>
            {mensaje}
          </p>
        )}
      </div>
    </div>
  );
}

const inputEstilo = {
  width: '100%',
  padding: '0.5rem',
  marginTop: '0.5rem',
  borderRadius: '6px',
  border: '1px solid #ccc'
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
  fontSize: '1rem'
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
  fontSize: '1rem'
};

const btnVolver = {
  padding: '0.45rem 0.9rem',
  background: '#2e7d32',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer'
};

const btnCerrar = {
  padding: '0.45rem 0.9rem',
  background: '#b71c1c',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer'
};

export default App;
