/* Flamingo — lector de facturas (PDF y Word) en el navegador. Misma lógica que la versión de escritorio. */
"use strict";

const L = "\\p{L}\\p{N}_";  // «letra» para reemplazar \b con tildes
const SKIP = new RegExp(`(?<![${L}])(?:total|subtotal|iva|cuit|c\\.u\\.i\\.t|cae|fecha|factura|importe|descuento|percep[${L}]*|neto|gravado|` +
  `domicilio|tel[eé]fono|condici[oó]n|remito|se[ñn]or[${L}]*|cliente|vencimiento|ingresos brutos|` +
  `p[aá]gina|cantidad|descripci[oó]n|precio|bonif[${L}]*|ii\\.?bb|interno[${L}]*|flete|tributos?|exento)(?![${L}])`, "iu");
const NUM = /^-?\$?\d[\d.,]*$/;
const UNIDAD = /^(un|u|uni|unid|unidad|unidades|cj|caja|cajas|pack|pk|bot|botella|botellas|kg|kgs|lt|lts|l|ml|cc|doc|dz|x)\.?$/i;
const CODIGO = /^(?:\d{4,}|[A-Z]{1,3}[-.]?\d{2,6})\s+(?=\S)/;
const LETRAS = /[A-Za-zÁÉÍÓÚáéíóúñÑ]/g;
const lineas = t => t.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/);

function _n(tok) { try { return parseNum(tok); } catch (e) { return null; } }

function _elegir(nums) {  // (índice, cantidad, unitario) tal que cantidad × unitario ≈ total
  for (let i = 0; i < nums.length - 2; i++) {
    const [q, u, t] = nums.slice(i, i + 3);
    if (q > 0 && u > 0 && Math.abs(q * u - t) <= Math.max(0.02 * Math.abs(t), 0.05)) return [i, q, u];
  }
  if (nums.length === 2) return [0, nums[0], nums[1]];
  if (nums.length >= 3 && nums[nums.length - 3] > 0 && nums[nums.length - 3] <= 10000) return [nums.length - 3, nums[nums.length - 3], nums[nums.length - 2]];
  return null;
}
function _itemsTexto(texto) {
  const items = [];
  for (let linea of lineas(texto)) {
    linea = linea.trim();
    if (!linea || SKIP.test(linea)) continue;
    const toks = linea.replace(/\$/g, " ").split(/\s+/).filter(Boolean);
    let j = toks.length;
    const pos = [];  // posiciones de los números del final de la línea
    while (j > 0) {
      if (NUM.test(toks[j - 1])) { pos.unshift(j - 1); j--; }
      else if (pos.length && UNIDAD.test(toks[j - 1]) && j >= 2 && NUM.test(toks[j - 2])) j--;  // «UN», «CAJA»… entre cantidad y precio
      else break;
    }
    const cola = pos.map(i => toks[i]);
    if (cola.length < 2) continue;
    const nums = cola.map(_n);
    if (nums.includes(null)) continue;
    const el = _elegir(nums);
    if (!el) continue;
    const [idx, q, u] = el;
    const desc = toks.slice(0, pos[idx]).join(" ").trim().replace(CODIGO, "");
    if ((desc.match(LETRAS) || []).length >= 3 && q > 0 && u > 0) items.push({ nombre: desc, cantidad: q, precio: u });
  }
  return items;
}
function _itemsTablas(filas) {
  const items = [];
  for (const fila of filas) {
    const celdas = fila.map(c => String(c || "").replace(/\n/g, " ").trim()).filter(Boolean);
    if (celdas.length < 3) continue;
    const esNum = c => NUM.test(c.replace(/ /g, ""));
    const nums = celdas.filter(esNum).map(_n).filter(x => x !== null);
    const textos = celdas.filter(c => !esNum(c) && !c.includes("%"));
    if (nums.length < 2 || !textos.length) continue;
    const desc = textos.reduce((a, b) => b.length > a.length ? b : a);
    if (SKIP.test(desc) || (desc.match(LETRAS) || []).length < 3) continue;
    const el = _elegir(nums);
    if (el) items.push({ nombre: desc, cantidad: el[1], precio: el[2] });
  }
  return items;
}
function _meta(texto) {
  let fecha = "", factura = "", proveedor = "", vencimiento = "", m;
  const f3 = x => `${String(+x[1]).padStart(2, "0")}/${String(+x[2]).padStart(2, "0")}/${x[3]}`;
  if ((m = texto.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/))) fecha = f3(m);
  if ((m = texto.match(/(?:factura|comprobante|nro\.?|n[°º]|n\.º)\D{0,20}?(\d{4,5}\s*-\s*\d{6,8}|\d{6,})/i))) factura = m[1].replace(/\s+/g, "");
  if ((m = texto.match(/raz[oó]n social\s*[:\-]?\s*(.+)/i))) proveedor = m[1].trim().split(/\s{2,}|\t/)[0];
  else for (let l of lineas(texto).slice(0, 10)) {
    l = l.trim();
    if (l.length >= 3 && /[A-Za-z]/.test(l) && !/factura|original|duplicado|triplicado|cuit|c\.u\.i\.t|p[aá]gina|^\W*\d/i.test(l)) { proveedor = l; break; }
  }
  for (const l of lineas(texto)) {
    if (/vto\.?|venc/i.test(l) && !/\bc\.?a\.?e\b/i.test(l) && (m = l.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/))) { vencimiento = f3(m); break; }
  }
  return { fecha, factura, proveedor, vencimiento };
}

