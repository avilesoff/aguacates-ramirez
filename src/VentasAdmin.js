import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function VentasAdmin() {
  const [ventas, setVentas] = useState([]);
  const [mensaje, setMensaje] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const cargarVentas = async () => {
      const { data, error } = await supabase
        .from('ventas')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        setMensaje('❌ Error al cargar ventas: ' + error.message);
        return;
      }

      const ventasCorregidas = await Promise.all(
        (data || []).map(async (venta) => {
          let totalFinal = venta.total || 0;

          try {
            const productos = typeof venta.productos === 'string'
              ? JSON.parse(venta.productos)
              : Array.isArray(venta.productos) ? venta.productos : [];

            const calculado = productos.reduce((acc, p) => acc + parseFloat(p.importe || 0), 0);

            if (!totalFinal || totalFinal === 0) {
              totalFinal = calculado;
              if (calculado > 0) {
                await supabase.from('ventas').update({ total: calculado }).eq('id', venta.id);
              }
            }
          } catch (e) {
            console.error(`Error calculando total para venta #${venta.numero_nota}`, e);
          }

          return { ...venta, total: totalFinal };
        })
      );

      setVentas(ventasCorregidas);
    };

    cargarVentas();
  }, []);

  // -------- Helpers --------
  const money = (n) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n || 0));

  // ✔️ Formatea "YYYY-MM-DD" sin tocar zona horaria (evita que se recorra al día anterior)
  const fmtFecha = (v) => {
    if (!v) return '';
    if (typeof v === 'string') {
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[3]}/${m[2]}/${m[1]}`; // dd/mm/yyyy directo
    }
    // Fallback si viene con hora real
    const d = new Date(typeof v === 'string' && !v.includes('T') ? `${v}T00:00:00` : v);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const fmtFolio = (n) => String(n ?? '').toString().padStart(4, '0');

  async function loadImageAsDataURL(url) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch { return null; }
  }

  // -------- PDF --------
  const descargarPDF = async (venta) => {
    // productos
    let productos;
    try {
      if (typeof venta.productos === 'string') productos = JSON.parse(venta.productos);
      else if (Array.isArray(venta.productos)) productos = venta.productos;
      else return alert(`❌ La venta #${venta.numero_nota} no tiene detalles para PDF.`);
    } catch { return alert(`❌ La venta #${venta.numero_nota} tiene formato incorrecto.`); }

    // doc
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;

    // colores
    const verde = [46, 125, 50];        // #2e7d32
    const verdeSuave = [238, 245, 238];

    // layout header
    const logoX = margin, logoY = 16, logoW = 24, logoH = 24;
    const gap = 6;
    const boxW = 56, boxH = 16;                         // recuadro más pequeño
    const boxX = pageW - margin - boxW, boxY = 16;

    // logo
    const logoData = await loadImageAsDataURL('/aguacate.jpg');
    if (logoData) doc.addImage(logoData, 'JPEG', logoX, logoY - 2, logoW, logoH);

    // área de título = desde después del logo hasta antes del recuadro
    const titleLeft = logoX + logoW + gap;
    const titleRight = boxX - gap;
    const titleW = Math.max(60, titleRight - titleLeft);
    const titleCenterX = titleLeft + titleW / 2;

    // encabezado (centrado en el área de título)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Aguacates Ramírez', titleCenterX, 22, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const l1 = doc.splitTextToSize('Registro SAGARPA: EMP0416058459/2021', titleW);
    const l2 = doc.splitTextToSize('Prolongación Linda Vista Carr. San Juan Nuevo - Tancítaro', titleW);
    doc.text(l1, titleCenterX, 28, { align: 'center' });
    doc.text(l2, titleCenterX, 34, { align: 'center' });

    // recuadro folio (derecha)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);                                // más discreto
    doc.text('Nota de Venta', boxX, boxY - 2);
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(boxX, boxY, boxW, boxH);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Folio:', boxX + 3, boxY + 6);
    doc.setFont('helvetica', 'bold');
    doc.text(fmtFolio(venta.numero_nota), boxX + 24, boxY + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${fmtFecha(venta.fecha)}`, boxX + 3, boxY + 12);

    // datos cliente (bajar debajo de logo y recuadro)
    let y = Math.max(logoY + logoH + 12, boxY + boxH + 12); // asegura separación
    const line = (label, value) => { doc.text(`${label}: ${value || '-'}`, margin, y); y += 6; };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Datos del cliente', margin, y);
    y += 10; // pequeño salto extra antes de "Cliente:"
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    line('Cliente', venta.nombre_cliente);
    line('Domicilio', venta.domicilio);
    line('Ciudad', venta.ciudad);
    line('Placas', venta.placas);

    // tabla
    autoTable(doc, {
      startY: y + 10,
      head: [['Cantidad (kg)', 'Descripción', 'Precio unitario', 'Importe']],
      body: productos.map(p => [
        Number(p.kg || 0).toFixed(0),
        String(p.descripcion ?? p.calibre ?? '-'),
        money(p.precio_unitario),
        money(p.importe)
      ]),
      styles: { fontSize: 10, cellPadding: 2 },
      headStyles: { fillColor: verde, textColor: 255 },
      alternateRowStyles: { fillColor: verdeSuave },
      columnStyles: {
        0: { halign: 'right', cellWidth: 32 },
        1: { cellWidth: 'auto' },
        2: { halign: 'right', cellWidth: 35 },
        3: { halign: 'right', cellWidth: 35 }
      },
      theme: 'striped',
      margin: { left: margin, right: margin }
    });

    const afterTableY = doc.lastAutoTable.finalY;
    const total = productos.reduce((acc, p) => acc + parseFloat(p.importe || 0), 0);

    // total
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`Total: ${money(total)}`, pageW - margin, afterTableY + 10, { align: 'right' });

    // footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Página ${i} de ${pageCount}`, pageW - margin, pageH - 8, { align: 'right' });
    }

    doc.save(`nota_venta_${fmtFolio(venta.numero_nota)}.pdf`);
  };

  // -------- UI --------
  const eliminarVenta = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar esta nota de venta?')) return;
    const { error } = await supabase.from('ventas').delete().eq('id', id);
    if (error) setMensaje('❌ Error al eliminar: ' + error.message);
    else {
      setVentas(ventas.filter(v => v.id !== id));
      setMensaje('✅ Venta eliminada correctamente.');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: 'auto', fontFamily: 'Arial' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ textAlign: 'center', color: '#2e7d32', margin: 0 }}>Administración de Ventas</h2>
        <button onClick={handleLogout} style={btnCerrarSesion}>🔒 Cerrar sesión</button>
      </div>

      {mensaje && (
        <p style={{ marginTop: '1rem', textAlign: 'center', color: mensaje.includes('❌') ? 'red' : 'green' }}>
          {mensaje}
        </p>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
        <thead style={{ background: '#eee' }}>
          <tr>
            <th>Número</th>
            <th>Cliente</th>
            <th>Fecha</th>
            <th>Total</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {ventas.map((v) => (
            <tr key={v.id}>
              <td>{v.numero_nota}</td>
              <td>{v.nombre_cliente}</td>
              <td>{v.fecha}</td>
              <td>{money(v.total)}</td>
              <td>
                <button onClick={async () => { await descargarPDF(v); }} style={btnDescargar}>📄 PDF</button>
                <button onClick={() => eliminarVenta(v.id)} style={btnEliminar}>🗑️</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// estilos botones
const btnDescargar = {
  padding: '0.3rem 0.7rem',
  marginRight: '0.5rem',
  backgroundColor: '#2e7d32',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer'
};
const btnEliminar = {
  padding: '0.3rem 0.7rem',
  backgroundColor: '#c62828',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer'
};
const btnCerrarSesion = {
  padding: '0.5rem 1rem',
  backgroundColor: '#b71c1c',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer'
};
