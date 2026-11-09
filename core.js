/* Flamingo Vinoteca — lógica de negocio (versión web). Misma lógica que la versión de escritorio.
   Los datos son «hojas» (listas de filas) con las mismas columnas que el Excel. Las fechas se guardan como texto ISO. */
"use strict";

const CATEGORIAS = ["Whisky", "Vino tinto", "Vino blanco", "Espumante", "Licores"];
const MEDIOS_PAGO = ["Efectivo", "Débito", "Crédito", "Transferencia", "Mercado Pago"];
const IMPUESTOS_FIJOS = [["Flete", 5.0], ["Percepción de IVA", 3.0], ["IIBB", 4.0], ["IVA", 21.0]];
const INTERNO_MAX = 30.0;

const HOJAS = {
  "Productos": ["Nombre de producto", "Categoría", "Costo", "Precio de venta", "Stock", "Impuesto interno %", "Costo final"],
  "Compras": ["Fecha", "Proveedor", "N° Factura", "Producto", "Cantidad", "Costo unitario", "Subtotal", "ID Factura"],
  "Ventas": ["Fecha", "N° Venta", "Producto", "Categoría", "Cantidad", "Precio unitario", "Subtotal", "Medio de pago"],
  "Movimientos": ["Fecha", "Producto", "Tipo", "Cantidad", "Stock resultante", "Detalle"],
  "Facturas": ["ID", "Fecha", "Vencimiento", "Proveedor", "N° Factura", "Neto", "IVA", "Percepción IVA", "IIBB",
    "Imp. interno", "Flete", "Total", "Pagado", "Notas", "Archivo"],
  "Pagos": ["Fecha", "ID Factura", "Proveedor", "N° Factura", "Monto", "Medio de pago", "Nota"],
  "Proveedores": ["Proveedor", "Teléfono", "Email", "CUIT", "Notas"],
};
const ANCHOS = {
  "Productos": [38, 16, 14, 16, 10, 20, 14], "Compras": [12, 26, 18, 38, 10, 16, 14, 12],
  "Ventas": [12, 10, 38, 16, 10, 16, 14, 16], "Movimientos": [18, 38, 22, 10, 16, 40],
  "Facturas": [6, 12, 13, 26, 18, 16, 14, 16, 14, 14, 12, 16, 14, 30, 30], "Pagos": [12, 11, 26, 18, 16, 16, 30],
  "Proveedores": [30, 18, 30, 16, 40],
};
/* columnas que contienen fechas, por hoja (para formatear / importar / exportar) */
const COL_FECHAS = { Compras: [0], Ventas: [0], Movimientos: [0], Facturas: [1, 2], Pagos: [0] };

const r2 = x => Math.round((x + Number.EPSILON * Math.sign(x)) * 100) / 100;
const cf = s => String(s == null ? "" : s).trim().toLowerCase();
const ERR = msg => { throw new Error(msg); };

function calcularCosto(neto, interno) {
  neto = Number(neto || 0); interno = Number(interno || 0);
  if (!(interno >= 0 && interno <= INTERNO_MAX)) ERR(`El impuesto interno debe estar entre 0 y ${INTERNO_MAX} %.`);
  const lineas = IMPUESTOS_FIJOS.map(([n, p]) => [n, p, r2(neto * p / 100)]);
  if (interno) lineas.push(["Impuesto interno", interno, r2(neto * interno / 100)]);
  return { neto, lineas, total: r2(neto + lineas.reduce((a, l) => a + l[2], 0)) };
}

