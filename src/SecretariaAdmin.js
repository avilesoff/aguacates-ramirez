import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function SecretariaAdmin() {
  const navigate = useNavigate();

  const [tab, setTab] = useState('ventas'); // 'ventas' | 'recepciones' | 'clasificacion'

  // Filtro por DÍA (local)
  const [fecha, setFecha] = useState(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  const [ventas, setVentas] = useState([]);
  const [recepciones, setRecepciones] = useState([]);
  const [clasificacion, setClasificacion] = useState([]);
  const [mensaje, setMensaje] = useState('');
  const [edit, setEdit] = useState({ tabla: null, id: null, data: {} });

  const [hoverRow, setHoverRow] = useState(null);
  useEffect(() => setHoverRow(null), [tab]);

  const [ventasRevisadas, setVentasRevisadas] = useState({});
  const [revisoresPorVenta, setRevisoresPorVenta] = useState({});

  // colapsar/mostrar tarjetas
  const [mostrarRevisadas, setMostrarRevisadas] = useState(false);

  // vista principal de compras: pendientes | revisadas | todas
  const [vistaCompras, setVistaCompras] = useState('pendientes');


  // Al cambiar de vista: en 'revisadas' se ocultará por defecto; en 'todas' se mostrará por defecto
  useEffect(() => {
    if (vistaCompras === 'revisadas') setMostrarRevisadas(false);
    if (vistaCompras === 'todas') setMostrarRevisadas(true);
  }, [vistaCompras]);

  // correo del usuario actual (para filtros)
  const [correoActual, setCorreoActual] = useState(null);

  // filtro para tarjetas: 'todas' o un correo específico
  const [filtroRevisadas, setFiltroRevisadas] = useState('todas');
  const [busquedaRevisadas, setBusquedaRevisadas] = useState('');

  // Revisores únicos encontrados en las notas
  const revisoresUnicos = React.useMemo(() => {
    const set = new Set();

    Object.values(revisoresPorVenta || {}).forEach((arr) => {
      (arr || []).forEach((correo) => {
        if (correo) set.add(correo);
      });
    });

    return Array.from(set).sort();
  }, [revisoresPorVenta]);

  // 👉 Separar ventas en PENDIENTES (por usuario) y REVISADAS (por usuario) (ordenadas por fecha desc.)
const ventasPendientes = useMemo(
  () =>
    (ventas || [])
      // Pendiente (por usuario) = el usuario actual NO la ha revisado
      .filter((v) => !ventasRevisadas[v.id])
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
  [ventas, revisoresPorVenta, ventasRevisadas]
);


  const ventasRevisadasSolo = useMemo(
    () =>
      (ventas || [])
        .filter((v) => !!ventasRevisadas[v.id])
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
    [ventas, revisoresPorVenta, ventasRevisadas]
  );

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

  async function loadImageForJsPDF(url) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        console.warn('No se pudo cargar imagen:', url, res.status);
        return null;
      }
      const blob = await res.blob();
      let format = 'PNG';
      const mime = (blob.type || '').toLowerCase();
      if (mime.includes('jpeg') || mime.includes('jpg')) format = 'JPEG';
      else if (mime.includes('png')) format = 'PNG';

      const dataUrl = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });

      return { dataUrl, format };
    } catch (err) {
      console.warn('loadImageForJsPDF error:', url, err);
      return null;
    }
  }

  const descargarPDF = async (venta) => {
    let productos;
    try {
      if (typeof venta.productos === 'string') {
        productos = JSON.parse(venta.productos);
      } else if (Array.isArray(venta.productos)) {
        productos = venta.productos;
      } else {
        return alert(`❌ La venta #${venta.numero_nota} no tiene detalles para PDF.`);
      }
    } catch {
      return alert(`❌ La venta #${venta.numero_nota} tiene formato incorrecto.`);
    }

    // === Totales CLASIFICADOS (lo que se vende) ===
    let kilosClasificados = 0;
    let cajasClasificadas = 0;
    const cajasPorTipo = {};

    const getTipoKeyFromProducto = (p) =>
      (p.tipo_origen && String(p.tipo_origen).trim()) ||
      (p.tipo && String(p.tipo).trim()) ||
      (p.descripcion && String(p.descripcion).trim()) ||
      (p.calibre && String(p.calibre).trim()) ||
      'Sin tipo';

    (productos || []).forEach((p) => {
      const kg = Number(p.kg ?? p.cantidad ?? 0) || 0;
      const cajas = Number(p.cajas ?? 0) || 0;

      kilosClasificados += kg;
      cajasClasificadas += cajas;

      const key = getTipoKeyFromProducto(p);
      cajasPorTipo[key] = (cajasPorTipo[key] || 0) + cajas;
    });

    // === Totales RECIBIDOS (desde recepciones) ===
    let kilosRecibidos = null;
    let cajasRecibidas = null;

    let entregaId = venta?.clasificacion_entrega_id
      ? String(venta.clasificacion_entrega_id)
      : null;

    if (!entregaId && venta?.recepcion_id != null) {
      try {
        const { data: recRow } = await supabase
          .from('recepciones')
          .select('entrega_id')
          .eq('id', venta.recepcion_id)
          .maybeSingle();
        if (recRow?.entrega_id) entregaId = String(recRow.entrega_id);
      } catch (e) {
        console.warn('Error obteniendo entrega_id desde recepcion:', e);
      }
    }

    if (entregaId) {
      try {
        const { data: recs } = await supabase
          .from('recepciones')
          .select('kilos, cajas')
          .eq('entrega_id', entregaId);

        if (Array.isArray(recs) && recs.length) {
          kilosRecibidos = recs.reduce(
            (acc, r) => acc + (Number(r.kilos) || 0),
            0
          );
          cajasRecibidas = recs.reduce(
            (acc, r) => acc + (Number(r.cajas) || 0),
            0
          );
        }
      } catch (e) {
        console.warn('Error obteniendo totales de recepciones:', e);
      }
    }

    if ((!cajasClasificadas || cajasClasificadas === 0) && entregaId) {
      try {
        const { data: cls } = await supabase
          .from('clasificacion')
          .select('kg, cajas, tipo')
          .eq('entrega_id', entregaId);

        if (Array.isArray(cls) && cls.length) {
          cajasClasificadas = cls.reduce(
            (acc, r) => acc + (Number(r.cajas) || 0),
            0
          );
          if (!kilosClasificados || kilosClasificados === 0) {
            kilosClasificados = cls.reduce(
              (acc, r) => acc + (Number(r.kg) || 0),
              0
            );
          }

          cls.forEach((r) => {
            const key =
              (r.tipo && String(r.tipo).trim()) ||
              'Sin tipo';
            const c = Number(r.cajas) || 0;
            cajasPorTipo[key] = (cajasPorTipo[key] || 0) + c;
          });
        }
      } catch (e) {
        console.warn('Error obteniendo totales desde clasificacion:', e);
      }
    }

    const panelKg = kilosRecibidos ?? kilosClasificados;
    const panelCajas = cajasRecibidas ?? cajasClasificadas;

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;

    // Encabezado
    const logoX = margin, logoY = 16, logoW = 24, logoH = 24, gap = 6;
    const boxW = 56, boxH = 16;
    const boxX = pageW - margin - boxW, boxY = 16;

    const logoData = await loadImageAsDataURL('/aguacate.jpg');
    if (logoData) doc.addImage(logoData, 'JPEG', logoX, logoY - 2, logoW, logoH);

    const titleLeft = logoX + logoW + gap;
    const titleRight = boxX - gap;
    const titleCenterX = (titleLeft + titleRight) / 2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Aguacates Ramírez', titleCenterX, 22, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Registro SAGARPA: EMP0416058459/2021', titleCenterX, 28, { align: 'center' });
    doc.text(
      'Prolongación Linda Vista Carr. San Juan Nuevo - Tancítaro',
      titleCenterX,
      34,
      { align: 'center' }
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Nota de Compra', boxX, boxY - 2);
    doc.setDrawColor(0);
    doc.rect(boxX, boxY, boxW, boxH);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Folio:', boxX + 3, boxY + 6);
    doc.setFont('helvetica', 'bold');
    doc.text(fmtFolio(venta.numero_nota), boxX + 24, boxY + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${fmtFecha(venta.fecha)}`, boxX + 3, boxY + 12);

    // Datos cliente
    let y = Math.max(logoY + logoH + 12, boxY + boxH + 12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Datos del cliente', margin, y);
    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Cliente: ${venta.nombre_cliente}`, margin, y);
    y += 10;

    // Tarjeta de recibidos
    const panelW = 72;
    const panelH = 28;
    const panelX = pageW - margin - panelW;
    const panelY = y - 10;

    doc.setDrawColor(46, 125, 50);
    doc.setLineWidth(0.4);
    doc.rect(panelX, panelY, panelW, panelH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Kilos recibidos', panelX + 20, panelY + 9);
    doc.text('Cajas recibidas', panelX + 20, panelY + 20);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(
      (panelKg || 0).toLocaleString(),
      panelX + panelW - 4,
      panelY + 9,
      { align: 'right' }
    );
    doc.text(
      (panelCajas || 0).toLocaleString(),
      panelX + panelW - 4,
      panelY + 20,
      { align: 'right' }
    );

    const boxIcon = await loadImageAsDataURL('/icons/box.jpg');
    const kgIcon = await loadImageAsDataURL('/icons/kg.png');

    if (kgIcon) doc.addImage(kgIcon, 'PNG', panelX + 5, panelY + 2, 12, 12);
    if (boxIcon) doc.addImage(boxIcon, 'JPG', panelX + 5, panelY + 13, 12, 12);

    y = panelY + panelH + 10;

    // Detalle por tipo
    const grupos = {};
    (productos || []).forEach((p) => {
      const claveGrupo = getTipoKeyFromProducto(p);
      if (!grupos[claveGrupo]) grupos[claveGrupo] = [];
      grupos[claveGrupo].push(p);
    });

    let totalGeneralKg = 0;
    let totalGeneralImporte = 0;
    let totalGeneralCajas = 0;

    for (const tituloGrupo in grupos) {
      const items = grupos[tituloGrupo];

      let subtotalKg = 0;
      let subtotalImporte = 0;
      let subtotalCajas = 0;

      items.forEach((p) => {
        const kg = Number(p.kg ?? p.cantidad ?? 0) || 0;
        const cajas = Number(p.cajas ?? 0) || 0;
        const precio = Number(p.precio_unitario ?? p.precio ?? 0) || 0;
        const importe = Number(p.importe ?? kg * precio) || 0;

        subtotalKg += kg;
        subtotalCajas += cajas;
        subtotalImporte += importe;
      });

      if ((!subtotalCajas || subtotalCajas === 0) && cajasPorTipo[tituloGrupo] != null) {
        subtotalCajas = cajasPorTipo[tituloGrupo];
      }

      totalGeneralKg += subtotalKg;
      totalGeneralCajas += subtotalCajas;
      totalGeneralImporte += subtotalImporte;

      // Título del tipo
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(46, 125, 50);
      doc.text(`Tipo: ${tituloGrupo}`, margin, y + 5);
      doc.setTextColor(0);

      // Resumen de cajas y kilos ARRIBA de la tabla
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(
        `Cajas: ${subtotalCajas.toLocaleString()}   Kilos: ${subtotalKg.toLocaleString()}`,
        pageW - margin,
        y + 5,
        { align: 'right' }
      );

      y += 10;

      // === TABLA (sin columna de cajas) ===
      autoTable(doc, {
        startY: y,
        head: [['Cantidad (kg)', 'Descripción', 'Precio unitario', 'Importe']],
        body: items.map((p) => {
          const kg = Number(p.kg ?? p.cantidad ?? 0) || 0;
          const precio = Number(p.precio_unitario ?? p.precio ?? 0) || 0;
          const importe = Number(p.importe ?? kg * precio) || 0;
          const descripcion = String(
            p.descripcion ?? p.calibre ?? p.tipo ?? '-'
          );
          return [
            kg.toFixed(0),
            descripcion,
            money(precio),
            money(importe),
          ];
        }),
        styles: { fontSize: 10, cellPadding: 2 },
        headStyles: { fillColor: [46, 125, 50], textColor: 255 },
        alternateRowStyles: { fillColor: [238, 245, 238] },
        columnStyles: {
          0: { halign: 'right', cellWidth: 25 },
          1: { cellWidth: 'auto' },
          2: { halign: 'right', cellWidth: 30 },
          3: { halign: 'right', cellWidth: 30 },
        },
        theme: 'striped',
        margin: { left: margin, right: margin },
      });

      y = doc.lastAutoTable.finalY + 6;

      // Subtotal ABAJO: solo dinero
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(
        `Subtotal ${tituloGrupo}: ${money(subtotalImporte)}`,
        pageW - margin,
        y,
        { align: 'right' }
      );
      y += 10;
    }

    const anticipo = parseFloat(venta.anticipo || 0);
    const saldo = totalGeneralImporte - anticipo;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(
      `Total General: ${money(totalGeneralImporte)}`,
      pageW - margin,
      y + 4,
      { align: 'right' }
    );

    if (anticipo > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(`Anticipo: ${money(anticipo)}`, pageW - margin, y + 10, {
        align: 'right',
      });
      doc.setFont('helvetica', 'bold');
      doc.text(`Saldo Pendiente: ${money(saldo)}`, pageW - margin, y + 16, {
        align: 'right',
      });
    }

    const pageCount = doc.getNumberOfPages();
    const fechaHoy = fmtFecha(new Date());
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(
        `Documento generado automáticamente por el sistema EMPAQUE RAMÍREZ — ${fechaHoy}`,
        margin,
        pageH - 8
      );
      doc.text(`Página ${i} de ${pageCount}`, pageW - margin, pageH - 8, {
        align: 'right',
      });
    }

    doc.save(`nota_compra_${fmtFolio(venta.numero_nota)}.pdf`);

    // Marcar como revisada POR ESTE USUARIO
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const email = userData?.user?.email;
      if (!userError && email && venta.id != null) {
        const { error: upsertError } = await supabase
          .from('ventas_revision')
          .upsert(
            {
              venta_id: venta.id,
              user_email: email,
              revisada: true,
            },
            { onConflict: 'venta_id,user_email' }
          );
        if (upsertError) {
          console.warn('Error marcando venta revisada:', upsertError.message);
        } else {
          // Esta venta se marca como revisada SOLO para este usuario
          setVentasRevisadas((prev) => ({
            ...prev,
            [venta.id]: true,
          }));
          setRevisoresPorVenta((prev) => {
            const arr = prev[venta.id] ? [...prev[venta.id]] : [];
            if (!arr.includes(email)) arr.push(email);
            return { ...prev, [venta.id]: arr };
          });
        }
      }
    } catch (e) {
      console.warn('Error general marcando venta revisada:', e);
    }
  };

  // Rango por día
  function addDaysStr(ymd, days) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(y, m - 1, d + days);
    const yyyy = dt.getFullYear();
    const mm   = String(dt.getMonth() + 1).padStart(2, '0');
    const dd   = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  const rango = useMemo(() => {
    const desdeFecha = fecha;
    const hastaFecha = addDaysStr(fecha, 1);
    const desdeTS = `${desdeFecha} 00:00:00`;
    const hastaTS = `${hastaFecha} 00:00:00`;
    return { desdeFecha, hastaFecha, desdeTS, hastaTS };
  }, [fecha]);

  // Cargar revisadas + revisores por venta
  const cargarRevisadas = async (ventasArr) => {
    try {
      if (!ventasArr || ventasArr.length === 0) {
        setVentasRevisadas({});
        setRevisoresPorVenta({});
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      const currentEmail = userData?.user?.email || null;

      // guardamos el correo del usuario logueado para usarlo en la UI
      setCorreoActual(currentEmail);

      const ids = ventasArr.map((v) => v.id);
      const { data: revData, error: revError } = await supabase
        .from('ventas_revision')
        .select('venta_id, user_email')
        .in('venta_id', ids);

      if (revError) {
        console.warn('Error cargando ventas_revision:', revError.message);
        setVentasRevisadas({});
        setRevisoresPorVenta({});
        return;
      }

      const revisadasMap = {};
      const revisoresMap = {};

      (revData || []).forEach((r) => {
        if (!revisoresMap[r.venta_id]) revisoresMap[r.venta_id] = new Set();
        if (r.user_email) revisoresMap[r.venta_id].add(r.user_email);
        // Solo marcamos la venta como revisada para el usuario actual
        if (currentEmail && r.user_email === currentEmail) {
          revisadasMap[r.venta_id] = true;
        }
      });

      const finalRevisores = {};
      Object.entries(revisoresMap).forEach(([ventaId, set]) => {
        finalRevisores[ventaId] = Array.from(set);
      });

      setVentasRevisadas(revisadasMap);
      setRevisoresPorVenta(finalRevisores);
    } catch (e) {
      console.warn('Error general cargando revisadas:', e);
      setVentasRevisadas({});
      setRevisoresPorVenta({});
    }
  };

  // Carga de datos según tab/día
  useEffect(() => {
    const load = async () => {
      setMensaje('');

      if (tab === 'ventas') {
        const { data, error } = await supabase
          .from('ventas')
          .select('*')
          .gte('fecha', rango.desdeFecha)
          .lt('fecha', rango.hastaFecha)
          .order('fecha', { ascending: false });
        if (error) setMensaje('❌ Error cargando ventas: ' + error.message);
        else {
          const arr = data || [];
          setVentas(arr);
          await cargarRevisadas(arr);
        }
      }

      if (tab === 'recepciones') {
        const { data, error } = await supabase
          .from('recepciones')
          .select('*')
          .gte('fecha_hora', rango.desdeTS)
          .lt('fecha_hora', rango.hastaTS)
          .order('fecha_hora', { ascending: false });
        if (error) setMensaje('❌ Error cargando recepciones: ' + error.message);
        else setRecepciones(data || []);
      }

      if (tab === 'clasificacion') {
        const { data, error } = await supabase
          .from('clasificacion')
          .select('*')
          .gte('fecha', rango.desdeFecha)
          .lt('fecha', rango.hastaFecha)
          .order('fecha', { ascending: false });
        if (error) setMensaje('❌ Error cargando clasificaciones: ' + error.message);
        else setClasificacion(data || []);
      }
    };
    load();
  }, [tab, rango]);

  const startEdit = (tabla, row) => setEdit({ tabla, id: row.id, data: { ...row } });
  const cancelEdit = () => setEdit({ tabla: null, id: null, data: {} });

  const saveEdit = async () => {
    const { tabla, id, data } = edit;
    if (!tabla || !id) return;
    const { error } = await supabase.from(tabla).update({ ...data, created_at: undefined }).eq('id', id);
    if (error) {
      setMensaje('❌ Error al guardar: ' + error.message);
      return;
    }
    setMensaje('✅ Cambios guardados.');
    cancelEdit();

    if (tabla === 'ventas') {
      const { data } = await supabase
        .from('ventas')
        .select('*')
        .gte('fecha', rango.desdeFecha)
        .lt('fecha', rango.hastaFecha)
        .order('fecha', { ascending: false });
      const arr = data || [];
      setVentas(arr);
      await cargarRevisadas(arr);
    }
    if (tabla === 'recepciones') {
      const { data } = await supabase
        .from('recepciones')
        .select('*')
        .gte('fecha_hora', rango.desdeTS)
        .lt('fecha_hora', rango.hastaTS)
        .order('fecha_hora', { ascending: false });
      setRecepciones(data || []);
    }
    if (tabla === 'clasificacion') {
      const { data } = await supabase
        .from('clasificacion')
        .select('*')
        .gte('fecha', rango.desdeFecha)
        .lt('fecha', rango.hastaFecha)
        .order('fecha', { ascending: false });
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

  const rowStyle = (i, hovered) => ({
    background: hovered ? '#eaf5ea' : i % 2 ? '#f5fbf5' : '#ffffff',
    transition: 'background 0.15s ease',
  });

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
          rows: [],
        });
      }
      const g = map.get(key);
      g.rows.push(r);
      g.total_kilos += Number(r.kilos || 0);
      if (new Date(r.fecha_hora) < new Date(g.fecha_hora)) g.fecha_hora = r.fecha_hora;
    }
    return Array.from(map.values()).sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));
  }, [recepciones]);

  const gruposClas = useMemo(() => {
    const map = new Map();
    for (const c of clasificacion) {
      const key = c.recepcion_id != null ? `rec-${c.recepcion_id}` : c.entrega_id ? `ent-${c.entrega_id}` : `cls-${c.id}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          recepcion_id: c.recepcion_id ?? null,
          entrega_id: c.entrega_id ?? null,
          cliente_nombre: c.cliente_nombre,
          fecha: c.fecha,
          total_cajas: 0,
          total_kg: 0,
          rows: [],
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

  const [openGroup, setOpenGroup] = useState({});
  const toggleGroup = (k) => setOpenGroup((o) => ({ ...o, [k]: !o[k] }));

  // EXCEL helpers
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
        created_at: v.created_at,
      });

      for (const p of productos) {
        detalleOut.push({
          venta_id: v.id,
          numero_nota: v.numero_nota,
          kg: p.kg ?? p.cantidad ?? 0,
          descripcion: p.descripcion ?? p.calibre ?? '',
          precio_unitario: p.precio_unitario ?? p.precio ?? 0,
          importe: p.importe ?? 0,
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

    toSheet(
      book,
      'Recepciones',
      (recepArr || []).map((r) => ({
        id: r.id,
        fecha_hora: r.fecha_hora,
        cliente_nombre: r.cliente_nombre,
        kilos: r.kilos,
        tipo: r.tipo,
        telefono_cliente: r.telefono_cliente,
        entrega_id: r.entrega_id,
      }))
    );

    toSheet(
      book,
      'Clasificacion',
      (clasifArr || []).map((c) => ({
        id: c.id,
        fecha: c.fecha,
        cliente_nombre: c.cliente_nombre,
        calibre: c.calibre,
        cajas: c.cajas,
        kg: c.kg,
        finalizado: c.finalizado,
        recepcion_id: c.recepcion_id,
        entrega_id: c.entrega_id,
      }))
    );

    XLSX.writeFile(book, nombre);
  }

  const exportarExcelDia = async () => {
    try {
      const { desdeFecha, hastaFecha, desdeTS, hastaTS } = rango;

      const [{ data: v }, { data: r }, { data: c }] = await Promise.all([
        supabase
          .from('ventas')
          .select('*')
          .gte('fecha', desdeFecha)
          .lt('fecha', hastaFecha)
          .order('fecha', { ascending: false }),

        supabase
          .from('recepciones')
          .select('*')
          .gte('fecha_hora', desdeTS)
          .lt('fecha_hora', hastaTS)
          .order('fecha_hora', { ascending: false }),

        supabase
          .from('clasificacion')
          .select('*')
          .gte('fecha', desdeFecha)
          .lt('fecha', hastaFecha)
          .order('fecha', { ascending: false }),
      ]);

      downloadWorkbook(`Respaldo_${fecha}.xlsx`, v || [], r || [], c || []);
      setMensaje('✅ Exportación del día lista.');
    } catch (err) {
      console.error(err);
      setMensaje('❌ Error exportando el día: ' + (err?.message || err));
    }
  };

  const fetchAll = async (table, select = '*') => {
    const pageSize = 1000;
    let from = 0;
    let to = pageSize - 1;
    const all = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase.from(table).select(select).range(from, to).order('id', { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
      to += pageSize;
    }
    return all;
  };

  const exportarExcelTodo = async () => {
    if (!window.confirm('Esto exportará TODO el histórico. ¿Continuar?')) return;
    try {
      const [vAll, rAll, cAll] = await Promise.all([
        fetchAll('ventas', '*'),
        fetchAll('recepciones', '*'),
        fetchAll('clasificacion', '*'),
      ]);

      downloadWorkbook('Respaldo_COMPLETO.xlsx', vAll, rAll, cAll);
      setMensaje('✅ Exportación completa lista.');
    } catch (err) {
      console.error(err);
      setMensaje('❌ Error exportando TODO: ' + (err?.message || err));
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'Arial' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <h2 style={{ margin: 0, color: '#2e7d32' }}>Secretaría</h2>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label>
            <strong>Día:</strong>
          </label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ padding: '0.3rem' }} />

          <button onClick={exportarExcelDia} style={{ ...btnSecundario, backgroundColor: '#2e7d32' }}>
            ⬇️ Exportar (día)
          </button>
          <button onClick={exportarExcelTodo} style={{ ...btnSecundario, backgroundColor: '#00695c' }}>
            📦 Exportar TODO
          </button>
          <button onClick={() => navigate('/secretaria-flujo')} style={{ ...btnSecundario, backgroundColor: '#455a64' }}>
            ➕ Registrar compra
          </button>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              navigate('/login');
            }}
            style={btnCerrarSesion}
          >
            🔒 Cerrar sesión
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button onClick={() => setTab('recepciones')} style={tabBtn(tab === 'recepciones')}>
          Recepción
        </button>
        <button onClick={() => setTab('clasificacion')} style={tabBtn(tab === 'clasificacion')}>
          Clasificación
        </button>
        <button onClick={() => setTab('ventas')} style={tabBtn(tab === 'ventas')}>
          Compras
        </button>
      </div>

      {mensaje && (
        <p style={{ textAlign: 'center', color: mensaje.includes('❌') ? 'crimson' : 'green', marginTop: 10 }}>
          {mensaje}
        </p>
      )}

      {/* COMPRAS */}
      {tab === 'ventas' && (
        <>
                    {/* Tabla de PENDIENTES */}
          <div style={tableCard}>
            <div style={tableScroll}>
              <table style={tbl}>
                <thead>
                  <tr>
                    <th style={th}>Folio</th>
                    <th style={th}>Fecha</th>
                    <th style={th}>Cliente</th>
                    <th style={th}>Anticipo</th>
                    <th style={th}>Total</th>
                    <th style={th}>Estado</th>
                    <th style={th}>Revisó</th>
                    <th style={th}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {vistaCompras === 'revisadas' && (
                    <tr>
                      <td colSpan={8} style={{ ...td, textAlign: 'center', color: '#777' }}>
                        Pendientes ocultas (vista Revisadas).
                      </td>
                    </tr>
                  )}
                  {vistaCompras !== 'revisadas' && ventasPendientes.map((v, i) => {
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
                        <td style={td}>{fmtFecha(v.fecha)}</td>
                        <td style={td}>
                          {editing ? (
                            <Field
                              value={row.nombre_cliente}
                              onChange={(val) =>
                                setEdit((e) => ({ ...e, data: { ...e.data, nombre_cliente: val } }))
                              }
                            />
                          ) : (
                            v.nombre_cliente
                          )}
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>{money(v.anticipo || 0)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{money(v.total || 0)}</td>

                        {/* Estado para usuario actual */}
                        <td style={td}>
  {(() => {
    const lista = revisoresPorVenta[v.id] || [];
    const revisadaPorAlguien = lista.length > 0;

    return (
      <span
        style={{
          padding: '0.15rem 0.5rem',
          borderRadius: '999px',
          fontSize: '0.75rem',
          color: '#fff',
          backgroundColor: revisadaPorAlguien ? '#1565c0' : '#f9a825',
        }}
      >
        {revisadaPorAlguien ? 'Revisada por otro' : 'Pendiente'}
      </span>
    );
  })()}
</td>


                        {/* Quién la revisó (todos los correos, marcando el tuyo) */}
                        <td style={{ ...td, fontSize: '0.8rem', color: '#555' }}>
                          {(() => {
                            const lista = revisoresPorVenta[v.id] || [];
                            if (!lista.length) return '—';

                            return lista
                              .map((email) =>
                                correoActual && email === correoActual ? `${email} (tú)` : email
                              )
                              .join(', ');
                          })()}
                        </td>

                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          {editing ? (
                            <>
                              <button onClick={saveEdit} style={btnGuardar}>
                                💾
                              </button>
                              <button onClick={cancelEdit} style={btnCancelar}>
                                ✖
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={async () => await descargarPDF(v)} style={btnPDF}>
                                📄 PDF
                              </button>
                              <button onClick={() => startEdit('ventas', v)} style={btnEditar}>
                                ✏️
                              </button>
                              <button onClick={() => removeRow('ventas', v.id)} style={btnEliminar}>
                                🗑️
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {vistaCompras !== 'revisadas' && ventasPendientes.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ ...td, textAlign: 'center', color: '#777' }}>
                        No hay notas pendientes para este día.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

{/* Vista rápida */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => setVistaCompras('pendientes')}
              style={{
                ...btnToggleRevisadas,
                backgroundColor: vistaCompras === 'pendientes' ? '#2e7d32' : '#e0e0e0',
                color: vistaCompras === 'pendientes' ? '#fff' : '#333',
                fontWeight: 700,
              }}
            >
              Pendientes ({ventasPendientes.length})
            </button>

            <button
              type="button"
              onClick={() => setVistaCompras('revisadas')}
              style={{
                ...btnToggleRevisadas,
                backgroundColor: vistaCompras === 'revisadas' ? '#2e7d32' : '#e0e0e0',
                color: vistaCompras === 'revisadas' ? '#fff' : '#333',
                fontWeight: 700,
              }}
            >
              Revisadas ({ventasRevisadasSolo.length})
            </button>

            <button
              type="button"
              onClick={() => setVistaCompras('todas')}
              style={{
                ...btnToggleRevisadas,
                backgroundColor: vistaCompras === 'todas' ? '#2e7d32' : '#e0e0e0',
                color: vistaCompras === 'todas' ? '#fff' : '#333',
                fontWeight: 700,
              }}
            >
              Todas ({ventas.length})
            </button>
          </div>
          {/* Tarjetas de REVISADAS (colapsables + filtro por usuario) */}
          {vistaCompras !== 'pendientes' && ventasRevisadasSolo.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                  <div>
                  <h3 style={{ margin: '0 0 4px', color: '#2e7d32' }}>Notas revisadas</h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#555' }}>
                    {ventasRevisadasSolo.length} nota(s) revisada(s) para este día.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Mostrar/Ocultar solo aplica en vista 'todas' */}
                  {(vistaCompras === 'todas' || vistaCompras === 'revisadas') && (
                    <button
                      type="button"
                      onClick={() => setMostrarRevisadas((v) => !v)}
                      style={btnToggleRevisadas}
                    >
                      {mostrarRevisadas ? 'Ocultar notas revisadas' : 'Mostrar notas revisadas'}
                    </button>
                  )}

                  {/* Filtro compacto */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.85rem', color: '#555' }}>Buscar:</span>
                      <input
                        value={busquedaRevisadas}
                        onChange={(e) => setBusquedaRevisadas(e.target.value)}
                        placeholder="Folio o cliente..."
                        style={{
                          padding: '6px 10px',
                          borderRadius: 8,
                          border: '1px solid #cfcfcf',
                          fontSize: '0.85rem',
                          minWidth: 200,
                        }}
                      />
                      {busquedaRevisadas && (
                        <button
                          type="button"
                          onClick={() => setBusquedaRevisadas('')}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 8,
                            border: '1px solid #cfcfcf',
                            background: '#f5f5f5',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                          }}
                          title="Limpiar búsqueda"
                        >
                          Limpiar
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.85rem', color: '#555' }}>Filtrar:</span>
                    <select
                      value={filtroRevisadas}
                      onChange={(e) => setFiltroRevisadas(e.target.value)}
                      style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #cfcfcf', fontSize: '0.85rem' }}
                    >
                      <option value="todas">Todas</option>
                      {revisoresUnicos.map((email) => (
                        <option key={email} value={email}>
                          {email === correoActual ? `${email} (tú)` : email}
                        </option>
                      ))}
                    </select>
                  </div>
                  </div>
                </div>
              </div>

              {vistaCompras === 'revisadas' && !mostrarRevisadas && (
                <p style={{ margin: '8px 0 0', color: '#777', fontSize: '0.85rem' }}>
                  Notas revisadas ocultas. Presiona &quot;Mostrar notas revisadas&quot; para verlas.
                </p>
              )}

              {mostrarRevisadas &&
                (() => {
                  const listaTarjetas =
                    filtroRevisadas !== 'todas'
                      ? ventasRevisadasSolo.filter((v) =>
                          (revisoresPorVenta[v.id] || []).includes(filtroRevisadas)
                        )
                      : ventasRevisadasSolo;

                  const q = (busquedaRevisadas || '').trim().toLowerCase();

                  const listaTarjetasFiltrada = q
                    ? listaTarjetas.filter((v) => {
                        const folio = fmtFolio(v.numero_nota).toLowerCase();
                        const cliente = String(v.nombre_cliente || '').toLowerCase();
                        return folio.includes(q) || cliente.includes(q);
                      })
                    : listaTarjetas;

                  if (!listaTarjetasFiltrada.length) {
                    return (
                      <p
                        style={{
                          marginTop: 8,
                          fontSize: '0.85rem',
                          color: '#777',
                          fontStyle: 'italic',
                        }}
                      >
                        {filtroRevisadas === 'todas'
                          ? 'No hay notas revisadas en este día.'
                          : `No hay notas revisadas por ${filtroRevisadas} en este día.`}
                      </p>
                    );
                  }

                  return (
                    <div style={cardsGrid}>
                      {listaTarjetasFiltrada.map((v) => (
                        <div key={v.id} style={cardRevisada}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: 4,
                            }}
                          >
                            <span style={chipFolio}>Folio {fmtFolio(v.numero_nota)}</span>
                            <span style={chipEstadoRevisada}>Revisada</span>
                          </div>

                          <div style={{ fontWeight: 'bold', marginBottom: 2 }}>
                            {v.nombre_cliente}
                          </div>
                          <div
                            style={{
                              fontSize: '0.85rem',
                              color: '#555',
                              marginBottom: 6,
                            }}
                          >
                            {fmtFecha(v.fecha)}
                          </div>

                          <div style={{ fontSize: '0.9rem', marginBottom: 4 }}>
                            Total: <strong>{money(v.total || 0)}</strong>
                          </div>

                          <div style={{ fontSize: '0.8rem', color: '#777', minHeight: 18 }}>
                            {(() => {
                              const lista = revisoresPorVenta[v.id] || [];
                              if (!lista.length) return 'Revisada (sin correo registrado)';

                              return (
                                'Revisó: ' +
                                lista
                                  .map((email) =>
                                    correoActual && email === correoActual
                                      ? `${email} (tú)`
                                      : email
                                  )
                                  .join(', ')
                              );
                            })()}
                          </div>

                          <div
                            style={{
                              marginTop: 8,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <button
                              onClick={() => removeRow('ventas', v.id)}
                              style={btnCardDelete}
                            >
                              🗑️ Eliminar
                            </button>

                            <button
                              onClick={() => descargarPDF(v)}
                              style={btnCardPDF}
                            >
                              📄 Ver PDF
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
            </div>
          )}
        </>
      )}

      {/* RECEPCIONES */}
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
                    <tr style={groupRow} onClick={() => toggleGroup(g.key)}>
                      <td style={{ ...td, width: 28, textAlign: 'center', cursor: 'pointer' }}>
                        {openGroup[g.key] ? '▾' : '▸'}
                      </td>
                      <td style={{ ...td, fontWeight: 600 }}>{new Date(g.fecha_hora).toLocaleString()}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{g.cliente_nombre}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{g.total_kilos}</td>
                      <td style={{ ...td, color: '#555' }}>
                        {g.rows.length} partida{g.rows.length > 1 ? 's' : ''}
                        {openGroup[g.key] ? '' : ' — clic para ver'}
                      </td>
                      <td style={td}>{g.telefono_cliente || '-'}</td>
                      <td style={{ ...td, color: '#777' }}>—</td>
                    </tr>

                    {openGroup[g.key] &&
                      g.rows.map((r) => {
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
                                  onChange={(val) =>
                                    setEdit((e) => ({ ...e, data: { ...e.data, fecha_hora: val } }))
                                  }
                                />
                              ) : (
                                new Date(r.fecha_hora).toLocaleString()
                              )}
                            </td>
                            <td style={td}>
                              {editing ? (
                                <Field
                                  value={row.cliente_nombre}
                                  onChange={(val) =>
                                    setEdit((e) => ({ ...e, data: { ...e.data, cliente_nombre: val } }))
                                  }
                                />
                              ) : (
                                r.cliente_nombre
                              )}
                            </td>
                            <td style={td}>
                              {editing ? (
                                <Field
                                  type="number"
                                  value={row.kilos ?? ''}
                                  onChange={(val) =>
                                    setEdit((e) => ({
                                      ...e,
                                      data: { ...e.data, kilos: parseFloat(val) || null },
                                    }))
                                  }
                                />
                              ) : (
                                r.kilos
                              )}
                            </td>
                            <td style={td}>
                              {editing ? (
                                <Field
                                  value={row.tipo ?? ''}
                                  onChange={(val) =>
                                    setEdit((e) => ({ ...e, data: { ...e.data, tipo: val } }))
                                  }
                                />
                              ) : (
                                r.tipo
                              )}
                            </td>
                            <td style={td}>
                              {editing ? (
                                <Field
                                  value={row.telefono_cliente ?? ''}
                                  onChange={(val) =>
                                    setEdit((e) => ({
                                      ...e,
                                      data: { ...e.data, telefono_cliente: val },
                                    }))
                                  }
                                />
                              ) : (
                                r.telefono_cliente || '-'
                              )}
                            </td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                              {editing ? (
                                <>
                                  <button onClick={saveEdit} style={btnGuardar}>
                                    💾
                                  </button>
                                  <button onClick={cancelEdit} style={btnCancelar}>
                                    ✖
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => startEdit('recepciones', r)} style={btnEditar}>
                                    ✏️
                                  </button>
                                  <button onClick={() => removeRow('recepciones', r.id)} style={btnEliminar}>
                                    🗑️
                                  </button>
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

      {/* CLASIFICACIÓN */}
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
                    <tr style={groupRow} onClick={() => toggleGroup(g.key)}>
                      <td style={{ ...td, width: 28, textAlign: 'center', cursor: 'pointer' }}>
                        {openGroup[g.key] ? '▾' : '▸'}
                      </td>
                      <td style={{ ...td, fontWeight: 600 }}>{fmtFecha(g.fecha)}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{g.cliente_nombre}</td>
                      <td style={{ ...td, color: '#555' }}>
                        {g.rows.length} calibre{g.rows.length > 1 ? 's' : ''}
                        {openGroup[g.key] ? '' : ' — clic para ver'}
                      </td>
                      <td style={{ ...td, fontWeight: 600 }}>{g.total_cajas}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{g.total_kg}</td>
                      <td style={{ ...td, color: '#777' }}>—</td>
                    </tr>

                    {openGroup[g.key] &&
                      g.rows.map((c) => {
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
                                  onChange={(val) =>
                                    setEdit((e) => ({ ...e, data: { ...e.data, fecha: val } }))
                                  }
                                />
                              ) : (
                                fmtFecha(c.fecha)
                              )}
                            </td>
                            <td style={td}>
                              {editing ? (
                                <Field
                                  value={row.cliente_nombre}
                                  onChange={(val) =>
                                    setEdit((e) => ({
                                      ...e,
                                      data: { ...e.data, cliente_nombre: val },
                                    }))
                                  }
                                />
                              ) : (
                                c.cliente_nombre
                              )}
                            </td>
                            <td style={td}>
                              {editing ? (
                                <Field
                                  value={row.calibre ?? ''}
                                  onChange={(val) =>
                                    setEdit((e) => ({ ...e, data: { ...e.data, calibre: val } }))
                                  }
                                />
                              ) : (
                                c.calibre || '-'
                              )}
                            </td>
                            <td style={td}>
                              {editing ? (
                                <Field
                                  type="number"
                                  value={row.cajas ?? ''}
                                  onChange={(val) =>
                                    setEdit((e) => ({
                                      ...e,
                                      data: { ...e.data, cajas: parseInt(val || '0', 10) },
                                    }))
                                  }
                                />
                              ) : (
                                c.cajas
                              )}
                            </td>
                            <td style={td}>
                              {editing ? (
                                <Field
                                  type="number"
                                  value={row.kg ?? ''}
                                  onChange={(val) =>
                                    setEdit((e) => ({ ...e, data: { ...e.data, kg: parseFloat(val) || 0 } }))
                                  }
                                />
                              ) : (
                                c.kg
                              )}
                            </td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                              {editing ? (
                                <>
                                  <button onClick={saveEdit} style={btnGuardar}>
                                    💾
                                  </button>
                                  <button onClick={cancelEdit} style={btnCancelar}>
                                    ✖
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => startEdit('clasificacion', c)} style={btnEditar}>
                                    ✏️
                                  </button>
                                  <button onClick={() => removeRow('clasificacion', c.id)} style={btnEliminar}>
                                    🗑️
                                  </button>
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

/* estilos */
const tableCard = { marginTop: 16, borderRadius: 8, boxShadow: '0 2px 10px rgba(0,0,0,0.05)', overflow: 'hidden' };
const tableScroll = { maxHeight: '60vh', overflow: 'auto' };

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
  boxShadow: '0 2px 0 rgba(0,0,0,0.05)',
};
const td = { padding: '10px 12px', borderBottom: '1px solid #e6e6e6', verticalAlign: 'middle' };

const groupRow = { background: '#e8f5e9', borderTop: '1px solid #c8e6c9', borderBottom: '1px solid #c8e6c9', cursor: 'pointer' };
const detailRow = { background: '#fafafa' };

const btnSecundario = { padding: '0.4rem 0.8rem', backgroundColor: '#1976d2', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
const btnCerrarSesion = { padding: '0.4rem 0.8rem', backgroundColor: '#b71c1c', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
const btnPDF = { padding: '0.2rem 0.5rem', background: '#2e7d32', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginRight: 6 };
const btnEditar = { padding: '0.2rem 0.5rem', background: '#0288d1', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginRight: 6 };
const btnEliminar = { padding: '0.2rem 0.5rem', background: '#c62828', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' };
const btnGuardar = { padding: '0.2rem 0.5rem', background: '#2e7d32', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginRight: 6 };
const btnCancelar = { padding: '0.2rem 0.5rem', background: '#737373', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' };
const btnToggleRevisadas = {
  padding: '0.25rem 0.7rem',
  background: '#eeeeee',
  border: '1px solid #bdbdbd',
  borderRadius: 999,
  cursor: 'pointer',
  fontSize: '0.8rem',
};

const tabBtn = (active) => ({
  padding: '0.5rem 0.9rem',
  background: active ? '#2e7d32' : '#e0e0e0',
  color: active ? '#fff' : '#333',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
});

/* grid de tarjetas revisadas */
const cardsGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: '12px',
};

const cardRevisada = {
  border: '1px solid #dcedc8',
  borderRadius: 8,
  padding: '10px 12px',
  background: '#f9fff4',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
};

const chipFolio = {
  fontSize: '0.8rem',
  background: '#e0f2f1',
  padding: '2px 8px',
  borderRadius: 999,
  color: '#006064',
};

const chipEstadoRevisada = {
  fontSize: '0.75rem',
  background: '#2e7d32',
  color: '#fff',
  padding: '2px 8px',
  borderRadius: 999,
};

const btnCardPDF = {
  padding: '0.25rem 0.6rem',
  background: '#2e7d32',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: '0.8rem',
};

const btnCardDelete = {
  padding: '0.25rem 0.6rem',
  background: '#c62828',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: '0.8rem',
};