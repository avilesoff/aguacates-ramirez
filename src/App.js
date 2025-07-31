import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Select from 'react-select';
import Login from './Login'; // IMPORTANTE

function App() {
  const [usuario, setUsuario] = useState(null);
  const [cliente, setCliente] = useState('');
  const [clienteNuevo, setClienteNuevo] = useState('');
  const [telefonoNuevo, setTelefonoNuevo] = useState('');
  const [clientesRegistrados, setClientesRegistrados] = useState([]);
  const [lineas, setLineas] = useState([{ tipo: '', toneladas: '' }]);
  const [mensaje, setMensaje] = useState('');

  const tiposDisponibles = ['Flor Loca', 'Negro', 'Desecho'];

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
        const unicos = [...new Set(data.map(item => item.cliente_nombre.trim()))];
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
    setLineas([...lineas, { tipo: '', toneladas: '' }]);
  };

  const eliminarLinea = (index) => {
    const nuevasLineas = [...lineas];
    nuevasLineas.splice(index, 1);
    setLineas(nuevasLineas);
  };

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

    const registros = lineas
      .filter((linea) => linea.tipo && linea.toneladas)
      .map((linea) => ({
        cliente_nombre: nombreClienteFinal,
        tipo: linea.tipo,
        toneladas: parseFloat(linea.toneladas),
        telefono_cliente: cliente === '__nuevo__' ? telefonoNuevo : null,
      }));

    if (registros.length === 0) {
      setMensaje('❌ Debes llenar al menos un tipo con toneladas.');
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
      setLineas([{ tipo: '', toneladas: '' }]);
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
        maxWidth: '600px',
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

        <button
          onClick={async () => {
            await supabase.auth.signOut();
            setUsuario(null);
          }}
          style={{
            backgroundColor: '#ccc',
            border: 'none',
            padding: '0.5rem',
            borderRadius: '6px',
            marginBottom: '1rem',
            cursor: 'pointer'
          }}
        >
          Cerrar sesión
        </button>

        <h2 style={{ textAlign: 'center' }}>Recepción de Aguacate</h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginTop: '1rem' }}>
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
              onChange={(selectedOption) => {
                setCliente(selectedOption.value);
              }}
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
          </div>

          {lineas.map((linea, index) => (
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

              <label>Toneladas:</label><br />
              <input
                type="number"
                step="0.01"
                value={linea.toneladas}
                onChange={(e) => handleLineaChange(index, 'toneladas', e.target.value)}
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
          ))}

          <button type="button" onClick={agregarLinea} style={{
            marginTop: '1rem',
            width: '100%',
            padding: '0.7rem',
            backgroundColor: '#1976d2',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '1rem'
          }}>
            ➕ Agregar otro tipo
          </button>

          <button type="submit" style={{
            marginTop: '1rem',
            width: '100%',
            padding: '0.7rem',
            backgroundColor: '#2e7d32',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '1rem'
          }}>
            Guardar recepción
          </button>
        </form>

        {mensaje && (
          <p style={{ marginTop: '1rem', textAlign: 'center', color: mensaje.includes('❌') ? 'red' : 'green' }}>
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

export default App;