/* ---------------- utilidades ---------------- */
function parseNum(v) {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  let s = String(v).trim().replace(/\$/g, "").replace(/[  ]/g, "");
  if (!s) return 0;
  const neg = s.startsWith("-");
  s = s.replace(/^-+/, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(/,/g, ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) s = s.replace(/,/g, ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) ERR(`Número inválido: ${v}`);
  const x = parseFloat(s);
  return neg ? -x : x;
}
const numero = v => { const x = Number(v); if (!Number.isFinite(x)) ERR(`Número inválido: ${v}`); return x; };

const pad2 = n => String(n).padStart(2, "0");
function hoyISO(d = new Date()) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function ahoraISO() { const d = new Date(); return `${hoyISO(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; }
function fechaValida(y, m, d) { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; }
function parseFecha(txt) {
  txt = String(txt == null ? "" : txt).trim();
  if (!txt) return hoyISO();
  let m = txt.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else {
    m = txt.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (!m) ERR("Fecha inválida. Usá dd/mm/aaaa.");
    y = +m[3] + (+m[3] < 100 ? 2000 : 0); mo = +m[2]; d = +m[1];
  }
  if (!fechaValida(y, mo, d)) ERR("Fecha inválida. Usá dd/mm/aaaa.");
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}
/* texto/ISO -> 'AAAA-MM-DD' o null */
function aFecha(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  try { return parseFecha(s); } catch (e) { return null; }
}
function fmtFecha(v) {
  if (v == null || v === "") return "";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return String(v);
  const base = `${m[3]}/${m[2]}/${m[1]}`;
  return m[4] && (+m[4] || +m[5]) ? `${base} ${m[4]}:${m[5]}` : base;
}
const dias = iso => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
function _m(n) {
  const [e, d] = Math.abs(n).toFixed(2).split(".");
  return (n < 0 ? "-" : "") + "$ " + e.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + d;
}

/* ---------------- base de datos ---------------- */
class DB {
  constructor(hojas) {
    this.d = {};
    for (const n of Object.keys(HOJAS)) this.d[n] = ((hojas || {})[n] || []).map(r => r.slice());
  }
  static vacia() { return { version: 1, hojas: Object.fromEntries(Object.keys(HOJAS).map(n => [n, []])) }; }

  _buscar(hoja, nombre, col = 0) {
    const k = cf(nombre);
    return this.d[hoja].findIndex(r => r[col] != null && r[col] !== "" && cf(r[col]) === k);
  }
  _mov(producto, tipo, cant, stock, detalle = "") { this.d.Movimientos.push([ahoraISO(), producto, tipo, cant, stock, detalle]); }

  /* --- productos */
  productos() {
    return this.d.Productos.filter(r => r && r[0]).map(r => {
      const costo = parseNum(r[2]), interno = parseNum(r[5]);
      return { nombre: String(r[0]).trim(), categoria: r[1] || "", costo, precio: parseNum(r[3]), stock: parseNum(r[4]),
        interno, costo_final: calcularCosto(costo, interno).total };
    });
  }
  guardarProducto(nombre, categoria, costo, precio, stock = 0, original = null, interno = null) {
    nombre = String(nombre || "").trim();
    if (!nombre) ERR("Falta el nombre del producto.");
    if (!CATEGORIAS.includes(categoria)) ERR("Elegí una categoría.");
    if (costo < 0 || precio < 0) ERR("Costo y precio no pueden ser negativos.");
    const final = calcularCosto(costo, interno).total;
    interno = interno ? Number(interno) : null;
    const P = this.d.Productos;
    if (original == null) {
      if (this._buscar("Productos", nombre) >= 0) ERR("Ya existe un producto con ese nombre.");
      P.push([nombre, categoria, costo, precio, stock, interno, final]);
      if (stock) this._mov(nombre, "Stock inicial", stock, stock, "Alta de producto");
    } else {
      const fila = this._buscar("Productos", original);
      if (fila < 0) ERR("No se encontró el producto.");
      const otra = this._buscar("Productos", nombre);
      if (otra >= 0 && otra !== fila) ERR("Ya existe otro producto con ese nombre.");
      const r = P[fila]; r[0] = nombre; r[1] = categoria; r[2] = costo; r[3] = precio; r[5] = interno; r[6] = final;
    }
  }
  eliminarProducto(nombre) { const f = this._buscar("Productos", nombre); if (f >= 0) this.d.Productos.splice(f, 1); }

  /* --- stock */
  ajustarStock(nombre, cantidad, modo = "sumar", detalle = "") {
    const f = this._buscar("Productos", nombre);
    if (f < 0) ERR("Producto no encontrado.");
    const r = this.d.Productos[f], actual = parseNum(r[4]);
    let nuevo, tipo, mov;
    if (modo === "sumar") {
      if (cantidad <= 0) ERR("La cantidad debe ser mayor a 0.");
      nuevo = actual + cantidad; tipo = "Carga de stock"; mov = cantidad;
    } else {
      if (cantidad < 0) ERR("El stock no puede ser negativo.");
      nuevo = cantidad; tipo = "Ajuste de inventario"; mov = cantidad - actual;
    }
    r[4] = nuevo;
    this._mov(r[0], tipo, mov, nuevo, detalle);
  }

  /* --- proveedores */
  _facts() { return this.d.Facturas.filter(r => r && r[0] != null && r[0] !== "").map(r => this._facturaDict(r)); }
  proveedores() {
    const facts = this._facts(), datos = new Map();
    for (const r of this.d.Proveedores) {
      if (r && r[0]) {
        const n = String(r[0]).trim();
        datos.set(cf(n), { nombre: n, telefono: String(r[1] || ""), email: String(r[2] || ""), cuit: String(r[3] || ""), notas: String(r[4] || "") });
      }
    }
    for (const f of facts) if (f.proveedor && !datos.has(cf(f.proveedor)))
      datos.set(cf(f.proveedor), { nombre: f.proveedor, telefono: "", email: "", cuit: "", notas: "" });
    for (const p of datos.values()) {
      const mias = facts.filter(f => cf(f.proveedor) === cf(p.nombre));
      p.debo = r2(mias.reduce((a, f) => a + f.saldo, 0));
      p.facturas = mias.length;
      p.pendientes = mias.filter(f => f.saldo > 0.005).length;
    }
    return [...datos.values()].sort((a, b) => cf(a.nombre).localeCompare(cf(b.nombre), "es"));
  }
  guardarProveedor(nombre, telefono = "", email = "", cuit = "", notas = "", original = null) {
    nombre = String(nombre || "").trim();
    if (!nombre) ERR("Falta el nombre del proveedor.");
    const W = this.d.Proveedores;
    const filaNueva = this._buscar("Proveedores", nombre);
    const fila = original ? this._buscar("Proveedores", original) : -1;
    if (original == null || fila < 0) {
      if (filaNueva >= 0 && (original == null || cf(original) !== cf(nombre))) ERR("Ya existe un proveedor con ese nombre.");
      W.push([nombre, telefono, email, cuit, notas]);
    } else {
      if (filaNueva >= 0 && filaNueva !== fila) ERR("Ya existe otro proveedor con ese nombre.");
      W[fila] = [nombre, telefono, email, cuit, notas];
    }
    if (original && cf(original) !== cf(nombre)) {  // el cambio de nombre alcanza a sus facturas
      for (const [hoja, col] of [["Facturas", 3], ["Pagos", 2], ["Compras", 1]])
        for (const r of this.d[hoja]) if (r[col] && cf(r[col]) === cf(original)) r[col] = nombre;
    }
  }
  eliminarProveedor(nombre) {
    const n = this._facts().filter(f => cf(f.proveedor) === cf(nombre)).length;
    if (n) ERR(`«${nombre}» tiene ${n} factura(s) cargada(s). Eliminá primero esas facturas.`);
    const f = this._buscar("Proveedores", nombre);
    if (f >= 0) this.d.Proveedores.splice(f, 1);
  }

  /* --- facturas de compra */
  _facturaDict(r) {
    r = r.slice(); while (r.length < 15) r.push(null);
    const hoy = hoyISO(), fecha = aFecha(r[1]), vence = aFecha(r[2]);
    const total = parseNum(r[11]), pagado = parseNum(r[12]);
    const saldo = r2(Math.max(total - pagado, 0));
    const dv = (vence && saldo > 0.005) ? dias(vence) - dias(hoy) : null;
    const estado = saldo <= 0.005 ? "pagada" : (vence && vence < hoy ? "vencida" : "pendiente");
    return { id: Math.trunc(parseNum(r[0])), fecha: fmtFecha(fecha), fecha_iso: fecha || "", vence: fmtFecha(vence), vence_iso: vence || "",
      dias_venc: dv, proveedor: String(r[3] || "").trim(), factura: String(r[4] || "").trim(),
      neto: parseNum(r[5]), iva: parseNum(r[6]), percepcion_iva: parseNum(r[7]), iibb: parseNum(r[8]),
      interno: parseNum(r[9]), flete: parseNum(r[10]), total, pagado, saldo, estado, notas: String(r[13] || ""), archivo: String(r[14] || "") };
  }
  _filaFactura(id) {
    const i = this.d.Facturas.findIndex(r => r[0] != null && r[0] !== "" && Math.trunc(parseNum(r[0])) === Math.trunc(Number(id)));
    if (i < 0) ERR("No se encontró la factura.");
    return i;
  }
  facturas(proveedor) {
    let out = this._facts();
    if (proveedor) out = out.filter(f => cf(f.proveedor) === cf(proveedor));
    return out;
  }
  factura(id) {
    const f = this._facturaDict(this.d.Facturas[this._filaFactura(id)]);
    id = Math.trunc(Number(id));
    f.lineas = this.d.Compras.filter(r => r[7] != null && r[7] !== "" && Math.trunc(parseNum(r[7])) === id)
      .map(r => ({ producto: String(r[3] || ""), cantidad: parseNum(r[4]), precio: parseNum(r[5]), subtotal: parseNum(r[6]) }));
    f.pagos = this.d.Pagos.filter(r => r[1] != null && r[1] !== "" && Math.trunc(parseNum(r[1])) === id)
      .map(r => ({ fecha: fmtFecha(r[0]), monto: parseNum(r[4]), medio: String(r[5] || ""), nota: String(r[6] || "") }));
    return f;
  }
  static _importes(imp) {
    const o = {};
    for (const k of ["neto", "iva", "percepcion_iva", "iibb", "interno", "flete", "total"]) o[k] = parseNum((imp || {})[k]);
    return o;
  }
  _validarFactura(proveedor, nro, fecha, vence, ignorarId = null) {
    if (!proveedor) ERR("Elegí o escribí el proveedor.");
    if (vence && vence < fecha) ERR("El vencimiento no puede ser anterior a la fecha de emisión.");
    if (nro) for (const f of this._facts())
      if (f.id !== ignorarId && cf(f.proveedor) === cf(proveedor) && cf(f.factura) === cf(nro)) ERR(`Ya cargaste la factura ${nro} de ${proveedor}.`);
  }
  _siguienteId() {
    let max = 0;
    for (const [hoja, col] of [["Facturas", 0], ["Compras", 7], ["Pagos", 1]])
      for (const r of this.d[hoja]) if (r[col] != null && r[col] !== "") max = Math.max(max, Math.trunc(parseNum(r[col])));
    return max + 1;  // un ID nunca se reutiliza, aunque se haya borrado la factura
  }
  registrarFactura(fecha, vence, proveedor, nro, items, impuestos = null, notas = "", actualizarCostos = true) {
    proveedor = String(proveedor || "").trim(); nro = String(nro || "").trim();
    const imp = DB._importes(impuestos);
    items = items || [];
    if (!items.length && !(imp.neto || imp.total)) ERR("Cargá al menos un producto o los importes de la factura.");
    this._validarFactura(proveedor, nro, fecha, vence);
    const fid = this._siguienteId(), P = this.d.Productos;
    for (const it of items) {
      const desc = String(it.descripcion || it.nombre || "").trim();
      const cant = numero(it.cantidad), costo = numero(it.precio);
      if (cant <= 0) ERR(`Cantidad inválida en «${desc}».`);
      if (costo < 0) ERR(`Precio inválido en «${desc}».`);
      const vinc = (it.vinculado === undefined || it.vinculado) ? String(it.nombre || "").trim() : "";
      if (!vinc) {  // línea sin vincular: queda en el historial pero no toca stock ni costos
        this.d.Compras.push([fecha, proveedor, nro, desc, cant, costo, r2(cant * costo), fid]);
        continue;
      }
      let fila = this._buscar("Productos", vinc);
      if (fila < 0) {
        if (!CATEGORIAS.includes(it.categoria)) ERR(`Falta la categoría de «${vinc}».`);
        P.push([vinc, it.categoria, costo, 0, 0, null, calcularCosto(costo).total]);
        fila = P.length - 1;
      } else if (actualizarCostos) {
        P[fila][2] = costo;  // el costo queda con el de la última compra
        P[fila][6] = calcularCosto(costo, parseNum(P[fila][5])).total;
      }
      const stock = parseNum(P[fila][4]) + cant;
      P[fila][4] = stock;
      const nom = P[fila][0];
      this.d.Compras.push([fecha, proveedor, nro, nom, cant, costo, r2(cant * costo), fid]);
      this._mov(nom, "Compra", cant, stock, `Factura ${nro}`.trim());
    }
    const suma = r2(items.reduce((a, i) => a + Number(i.cantidad) * Number(i.precio), 0));
    const neto = imp.neto || suma;
    const otros = imp.iva + imp.percepcion_iva + imp.iibb + imp.interno + imp.flete;
    const total = imp.total || r2(neto + otros);
    this.d.Facturas.push([fid, fecha, vence || null, proveedor, nro, neto, imp.iva, imp.percepcion_iva, imp.iibb, imp.interno, imp.flete, total, 0, notas || null, null]);
    if (this._buscar("Proveedores", proveedor) < 0) this.d.Proveedores.push([proveedor, "", "", "", ""]);
    return fid;
  }
  actualizarFactura(id, fecha, vence, proveedor, nro, impuestos, notas = "") {
    proveedor = String(proveedor || "").trim(); nro = String(nro || "").trim();
    const imp = DB._importes(impuestos);
    const fila = this._filaFactura(id), wf = this.d.Facturas;
    const actual = this._facturaDict(wf[fila]);
    this._validarFactura(proveedor, nro, fecha, vence, Math.trunc(Number(id)));
    const neto = imp.neto || actual.neto;
    const otros = imp.iva + imp.percepcion_iva + imp.iibb + imp.interno + imp.flete;
    const total = imp.total || r2(neto + otros);
    if (total + 0.01 < actual.pagado) ERR(`El total (${_m(total)}) no puede ser menor a lo ya pagado (${_m(actual.pagado)}).`);
    const r = wf[fila];
    r[1] = fecha; r[2] = vence || null; r[3] = proveedor; r[4] = nro; r[5] = neto; r[6] = imp.iva; r[7] = imp.percepcion_iva;
    r[8] = imp.iibb; r[9] = imp.interno; r[10] = imp.flete; r[11] = total; r[13] = notas || null;
    if (cf(proveedor) !== cf(actual.proveedor) || nro !== actual.factura) {
      id = Math.trunc(Number(id));
      for (const [hoja, cp, cn, ci] of [["Pagos", 2, 3, 1], ["Compras", 1, 2, 7]])
        for (const x of this.d[hoja]) if (x[ci] != null && x[ci] !== "" && Math.trunc(parseNum(x[ci])) === id) { x[cp] = proveedor; x[cn] = nro; }
    }
    if (this._buscar("Proveedores", proveedor) < 0) this.d.Proveedores.push([proveedor, "", "", "", ""]);
  }
  registrarPago(id, monto, fecha = null, medio = "Efectivo", nota = "") {
    monto = r2(Number(monto));
    if (!(monto > 0)) ERR("El monto del pago debe ser mayor a 0.");
    if (!MEDIOS_PAGO.includes(medio)) ERR("Elegí un medio de pago.");
    const fila = this._filaFactura(id), r = this.d.Facturas[fila];
    const f = this._facturaDict(r);
    if (monto > f.saldo + 0.01) ERR(`El pago (${_m(monto)}) supera el saldo de la factura (${_m(f.saldo)}).`);
    r[12] = r2(f.pagado + monto);
    this.d.Pagos.push([fecha || hoyISO(), Math.trunc(Number(id)), f.proveedor, f.factura, monto, medio, nota || null]);
    return r2(f.saldo - monto);
  }
  eliminarFactura(id) {
    this.d.Facturas.splice(this._filaFactura(id), 1);
    id = Math.trunc(Number(id));
    this.d.Pagos = this.d.Pagos.filter(r => !(r[1] != null && r[1] !== "" && Math.trunc(parseNum(r[1])) === id));
  }
  adjuntarArchivo(id, nombre) { this.d.Facturas[this._filaFactura(id)][14] = nombre; }

  /* --- ventas */
  registrarVenta(fecha, medioPago, items) {
    if (!items || !items.length) ERR("La venta no tiene ítems.");
    const P = this.d.Productos, pedidos = new Map();
    for (const it of items) { const k = cf(it.nombre); pedidos.set(k, (pedidos.get(k) || 0) + numero(it.cantidad)); }
    for (const [k, total] of pedidos) {
      const f = this._buscar("Productos", k);
      if (f < 0) ERR(`El producto «${k}» no existe.`);
      const hay = parseNum(P[f][4]);
      if (hay < total) ERR(`Stock insuficiente de «${P[f][0]}» (hay ${hay}).`);
    }
    let n = 1;
    for (const r of this.d.Ventas) if (r[1]) n = Math.max(n, Math.trunc(parseNum(r[1])) + 1);
    for (const it of items) {
      const f = this._buscar("Productos", it.nombre), cant = numero(it.cantidad), precio = numero(it.precio);
      const stock = parseNum(P[f][4]) - cant;
      P[f][4] = stock;
      this.d.Ventas.push([fecha, n, P[f][0], P[f][1], cant, precio, r2(cant * precio), medioPago]);
      this._mov(P[f][0], "Venta", -cant, stock, `Venta N° ${n}`);
    }
    return n;
  }

  resumen(pocoStock = 3) {
    const hoy = hoyISO(), y = +hoy.slice(0, 4), m = +hoy.slice(5, 7);
    const ant = m === 1 ? [y - 1, 12] : [y, m - 1];
    const total = (hoja, col, anio, mes, colFecha = 0) => {
      let t = 0, hay = false;
      for (const r of this.d[hoja]) {
        const f = aFecha(r[colFecha]);
        if (f && +f.slice(0, 4) === anio && +f.slice(5, 7) === mes) { t += parseNum(r[col]); hay = true; }
      }
      return [t, hay];
    };
    const [v] = total("Ventas", 6, y, m), [vp, vpHay] = total("Ventas", 6, ant[0], ant[1]);
    const [c] = total("Facturas", 11, y, m, 1), [cp, cpHay] = total("Facturas", 11, ant[0], ant[1], 1);
    const prods = this.productos();
    const pend = this._facts().filter(f => f.saldo > 0.005);
    pend.sort((a, b) => ((a.dias_venc == null) - (b.dias_venc == null)) || ((a.dias_venc || 0) - (b.dias_venc || 0)) || (a.id - b.id));
    return {
      debo: r2(pend.reduce((a, f) => a + f.saldo, 0)), facturas_pendientes: pend.length,
      facturas_vencidas: pend.filter(f => f.estado === "vencida").length,
      para_pagar: pend.slice(0, 8).map(f => ({ proveedor: f.proveedor, factura: f.factura, saldo: f.saldo, dias_venc: f.dias_venc, estado: f.estado })),
      vendido: v, vendido_prev: vpHay ? vp : null, comprado: c, comprado_prev: cpHay ? cp : null,
      valor_stock: prods.reduce((a, p) => a + p.stock * p.costo, 0), productos: prods.length,
      sin_stock: prods.filter(p => p.stock <= 0), poco_stock: prods.filter(p => p.stock > 0 && p.stock <= pocoStock), poco_stock_limite: pocoStock,
    };
  }

  historial(hoja, limite = 500) {
    if (!HOJAS[hoja]) ERR("Hoja inválida.");
    const fc = COL_FECHAS[hoja] || [];
    const filas = this.d[hoja].filter(r => r && r.some(x => x != null && x !== ""))
      .map(r => HOJAS[hoja].map((_, i) => fc.includes(i) ? fmtFecha(r[i]) : (r[i] == null ? "" : r[i])));
    filas.reverse();
    return { cols: HOJAS[hoja], filas: filas.slice(0, limite) };
  }
}
if (typeof module !== "undefined") module.exports = { DB, calcularCosto, parseNum, parseFecha };
