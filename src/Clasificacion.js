import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

function Clasificacion() {
  const [clientes, setClientes] = useState([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState('');
  const [fecha, setFecha] = useState('');
  const [clasificaciones, setClasificaciones] = useState({});
  const [kilosRecibidos, setKilosRecibidos] = useState(null);
  const [mensaje, setMensaje] = useState('');

  const calibres = [
    'EXTRA',
    '1RA',
    '2DA',
    '3RA',
    '4TA',
    'CLASE B',
    'PROCESO',
    'DESECHO',
    '4TA ROÑA'
  ];

  useEffect(() => {
    const cargarClientes = async () => {
      const { data, error } = await supabase
        .from('recepciones')
        .select('cliente_nombre')
        .neq('cliente_nombre', '')
        .order('id', { ascending: false })
        .limit(20);

      if (!error && data) {
        const unicos = [...new Set(data.map(c => c.cliente_nombre.trim()))];
        setClientes(unicos);
      }
    };

    cargarClientes();
  }, []);

  const handleClienteChange = async (e) => {
    const selectedCliente = e.target.value;
    setClienteSeleccionado(selectedCliente);

    if (selectedCliente) {
      const { data, error } = await supabase
        .from('recepciones')
        .select('toneladas, kilos_extra')
        .eq('cliente_nombre', selectedCliente);

      if (!error && data) {
        const totalKilos = data.reduce((sum, r) => {
          return sum + (r.toneladas || 0) * 1000 + (r.kilos_extra || 0);
        }, 0);
        setKilosRecibidos(totalKilos);
      } else {
        setKilosRecibidos(null);
      }
    }
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

    if (!clienteSeleccionado || !fecha) {
      setMensaje('❌ Debes seleccionar cliente y fecha.');
      return;
    }

    const registros = calibres.map(calibre => {
      const datos = clasificaciones[calibre] || {};
      return {
        cliente_nombre: clienteSeleccionado,
        fecha: fecha,
        calibre: calibre,
        cajas: parseInt(datos.cajas || 0),
        kg: parseFloat(datos.kg || 0)
      };
    }).filter(r => r.cajas > 0 || r.kg > 0);

    if (registros.length === 0) {
      setMensaje('❌ Debes llenar al menos una fila con cajas o kg.');
      return;
    }

    const { error } = await supabase.from('clasificacion').insert(registros);

    if (error) {
      setMensaje('❌ Error al guardar: ' + error.message);
    } else {
      setMensaje('✅ Clasificación guardada.');
      setClasificaciones({});
      setClienteSeleccionado('');
      setFecha('');
      setKilosRecibidos(null);
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
      alignItems: 'flex-start'
    }}>
      <div style={{
        backgroundColor: '#fff',
        padding: '2rem',
        borderRadius: '12px',
        boxShadow: '0 0 10px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '800px'
      }}>
        <h2 style={{ textAlign: 'center', color: '#2e7d32' }}>Clasificación de Aguacate</h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label>Cliente:</label><br />
            <select
              value={clienteSeleccionado}
              onChange={handleClienteChange}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid #ccc'
              }}
              required
            >
              <option value="">Selecciona cliente</option>
              {clientes.map((nombre, idx) => (
                <option key={idx} value={nombre}>{nombre}</option>
              ))}
            </select>

            {clienteSeleccionado && kilosRecibidos !== null && (
              <p style={{ marginTop: '0.5rem', fontWeight: 'bold', color: '#444' }}>
                Total de kilos recibidos: {kilosRecibidos.toLocaleString()} KG
              </p>
            )}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label>Fecha:</label><br />
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid #ccc'
              }}
            />
          </div>

          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            marginBottom: '1rem',
            fontSize: '1rem'
          }}>
            <thead style={{ backgroundColor: '#2e7d32', color: 'white' }}>
              <tr>
                <th style={{ padding: '0.6rem', border: '1px solid #ccc', textAlign: 'center' }}>#</th>
                <th style={{ padding: '0.6rem', border: '1px solid #ccc', textAlign: 'left' }}>Calibre</th>
                <th style={{ padding: '0.6rem', border: '1px solid #ccc', textAlign: 'center' }}>Cajas</th>
                <th style={{ padding: '0.6rem', border: '1px solid #ccc', textAlign: 'center' }}>KG</th>
              </tr>
            </thead>
            <tbody>
              {calibres.map((calibre, index) => (
                <tr key={calibre} style={{ backgroundColor: index % 2 === 0 ? '#f9f9f9' : '#fff' }}>
                  <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'center' }}>{index + 1}</td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{calibre}</td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'center' }}>
                    <input
                      type="number"
                      min="0"
                      value={clasificaciones[calibre]?.cajas || ''}
                      onChange={(e) => handleInputChange(calibre, 'cajas', e.target.value)}
                      style={{
                        width: '100%',
                        maxWidth: '100px',
                        padding: '0.3rem',
                        textAlign: 'center'
                      }}
                    />
                  </td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'center' }}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={clasificaciones[calibre]?.kg || ''}
                      onChange={(e) => handleInputChange(calibre, 'kg', e.target.value)}
                      style={{
                        width: '100%',
                        maxWidth: '100px',
                        padding: '0.3rem',
                        textAlign: 'center'
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#e0e0e0', fontWeight: 'bold' }}>
                <td style={{ border: '1px solid #ccc' }}></td>
                <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>TOTAL</td>
                <td style={{ border: '1px solid #ccc' }}></td>
                <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'center' }}>
                  {calibres.reduce((total, calibre) => {
                    const kg = parseFloat(clasificaciones[calibre]?.kg || 0);
                    return total + kg;
                  }, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KG
                </td>
              </tr>
            </tfoot>
          </table>

          <button type="submit" style={{
            width: '100%',
            padding: '0.7rem',
            backgroundColor: '#2e7d32',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '1rem'
          }}>
            Guardar clasificación
          </button>

          {mensaje && (
            <p style={{ marginTop: '1rem', textAlign: 'center', color: mensaje.includes('❌') ? 'red' : 'green' }}>
              {mensaje}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

export default Clasificacion;
