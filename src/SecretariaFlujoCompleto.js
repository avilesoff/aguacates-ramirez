// src/SecretariaFlujoCompleto.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Recepcion from './Recepcion';
import ClasificacionEntrega from './ClasificacionEntrega';
import VentaForm from './VentaForm';

export default function SecretariaFlujoCompleto() {
  const navigate = useNavigate();

  const [entregaId, setEntregaId] = useState(null);
  const [entregaResumen, setEntregaResumen] = useState(null);

  const [clasificacionId, setClasificacionId] = useState(null);
  const [clasificacionResumen, setClasificacionResumen] = useState(null);

  const reiniciarFlujo = () => {
    setEntregaId(null);
    setEntregaResumen(null);
    setClasificacionId(null);
    setClasificacionResumen(null);
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '1.5rem 1rem 2rem',
        backgroundColor: '#f7f7f7',
        display: 'block',
      }}
    >
      {/* CONTENEDOR EXTERNO QUE CENTRA TODO */}
      <div style={layoutOuter}>
        {/* CONTENEDOR INTERNO (HEADER + SECCIONES) */}
        <div style={layoutInner}>
          {/* ENCABEZADO */}
          <header
            style={{
              textAlign: 'center',
              marginBottom: '1.5rem',
            }}
          >
            <img
              src="/aguacate.jpg"
              alt="Aguacates Ramírez"
              style={{ height: 80, marginBottom: 8 }}
            />
            <h1 style={{ margin: 0, color: '#2e7d32' }}>Aguacates Ramírez</h1>
            <p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>
              Registro SAGARPA: EMP0416058459/2021
              <br />
              Prolongación Linda Vista Carr. San Juan Nuevo - Tancítaro
            </p>

            <h2 style={{ marginTop: '1rem', color: '#2e7d32' }}>
              Flujo de trabajo – Secretaría
            </h2>

            <div style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                style={btnNavSecretaria}
                onClick={() => navigate('/secretaria')}
              >
                📁 Secretaría (notas / PDFs)
              </button>
              <button
                type="button"
                style={btnNavCerrar}
                onClick={() => navigate('/logout')}
              >
                🔒 Cerrar sesión
              </button>
            </div>
          </header>

          {/* 1) RECEPCIÓN */}
          <section style={cardSeccion}>
            <div style={seccionHeader}>
              <h3 style={seccionTitulo}>1. Recepción</h3>
              {entregaResumen && (
                <button
                  type="button"
                  style={btnReiniciar}
                  onClick={reiniciarFlujo}
                >
                  Empezar nueva entrega
                </button>
              )}
            </div>

            <p style={seccionDescripcion}>
              Registra la recepción de aguacate (cliente, tipos, kilos y cajas).
              Al guardar se habilitará la clasificación.
            </p>

            {/* Bloqueo de recepción cuando ya hay una entrega activa */}
            <div style={{ position: 'relative' }}>
              {entregaResumen && (
                <div style={overlayBloqueo}>
                  <div>
                    <div style={overlayTitle}>Recepción bloqueada</div>
                    <div>
                      Mientras trabajas en la clasificación o en la compra.
                    </div>
                    <div style={{ marginTop: 6 }}>
                      Usa <strong>“Empezar nueva entrega”</strong> si necesitas
                      corregirla.
                    </div>
                  </div>
                </div>
              )}

              <Recepcion
                modoSecretaria
                onEntregaCreada={(info) => {
                  // info: { entregaId, clienteNombre, fecha, kilos, cajas }
                  setEntregaId(info.entregaId);
                  setEntregaResumen(info);
                  setClasificacionId(null);
                  setClasificacionResumen(null);
                }}
              />
            </div>

            {entregaResumen && (
              <div style={resumenCaja}>
                <strong>Entrega actual:</strong> {entregaResumen.clienteNombre} —{' '}
                {entregaResumen.kilos.toLocaleString()} kg,{' '}
                {entregaResumen.cajas.toLocaleString()} cajas.
              </div>
            )}
          </section>

          {/* 2) CLASIFICACIÓN */}
          <section style={cardSeccion}>
            <div style={seccionHeader}>
              <h3 style={seccionTitulo}>2. Clasificación por tipo</h3>
            </div>

            <p style={seccionDescripcion}>
              Una vez registrada la recepción, clasifica los kilos por calibres.
              Al guardar se habilitará el registro de compra.
            </p>

            {!entregaId && (
              <div style={avisoDeshabilitado}>
                Primero registra una entrega en el bloque de Recepción.
              </div>
            )}

            {entregaId && (
              <>
                {/* Bloqueo de clasificación cuando ya estamos en la parte 3 */}
                <div style={{ position: 'relative' }}>
                  {clasificacionId && (
                    <div style={overlayBloqueo}>
                      <div>
                        <div style={overlayTitle}>Clasificación bloqueada</div>
                        <div>
                          Mientras registras la compra de esta entrega.
                        </div>
                        <div style={{ marginTop: 6 }}>
                          Si necesitas cambiarla, borra la compra o reinicia el
                          flujo.
                        </div>
                      </div>
                    </div>
                  )}

                  <ClasificacionEntrega
                    modoSecretaria
                    entregaIdInicial={entregaId}
                    onClasificacionGuardada={(info) => {
                      // info: { entregaId, clienteNombre, totalKgRecepcion, totalCajasRecepcion, registrosInsertadosIds }
                      setClasificacionId(info.entregaId);
                      setClasificacionResumen(info);
                    }}
                  />
                </div>

                {clasificacionResumen && (
                  <div style={resumenCaja}>
                    <strong>Clasificación actual:</strong>{' '}
                    {clasificacionResumen.totalKgRecepcion.toLocaleString()} kg
                    clasificados,{' '}
                    {clasificacionResumen.totalCajasRecepcion != null
                      ? clasificacionResumen.totalCajasRecepcion.toLocaleString()
                      : 0}{' '}
                    cajas.
                  </div>
                )}
              </>
            )}
          </section>

          {/* 3) REGISTRO DE COMPRA */}
          <section style={cardSeccion}>
            <div style={seccionHeader}>
              <h3 style={seccionTitulo}>3. Registro de compra</h3>
            </div>

            <p style={seccionDescripcion}>
              Después de clasificar la entrega, registra los precios por calibre
              y genera la nota de compra.
            </p>

            {!clasificacionId && (
              <div style={avisoDeshabilitado}>
                Primero guarda la clasificación de la entrega.
              </div>
            )}

            {clasificacionId && (
              <VentaForm
                modoSecretaria
                clasificacionIdInicial={clasificacionId}
                entregaResumen={entregaResumen}
              />
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

/* --- Estilos --- */

// contenedor externo que centra el interno
const layoutOuter = {
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
};

// contenedor interno con ancho máximo
const layoutInner = {
  width: '100%',
  maxWidth: 900,
};

// tarjeta de cada sección
const cardSeccion = {
  background: '#ffffff',
  borderRadius: 8,
  padding: '1rem 1.25rem',
  marginBottom: '1rem',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  width: '100%',
};

const seccionHeader = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 4,
};

const seccionTitulo = {
  margin: 0,
  color: '#2e7d32',
};

const seccionDescripcion = {
  margin: '0 0 0.75rem',
  fontSize: '0.9rem',
  color: '#555',
};

const avisoDeshabilitado = {
  padding: '0.75rem 1rem',
  borderRadius: 6,
  background: '#fff3e0',
  color: '#e65100',
  fontSize: '0.9rem',
};

const resumenCaja = {
  marginTop: '0.75rem',
  padding: '0.5rem 0.75rem',
  borderRadius: 6,
  background: '#e8f5e9',
  fontSize: '0.9rem',
};

const btnNavSecretaria = {
  padding: '0.35rem 0.8rem',
  marginRight: 8,
  borderRadius: 4,
  border: 'none',
  background: '#1976d2',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '0.85rem',
};

const btnNavCerrar = {
  padding: '0.35rem 0.8rem',
  borderRadius: 4,
  border: 'none',
  background: '#c62828',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '0.85rem',
};

const btnReiniciar = {
  padding: '0.25rem 0.6rem',
  borderRadius: 4,
  border: '1px solid #bdbdbd',
  background: '#fafafa',
  cursor: 'pointer',
  fontSize: '0.8rem',
};

/** Capa semitransparente para bloquear interacción */
const overlayBloqueo = {
  position: 'absolute',
  inset: 0,
  borderRadius: 8,
  backgroundColor: 'rgba(0,0,0,0.55)', // fondo oscuro
  zIndex: 5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: '0 1.5rem',
  fontSize: '0.9rem',
  color: '#fff', // texto blanco
};

const overlayTitle = {
  fontWeight: 'bold',
  marginBottom: 4,
  fontSize: '1rem',
};