const _MONEY_SRC = "-?\\$?\\s*(?:\\d{1,3}(?:\\.\\d{3})+,\\d{2}|\\d{1,3}(?:,\\d{3})+\\.\\d{2}|\\d+[.,]\\d{2})(?!\\d)";
const _MONEY = new RegExp(_MONEY_SRC, "g"), _MONEY_FULL = new RegExp("^(?:" + _MONEY_SRC + ")$");
const _PCT = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/;
const sinTildes = t => t.toLowerCase().replace(/[áàä]/g, "a").replace(/[éèë]/g, "e").replace(/[íìï]/g, "i").replace(/[óòö]/g, "o").replace(/[úùü]/g, "u");
function _monto(linea) {
  const m = linea.replace(new RegExp(_PCT.source, "g"), " ").match(_MONEY);
  if (!m) return null;
  try { return parseNum(m[m.length - 1]); } catch (e) { return null; }
}
function extraerImpuestos(texto) {
  const res = { neto: null, iva: null, iva_detalle: [], percepcion_iva: null, iibb: null, interno: null, flete: null, total: null };
  const ls = lineas(texto).map(l => l.trim()).filter(Boolean);
  let subtotal = null;
  ls.forEach((linea, i) => {
    const t = sinTildes(linea);
    let monto = _monto(linea);
    if (monto === null && i + 1 < ls.length && _MONEY_FULL.test(ls[i + 1].trim())) monto = _monto(ls[i + 1]);
    if (monto === null) return;
    if (/perc\w*\.?\s*(de\s*)?i\.?v\.?a\b/.test(t)) res.percepcion_iva = (res.percepcion_iva || 0) + monto;
    else if (/ii\.?bb|ingresos\s+brutos|ing\.?\s+brutos/.test(t)) res.iibb = (res.iibb || 0) + monto;
    else if (/impuestos?\s+internos?/.test(t)) res.interno = (res.interno || 0) + monto;
    else if (/\bflete\b/.test(t)) res.flete = (res.flete || 0) + monto;
    else if (/\biva\b/.test(t) && !/contenido|responsable|condicion|inscripto/.test(t)) {
      const pct = linea.match(_PCT);
      res.iva = (res.iva || 0) + monto;
      res.iva_detalle.push({ pct: pct ? parseNum(pct[1]) : null, monto });
    } else if (/neto|importe\s+gravado/.test(t) && !t.includes("no gravado")) res.neto = monto;
    else if (/sub\s*total/.test(t)) subtotal = monto;
    else if (/^\W*(importe\s+)?total\b/.test(t) && !t.includes("sub")) res.total = monto;
  });
  if (res.neto === null) res.neto = subtotal;
  return res;
}

