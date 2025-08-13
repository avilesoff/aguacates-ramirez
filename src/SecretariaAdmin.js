import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx'; // 👈 NUEVO: librería Excel

export default function SecretariaAdmin() {
  const navigate = useNavigate();

  const [tab, setTab] = useState('ventas'); // 'ventas' | 'recepciones' | 'clasificacion'
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [ventas, setVentas] = useState([]);
  const [recepciones, setRecepciones] = useState([]);
  const [clasificacion, setClasificacion] = useState([]);
  const [mensaje, setMensaje] = useState('');
  const [edit, setEdit] = useState({ tabla: null, id: null, data: {} });

  // hover (zebra + hover)
  const [hoverRow, setHoverRow] = useState(null);
  useEffect(() => setHoverRow(null), [tab]);

  // ===== Helpers =====
  const money = (n) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n || 0));

  const fmtFolio = (n) => String(n ?? '').toString().padStart(4, '0');

  const fmtFecha = (v) => {
    if (!v) return '';
    if (typeof v === 'string') {
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    }
    const d = new Date(typeof v === 'string' && !v.includes('T') ? `${v}T00:00:00` : v);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  async function loadImageAsDataURL(url) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  // ===== PDF (look VentasAdmin) =====
  const descargarPDF = async (venta) => {
    let productos;
    try {
      if (typeof venta.productos === 'string') productos = JSON.parse(venta.productos);
      else if (Array.isArray(venta.productos)) productos = venta.productos;
      else return alert(`❌ La venta #${venta.numero_nota} no tiene detalles para PDF.`);
    } catch {
      return alert(`❌ La venta #${venta.numero_nota} tiene formato incorrecto.`);
    }

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    const verde = [46, 125, 50];
    const verdeSuave = [238, 245, 238];

    // Header
    const logoX = margin, logoY = 16, logoW = 24, logoH = 24;
    const gap = 6;
    const boxW = 56, boxH = 16;
    const boxX = pageW - margin - boxW, boxY = 16;

    const logoData = await loadImageAsDataURL('/aguacate.jpg');
    if (logoData) doc.addImage(logoData, 'JPEG', logoX, logoY - 2, logoW, logoH);

    const titleLeft = logoX + logoW + gap;
    const titleRight = boxX - gap;
    const titleW = Math.max(60, titleRight - titleLeft);
    const titleCenterX = titleLeft + titleW / 2;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text('Aguacates Ramírez', titleCenterX, 22, { align: 'center' });

    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const l1 = doc.splitTextToSize('Registro SAGARPA: EMP0416058459/2021', titleW);
    const l2 = doc.splitTextToSize('Prolongación Linda Vista Carr. San Juan Nuevo - Tancítaro', titleW);
    doc.text(l1, titleCenterX, 28, { align: 'center' });
    doc.text(l2, titleCenterX, 34, { align: 'center' });

    // Box derecha
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('Nota de Venta', boxX, boxY - 2);
    doc.setDrawColor(0); doc.setLineWidth(0.3); doc.rect(boxX, boxY, boxW, boxH);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text('Folio:', boxX + 3, boxY + 6);
    doc.setFont('helvetica', 'bold'); doc.text(fmtFolio(venta.numero_nota), boxX + 24, boxY + 6);
    doc.setFont('helvetica', 'normal'); doc.text(`Fecha: ${fmtFecha(venta.fecha)}`, boxX + 3, boxY + 12);

    // Datos cliente
    let y = Math.max(logoY + logoH + 12, boxY + boxH + 12);
    const line = (label, value) => { doc.text(`${label}: ${value || '-'}`, margin, y); y += 6; };

    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('Datos del cliente', margin, y); y += 10;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    line('Cliente', venta.nombre_cliente);
    line('Domicilio', venta.domicilio);
    line('Ciudad', venta.ciudad);
    line('Placas', venta.placas);

    // Tabla
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

    const total = productos.reduce((acc, p) => acc + parseFloat(p.importe || 0), 0);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(`Total: ${money(total)}`, pageW - margin, doc.lastAutoTable.finalY + 10, { align: 'right' });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text(`Página ${i} de ${pageCount}`, pageW - margin, pageH - 8, { align: 'right' });
    }

    doc.save(`nota_venta_${fmtFolio(venta.numero_nota)}.pdf`);
  };

  // ===== Rango por mes =====
  const rango = useMemo(() => {
    const [y, m] = mes.split('-').map(Number);
    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 1);
    const iso = (d) => d.toISOString().split('T')[0];
    return { desdeFecha: iso(from), hastaFecha: iso(to), desdeTS: from.toISOString(), hastaTS: to.toISOString() };
  }, [mes]);

  // ===== Carga de datos =====
  useEffect(() => {
    const load = async () => {
      setMensaje('');

      if (tab === 'ventas') {
        const { data, error } = await supabase
          .from('ventas').select('*')
          .gte('fecha', rango.desdeFecha).lt('fecha', rango.hastaFecha)
          .order('fecha', { ascending: false });
        if (error) setMensaje('❌ Error cargando ventas: ' + error.message);
        else setVentas(data || []);
      }

      if (tab === 'recepciones') {
        const { data, error } = await supabase
          .from('recepciones').select('*')
          .gte('fecha_hora', rango.desdeTS).lt('fecha_hora', rango.hastaTS)
          .order('fecha_hora', { ascending: false });
        if (error) setMensaje('❌ Error cargando recepciones: ' + error.message);
        else setRecepciones(data || []);
      }

      if (tab === 'clasificacion') {
        const { data, error } = await supabase
          .from('clasificacion').select('*')
          .gte('fecha', rango.desdeFecha).lt('fecha', rango.hastaFecha)
          .order('fecha', { ascending: false });
        if (error) setMensaje('❌ Error cargando clasificaciones: ' + error.message);
        else setClasificacion(data || []);
      }
    };
    load();
  }, [tab, rango]);

  // ===== Edición / borrado =====
  const startEdit = (tabla, row) => setEdit({ tabla, id: row.id, data: { ...row } });
  const cancelEdit = () => setEdit({ tabla: null, id: null, data: {} });

  const saveEdit = async () => {
    const { tabla, id, data } = edit;
    if (!tabla || !id) return;
    const { error } = await supabase.from(tabla).update({ ...data, created_at: undefined }).eq('id', id);
    if (error) { setMensaje('❌ Error al guardar: ' + error.message); return; }
    setMensaje('✅ Cambios guardados.'); cancelEdit();

    if (tabla === 'ventas') {
      const { data } = await supabase.from('ventas').select('*')
        .gte('fecha', rango.desdeFecha).lt('fecha', rango.hastaFecha).order('fecha', { ascending: false });
      setVentas(data || []);
    }
    if (tabla === 'recepciones') {
      const { data } = await supabase.from('recepciones').select('*')
        .gte('fecha_hora', rango.desdeTS).lt('fecha_hora', rango.hastaTS).order('fecha_hora', { ascending: false });
      setRecepciones(data || []);
    }
    if (tabla === 'clasificacion') {
      const { data } = await supabase.from('clasificacion').select('*')
        .gte('fecha', rango.desdeFecha).lt('fecha', rango.hastaFecha).order('fecha', { ascending: false });
      setClasificacion(data || []);
    }
  };

  const removeRow = async (tabla, id) => {
    if (!window.confirm('¿Eliminar este registro?')) return;
    const { error } = await supabase.from(tabla).delete().eq('id', id);
    if (error) setMensaje('❌ Error al eliminar: ' + error.message);
    else {
      setMensaje('✅ Eliminado.');
      if (tabla === 'ventas') setVentas((a) => a.filter((x) => x.id !== id));
      if (tabla === 'recepciones') setRecepciones((a) => a.filter((x) => x.id !== id));
      if (tabla === 'clasificacion') setClasificacion((a) => a.filter((x) => x.id !== id));
    }
  };

  const Field = ({ value, onChange, type = 'text', style }) => (
    <input
      type={type}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      style={{ padding: '0.2rem', width: '100%', ...style }}
    />
  );

  // ===== Estilo zebra + hover =====
  const rowStyle = (i, hovered) => ({
    background: hovered ? '#eaf5ea' : (i % 2 ? '#f5fbf5' : '#ffffff'),
    transition: 'background 0.15s ease'
  });

  // ===== AGRUPADOS =====

  // Recepciones agrupadas por entrega_id
  const gruposRecep = useMemo(() => {
    const map = new Map();
    for (const r of recepciones) {
      const key = r.entrega_id || `single-${r.id}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          entrega_id: r.entrega_id || null,
          cliente_nombre: r.cliente_nombre,
          telefono_cliente: r.telefono_cliente,
          fecha_hora: r.fecha_hora,
          total_kilos: 0,
          rows: []
        });
      }
      const g = map.get(key);
      g.rows.push(r);
      g.total_kilos += Number(r.kilos || 0);
      if (new Date(r.fecha_hora) < new Date(g.fecha_hora)) g.fecha_hora = r.fecha_hora;
    }
    return Array.from(map.values()).sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));
  }, [recepciones]);

  // Clasificación agrupada (por recepcion_id; fallback a entrega_id y luego a registro único)
  const gruposClas = useMemo(() => {
    const map = new Map();
    for (const c of clasificacion) {
      const key =
        (c.recepcion_id != null ? `rec-${c.recepcion_id}` :
          (c.entrega_id ? `ent-${c.entrega_id}` : `cls-${c.id}`));

      if (!map.has(key)) {
        map.set(key, {
          key,
          recepcion_id: c.recepcion_id ?? null,
          entrega_id: c.entrega_id ?? null,
          cliente_nombre: c.cliente_nombre,
          fecha: c.fecha,
          total_cajas: 0,
          total_kg: 0,
          rows: []
        });
      }
      const g = map.get(key);
      g.rows.push(c);
      g.total_cajas += Number(c.cajas || 0);
      g.total_kg += Number(c.kg || 0);
      if (new Date(c.fecha) < new Date(g.fecha)) g.fecha = c.fecha;
    }
    return Array.from(map.values()).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }, [clasificacion]);

  // abrir/cerrar grupos
  const [openGroup, setOpenGroup] = useState({});
  const toggleGroup = (k) => setOpenGroup((o) => ({ ...o, [k]: !o[k] }));

  // ========= EXPORTAR A EXCEL =========

  // Normaliza ventas -> (Ventas, Ventas_Detalle)
  function splitVentas(ventasArr = []) {
    const ventasOut = [];
    const detalleOut = [];

    for (const v of ventasArr) {
      let productos = [];
      try {
        if (typeof v.productos === 'string') productos = JSON.parse(v.productos || '[]');
        else if (Array.isArray(v.productos)) productos = v.productos;
      } catch {
        productos = [];
      }

      ventasOut.push({
        id: v.id,
        numero_nota: v.numero_nota,
        fecha: v.fecha,
        recepcion_id: v.recepcion_id,
        nombre_cliente: v.nombre_cliente,
        domicilio: v.domicilio,
        ciudad: v.ciudad,
        placas: v.placas,
        total: v.total,
        created_at: v.created_at
      });

      for (const p of productos) {
        detalleOut.push({
          venta_id: v.id,
          numero_nota: v.numero_nota,
          kg: p.kg ?? p.cantidad ?? 0,
          descripcion: p.descripcion ?? p.calibre ?? '',
          precio_unitario: p.precio_unitario ?? p.precio ?? 0,
          importe: p.importe ?? 0
        });
      }
    }
    return { ventasOut, detalleOut };
  }

  function toSheet(book, name, rows) {
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(book, ws, name);
  }

  function downloadWorkbook(nombre, ventasArr, recepArr, clasifArr) {
    const book = XLSX.utils.book_new();

    const { ventasOut, detalleOut } = splitVentas(ventasArr || []);
    toSheet(book, 'Ventas', ventasOut);
    toSheet(book, 'Ventas_Detalle', detalleOut);

    toSheet(book, 'Recepciones', (recepArr || []).map(r => ({
      id: r.id,
      fecha_hora: r.fecha_hora,
      cliente_nombre: r.cliente_nombre,
      kilos: r.kilos,
      tipo: r.tipo,
      telefono_cliente: r.telefono_cliente,
      entrega_id: r.entrega_id
    })));

    toSheet(book, 'Clasificacion', (clasifArr || []).map(c => ({
      id: c.id,
      fecha: c.fecha,
      cliente_nombre: c.cliente_nombre,
      calibre: c.calibre,
      cajas: c.cajas,
      kg: c.kg,
      finalizado: c.finalizado,
      recepcion_id: c.recepcion_id,
      entrega_id: c.entrega_id
    })));

    XLSX.writeFile(book, nombre);
  }

  // Traer TODO de una tabla por páginas (para histórico completo)
  async function fetchAll(table, select = '*') {
    const pageSize = 1000;
    let from = 0;
    let to = pageSize - 1;
    const all = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .range(from, to)
        .order('id', { ascending: true });

      if (error) throw error;
      if (!data || data.length === 0) break;

      all.push(...data);
      if (data.length < pageSize) break;

      from += pageSize;
      to += pageSize;
    }
    return all;
  }

  // Exportar EXCEL del mes visible en la UI
  const exportarExcelMes = async () => {
    try {
      const { desdeFecha, hastaFecha, desdeTS, hastaTS } = rango;

      const [{ data: v }, { data: r }, { data: c }] = await Promise.all([
        supabase.from('ventas')
          .select('*')
          .gte('fecha', desdeFecha).lt('fecha', hastaFecha)
          .order('fecha', { ascending: false }),

        supabase.from('recepciones')
          .select('*')
          .gte('fecha_hora', desdeTS).lt('fecha_hora', hastaTS)
          .order('fecha_hora', { ascending: false }),

        supabase.from('clasificacion')
          .select('*')
          .gte('fecha', desdeFecha).lt('fecha', hastaFecha)
          .order('fecha', { ascending: false })
      ]);

      downloadWorkbook(`Respaldo_${mes}.xlsx`, v || [], r || [], c || []);
      setMensaje('✅ Exportación del mes lista.');
    } catch (err) {
      console.error(err);
      setMensaje('❌ Error exportando el mes: ' + (err?.message || err));
    }
  };

  // Exportar EXCEL con TODO el histórico
  const exportarExcelTodo = async () => {
    if (!window.confirm('Esto exportará TODO el histórico. ¿Continuar?')) return;
    try {
      const [vAll, rAll, cAll] = await Promise.all([
        fetchAll('ventas', '*'),
        fetchAll('recepciones', '*'),
        fetchAll('clasificacion', '*')
      ]);

      downloadWorkbook('Respaldo_COMPLETO.xlsx', vAll, rAll, cAll);
      setMensaje('✅ Exportación completa lista.');
    } catch (err) {
      console.error(err);
      setMensaje('❌ Error exportando TODO: ' + (err?.message || err));
    }
  };

  // ===== Render =====
  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'Arial' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <h2 style={{ margin: 0, color: '#2e7d32' }}>Secretaría de Ventas</h2>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label><strong>Mes:</strong></label>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={{ padding: '0.3rem' }} />

          {/* 👇 NUEVOS: Exportar */}
          <button onClick={exportarExcelMes} style={{ ...btnSecundario, backgroundColor: '#2e7d32' }}>
            ⬇️ Exportar (mes)
          </button>
          <button onClick={exportarExcelTodo} style={{ ...btnSecundario, backgroundColor: '#00695c' }}>
            📦 Exportar TODO
          </button>

          <button onClick={() => navigate('/ventas')} style={btnSecundario}>↩️ Volver</button>
          <button onClick={async () => { await supabase.auth.signOut(); navigate('/login'); }} style={btnCerrarSesion}>🔒 Cerrar sesión</button>
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button onClick={() => setTab('ventas')} style={tabBtn(tab === 'ventas')}>Ventas</button>
        <button onClick={() => setTab('recepciones')} style={tabBtn(tab === 'recepciones')}>Recepciones – Parte 1</button>
        <button onClick={() => setTab('clasificacion')} style={tabBtn(tab === 'clasificacion')}>Clasificación – Parte 2</button>
      </div>

      {mensaje && (
        <p style={{ textAlign: 'center', color: mensaje.includes('❌') ? 'crimson' : 'green', marginTop: 10 }}>
          {mensaje}
        </p>
      )}

      {/* VENTAS */}
      {tab === 'ventas' && (
        <div style={tableCard}>
          <div style={tableScroll}>
            <table style={tbl}>
              <thead>
                <tr>
                  <th style={th}>Folio</th>
                  <th style={th}>Fecha</th>
                  <th style={th}>Cliente</th>
                  <th style={th}>Total</th>
                  <th style={th}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map((v, i) => {
                  const editing = edit.tabla === 'ventas' && edit.id === v.id;
                  const row = editing ? edit.data : v;
                  const hovered = hoverRow === i;
                  return (
                    <tr
                      key={v.id}
                      style={rowStyle(i, hovered)}
                      onMouseEnter={() => setHoverRow(i)}
                      onMouseLeave={() => setHoverRow(null)}
                    >
                      <td style={td}>{fmtFolio(v.numero_nota)}</td>
                      <td style={td}>
                        {editing ? (
                          <Field
                            type="date"
                            value={row.fecha}
                            onChange={(val) => setEdit((e) => ({ ...e, data: { ...e.data, fecha: val } }))}
                          />
                        ) : fmtFecha(v.fecha)}
                      </td>
                      <td style={td}>
                        {editing ? (
                          <Field
                            value={row.nombre_cliente}
                            onChange={(val) => setEdit((e) => ({ ...e, data: { ...e.data, nombre_cliente: val } }))}
                          />
                        ) : v.nombre_cliente}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>{money(v.total)}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        {editing ? (
                          <>
                            <button onClick={saveEdit} style={btnGuardar}>💾</button>
                            <button onClick={cancelEdit} style={btnCancelar}>✖</button>
                          </>
                        ) : (
                          <>
                            <button onClick={async () => { await descargarPDF(v); }} style={btnPDF}>📄 PDF</button>
                            <button onClick={() => startEdit('ventas', v)} style={btnEditar}>✏️</button>
                            <button onClick={() => removeRow('ventas', v.id)} style={btnEliminar}>🗑️</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* RECEPCIONES (AGRUPADAS) */}
      {tab === 'recepciones' && (
        <div style={tableCard}>
          <div style={tableScroll}>
            <table style={tbl}>
              <thead>
                <tr>
                  <th style={th}></th>
                  <th style={th}>Fecha/Hora</th>
                  <th style={th}>Cliente</th>
                  <th style={th}>Kilos</th>
                  <th style={th}>Tipo</th>
                  <th style={th}>Teléfono</th>
                  <th style={th}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {gruposRecep.map((g) => (
                  <React.Fragment key={g.key}>
                    {/* RESUMEN */}
                    <tr style={groupRow} onClick={() => toggleGroup(g.key)}>
                      <td style={{ ...td, width: 28, textAlign: 'center', cursor: 'pointer' }}>
                        {openGroup[g.key] ? '▾' : '▸'}
                      </td>
                      <td style={{ ...td, fontWeight: 600 }}>{new Date(g.fecha_hora).toLocaleString()}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{g.cliente_nombre}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{g.total_kilos}</td>
                      <td style={{ ...td, color: '#555' }}>
                        {g.rows.length} partida{g.rows.length > 1 ? 's' : ''}{openGroup[g.key] ? '' : ' — clic para ver'}
                      </td>
                      <td style={td}>{g.telefono_cliente || '-'}</td>
                      <td style={{ ...td, color: '#777' }}>—</td>
                    </tr>

                    {/* DETALLE */}
                    {openGroup[g.key] && g.rows.map((r) => {
                      const editing = edit.tabla === 'recepciones' && edit.id === r.id;
                      const row = editing ? edit.data : r;
                      return (
                        <tr key={r.id} style={detailRow}>
                          <td style={{ ...td, textAlign: 'center', color: '#777' }}>•</td>

                          <td style={td}>
                            {editing ? (
                              <Field
                                type="datetime-local"
                                value={row.fecha_hora?.slice(0, 16) ?? ''}
                                onChange={(val) => setEdit((e) => ({ ...e, data: { ...e.data, fecha_hora: val } }))}
                              />
                            ) : new Date(r.fecha_hora).toLocaleString()}
                          </td>

                          <td style={td}>
                            {editing ? (
                              <Field
                                value={row.cliente_nombre}
                                onChange={(val) => setEdit((e) => ({ ...e, data: { ...e.data, cliente_nombre: val } }))}
                              />
                            ) : r.cliente_nombre}
                          </td>

                          <td style={td}>
                            {editing ? (
                              <Field
                                type="number"
                                value={row.kilos ?? ''}
                                onChange={(val) =>
                                  setEdit((e) => ({ ...e, data: { ...e.data, kilos: parseFloat(val) || null } }))
                                }
                              />
                            ) : r.kilos}
                          </td>

                          <td style={td}>
                            {editing ? (
                              <Field
                                value={row.tipo ?? ''}
                                onChange={(val) => setEdit((e) => ({ ...e, data: { ...e.data, tipo: val } }))}
                              />
                            ) : r.tipo}
                          </td>

                          <td style={td}>
                            {editing ? (
                              <Field
                                value={row.telefono_cliente ?? ''}
                                onChange={(val) =>
                                  setEdit((e) => ({ ...e, data: { ...e.data, telefono_cliente: val } }))
                                }
                              />
                            ) : r.telefono_cliente || '-'}
                          </td>

                          <td style={{ ...td, whiteSpace: 'nowrap' }}>
                            {editing ? (
                              <>
                                <button onClick={saveEdit} style={btnGuardar}>💾</button>
                                <button onClick={cancelEdit} style={btnCancelar}>✖</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => startEdit('recepciones', r)} style={btnEditar}>✏️</button>
                                <button onClick={() => removeRow('recepciones', r.id)} style={btnEliminar}>🗑️</button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CLASIFICACIÓN (AGRUPADA POR RECEPCIÓN) */}
      {tab === 'clasificacion' && (
        <div style={tableCard}>
          <div style={tableScroll}>
            <table style={tbl}>
              <thead>
                <tr>
                  <th style={th}></th>
                  <th style={th}>Fecha</th>
                  <th style={th}>Cliente</th>
                  <th style={th}>Calibre</th>
                  <th style={th}>Cajas</th>
                  <th style={th}>Kg</th>
                  <th style={th}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {gruposClas.map((g) => (
                  <React.Fragment key={g.key}>
                    {/* RESUMEN DEL GRUPO */}
                    <tr style={groupRow} onClick={() => toggleGroup(g.key)}>
                      <td style={{ ...td, width: 28, textAlign: 'center', cursor: 'pointer' }}>
                        {openGroup[g.key] ? '▾' : '▸'}
                      </td>
                      <td style={{ ...td, fontWeight: 600 }}>{fmtFecha(g.fecha)}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{g.cliente_nombre}</td>
                      <td style={{ ...td, color: '#555' }}>
                        {g.rows.length} calibre{g.rows.length > 1 ? 's' : ''}{openGroup[g.key] ? '' : ' — clic para ver'}
                      </td>
                      <td style={{ ...td, fontWeight: 600 }}>{g.total_cajas}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{g.total_kg}</td>
                      <td style={{ ...td, color: '#777' }}>—</td>
                    </tr>

                    {/* DETALLE DEL GRUPO */}
                    {openGroup[g.key] && g.rows.map((c) => {
                      const editing = edit.tabla === 'clasificacion' && edit.id === c.id;
                      const row = editing ? edit.data : c;

                      return (
                        <tr key={c.id} style={detailRow}>
                          <td style={{ ...td, textAlign: 'center', color: '#777' }}>•</td>

                          <td style={td}>
                            {editing ? (
                              <Field
                                type="date"
                                value={row.fecha}
                                onChange={(val) => setEdit((e) => ({ ...e, data: { ...e.data, fecha: val } }))}
                              />
                            ) : fmtFecha(c.fecha)}
                          </td>

                          <td style={td}>
                            {editing ? (
                              <Field
                                value={row.cliente_nombre}
                                onChange={(val) => setEdit((e) => ({ ...e, data: { ...e.data, cliente_nombre: val } }))}
                              />
                            ) : c.cliente_nombre}
                          </td>

                          <td style={td}>
                            {editing ? (
                              <Field
                                value={row.calibre ?? ''}
                                onChange={(val) => setEdit((e) => ({ ...e, data: { ...e.data, calibre: val } }))}
                              />
                            ) : c.calibre || '-'}
                          </td>

                          <td style={td}>
                            {editing ? (
                              <Field
                                type="number"
                                value={row.cajas ?? ''}
                                onChange={(val) =>
                                  setEdit((e) => ({
                                    ...e,
                                    data: { ...e.data, cajas: parseInt(val || '0', 10) }
                                  }))
                                }
                              />
                            ) : c.cajas}
                          </td>

                          <td style={td}>
                            {editing ? (
                              <Field
                                type="number"
                                value={row.kg ?? ''}
                                onChange={(val) =>
                                  setEdit((e) => ({
                                    ...e,
                                    data: { ...e.data, kg: parseFloat(val) || 0 }
                                  }))
                                }
                              />
                            ) : c.kg}
                          </td>

                          <td style={{ ...td, whiteSpace: 'nowrap' }}>
                            {editing ? (
                              <>
                                <button onClick={saveEdit} style={btnGuardar}>💾</button>
                                <button onClick={cancelEdit} style={btnCancelar}>✖</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => startEdit('clasificacion', c)} style={btnEditar}>✏️</button>
                                <button onClick={() => removeRow('clasificacion', c.id)} style={btnEliminar}>🗑️</button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* tarjeta + scroll para sticky header */
const tableCard = {
  marginTop: 16,
  borderRadius: 8,
  boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
  overflow: 'hidden'
};
const tableScroll = {
  maxHeight: '60vh',
  overflow: 'auto'
};

const tbl = { width: '100%', borderCollapse: 'separate', borderSpacing: 0 };
const th = {
  background: '#2e7d32',
  color: '#fff',
  textAlign: 'left',
  padding: '10px 12px',
  fontWeight: 700,
  position: 'sticky',
  top: 0,
  zIndex: 1,
  boxShadow: '0 2px 0 rgba(0,0,0,0.05)'
};
const td = {
  padding: '10px 12px',
  borderBottom: '1px solid #e6e6e6',
  verticalAlign: 'middle'
};

/* Fila resumen y detalle para grupos */
const groupRow = {
  background: '#e8f5e9',
  borderTop: '1px solid #c8e6c9',
  borderBottom: '1px solid #c8e6c9',
  cursor: 'pointer'
};
const detailRow = {
  background: '#fafafa'
};

/* botones */
const btnSecundario = { padding: '0.4rem 0.8rem', backgroundColor: '#1976d2', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
const btnCerrarSesion = { padding: '0.4rem 0.8rem', backgroundColor: '#b71c1c', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
const btnPDF = { padding: '0.2rem 0.5rem', background: '#2e7d32', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginRight: 6 };
const btnEditar = { padding: '0.2rem 0.5rem', background: '#0288d1', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginRight: 6 };
const btnEliminar = { padding: '0.2rem 0.5rem', background: '#c62828', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' };
const btnGuardar = { padding: '0.2rem 0.5rem', background: '#2e7d32', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginRight: 6 };
const btnCancelar = { padding: '0.2rem 0.5rem', background: '#737373', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' };
const tabBtn = (active) => ({
  padding: '0.5rem 0.9rem',
  background: active ? '#2e7d32' : '#e0e0e0',
  color: active ? '#fff' : '#333',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer'
});