/* ---- extracción de texto ---- */
async function textoPdf(buf) {
  if (typeof pdfjsLib === "undefined") throw new Error("No se cargó el lector de PDF. Recargá la página.");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "lib/pdf.worker.js";
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise, partes = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const tc = await (await pdf.getPage(n)).getTextContent(), its = tc.items.filter(x => x.str && x.str.trim() !== "");
    const grupos = [];
    for (const it of its.sort((a, b) => b.transform[5] - a.transform[5])) {  // de arriba hacia abajo
      const y = it.transform[5], g = grupos.find(g => Math.abs(g.y - y) <= 2.5);
      if (g) g.its.push(it); else grupos.push({ y, its: [it] });
    }
    for (const g of grupos) {
      g.its.sort((a, b) => a.transform[4] - b.transform[4]);
      let linea = "", fin = null;
      for (const it of g.its) {
        const x = it.transform[4];
        if (fin !== null) { const gap = x - fin; linea += gap > 9 ? "  " : (gap > 1 ? " " : ""); }
        linea += it.str.trim(); fin = x + it.width;
      }
      partes.push(linea);
    }
  }
  return partes.join("\n");
}
async function textoDocx(buf) {
  const z = await leerZip(buf), xml = await z.texto("word/document.xml");
  if (!xml) throw new Error("No pude leer el Word (¿es un .docx?).");
  const doc = _xml(xml), body = _todos(doc, "body")[0], partes = [], tablas = [];
  const parr = p => { let t = ""; const rec = n => { for (const c of n.children) {
      if (c.localName === "t") t += c.textContent; else if (c.localName === "tab") t += "\t"; else if (c.localName === "br" || c.localName === "cr") t += "\n"; else rec(c); } };
    rec(p); return t; };
  for (const h of body.children) {
    if (h.localName === "p") partes.push(parr(h));
    else if (h.localName === "tbl") for (const tr of _todos(h, "tr")) {
      const celdas = _hijos(tr, "tc").map(tc => _hijos(tc, "p").map(parr).join("\n"));
      tablas.push(celdas); partes.push(celdas.map(c => c.trim()).join("  "));
    }
  }
  return { texto: partes.join("\n"), tablas };
}

async function leerFactura(file) {
  const ext = (file.name.match(/\.[^.]+$/) || [""])[0].toLowerCase();
  let texto = "", tablas = [];
  const buf = await file.arrayBuffer();
  if (ext === ".pdf") texto = await textoPdf(buf);
  else if (ext === ".docx") ({ texto, tablas } = await textoDocx(buf));
  else if (ext === ".doc") ERR("Los .doc antiguos no se pueden leer. Guardalo como .docx desde Word.");
  else ERR("Formato no soportado. Usá PDF o Word (.docx).");
  if (!texto.trim() && !tablas.length) ERR("No se pudo extraer texto (¿es un PDF escaneado o una foto?).");
  const datos = _meta(texto);
  datos.items = _itemsTablas(tablas); if (!datos.items.length) datos.items = _itemsTexto(texto);
  datos.impuestos = extraerImpuestos(texto);
  return datos;
}

/* difflib.get_close_matches (para sugerir el producto / proveedor ya cargado) */
function _ratio(a, b) {
  if (!a.length && !b.length) return 1;
  const bloques = (alo, ahi, blo, bhi) => {
    let mi = alo, mj = blo, mk = 0; const prev = new Map();
    let fila = new Map();
    for (let i = alo; i < ahi; i++) {
      const nueva = new Map();
      for (let j = blo; j < bhi; j++) if (a[i] === b[j]) {
        const k = (fila.get(j - 1) || 0) + 1; nueva.set(j, k);
        if (k > mk) { mi = i - k + 1; mj = j - k + 1; mk = k; }
      }
      fila = nueva;
    }
    if (!mk) return 0;
    return mk + (mi > alo && mj > blo ? bloques(alo, mi, blo, mj) : 0) + (mi + mk < ahi && mj + mk < bhi ? bloques(mi + mk, ahi, mj + mk, bhi) : 0);
  };
  return 2 * bloques(0, a.length, 0, b.length) / (a.length + b.length);
}
function cercano(clave, claves, corte) {
  if (claves.includes(clave)) return clave;
  let mejor = null, mr = corte;
  for (const k of claves) { const r = _ratio(clave, k); if (r >= mr) { mr = r; mejor = k; } }
  return mejor;
}
