/* Flamingo — lectura/escritura de archivos .zip, .xlsx y .docx directamente en el navegador (sin librerías). */
"use strict";

/* ---------------- ZIP ---------------- */
const _crcTabla = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = _crcTabla[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

async function inflar(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const w = ds.writable.getWriter(); w.write(bytes); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}
async function leerZip(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("El archivo no es un .zip/.xlsx/.docx válido.");
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder(), out = new Map();
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const nombre = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    const lnl = dv.getUint16(off + 26, true), lel = dv.getUint16(off + 28, true), ini = off + 30 + lnl + lel;
    const datos = u8.subarray(ini, ini + csize);
    out.set(nombre, async () => metodo === 0 ? datos.slice() : inflar(datos));
    p += 46 + nl + el + cl;
  }
  return { nombres: [...out.keys()], async texto(nom) { const f = out.get(nom); return f ? new TextDecoder().decode(await f()) : null; } };
}
function crearZip(archivos) {  // archivos: [[nombre, Uint8Array]] — sin compresión (válido para Excel)
  const enc = new TextEncoder(), partes = [], central = []; let off = 0;
  for (const [nombre, datos] of archivos) {
    const nb = enc.encode(nombre), crc = crc32(datos);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
    h.setUint32(14, crc, true); h.setUint32(18, datos.length, true); h.setUint32(22, datos.length, true); h.setUint16(26, nb.length, true);
    partes.push(new Uint8Array(h.buffer), nb, datos);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, datos.length, true); c.setUint32(24, datos.length, true); c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nb);
    off += 30 + nb.length + datos.length;
  }
  const tamC = central.reduce((a, x) => a + x.length, 0);
  const e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, archivos.length, true); e.setUint16(10, archivos.length, true);
  e.setUint32(12, tamC, true); e.setUint32(16, off, true);
  return new Blob([...partes, ...central, new Uint8Array(e.buffer)], { type: "application/zip" });
}

/* ---------------- XLSX: leer ---------------- */
const _xml = t => new DOMParser().parseFromString(t, "application/xml");
const _hijos = (el, nombre) => [...el.children].filter(c => c.localName === nombre);
const _todos = (el, nombre) => [...el.getElementsByTagNameNS("*", nombre)];
function _colNum(ref) { let n = 0; for (const ch of ref.replace(/[0-9]/g, "")) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; }
function serialAFecha(x) {  // serie de Excel -> 'AAAA-MM-DD' o 'AAAA-MM-DDTHH:MM:SS'
  const dias = Math.floor(x + 1e-9), seg = Math.round((x - dias) * 86400);
  const d = new Date(Date.UTC(1899, 11, 30) + dias * 86400000);
  const f = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  if (!seg) return f;
  const h = Math.floor(seg / 3600), m = Math.floor(seg % 3600 / 60), s = seg % 60;
  return `${f}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
async function leerXlsx(buf) {
  const z = await leerZip(buf);
  const wb = _xml(await z.texto("xl/workbook.xml") || ""), rels = _xml(await z.texto("xl/_rels/workbook.xml.rels") || "");
  if (!wb.documentElement || wb.querySelector("parsererror")) throw new Error("No pude leer el Excel (¿es un .xlsx?).");
  const dest = {}; for (const r of _todos(rels, "Relationship")) dest[r.getAttribute("Id")] = r.getAttribute("Target");
  const compartidas = [], ss = await z.texto("xl/sharedStrings.xml");
  if (ss) for (const si of _todos(_xml(ss), "si")) compartidas.push(_todos(si, "t").map(t => t.textContent).join(""));
  // estilos que son fechas
  const esFecha = new Set(); const st = await z.texto("xl/styles.xml");
  if (st) {
    const sx = _xml(st), custom = {};
    for (const nf of _todos(sx, "numFmt")) custom[nf.getAttribute("numFmtId")] = nf.getAttribute("formatCode");
    const xfs = _todos(sx, "cellXfs")[0];
    if (xfs) _hijos(xfs, "xf").forEach((xf, i) => {
      const id = xf.getAttribute("numFmtId"), n = +id;
      const fc = (custom[id] || "").replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
      if ((n >= 14 && n <= 22) || (n >= 45 && n <= 47) || (custom[id] && /[dmyh]/i.test(fc) && !/^0|#/.test(fc))) esFecha.add(i);
    });
  }
  const hojas = {};
  for (const sh of _todos(wb, "sheet")) {
    const rid = sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || sh.getAttribute("r:id");
    let ruta = dest[rid] || ""; ruta = ruta.startsWith("/") ? ruta.slice(1) : "xl/" + ruta.replace(/^\.\//, "");
    const txt = await z.texto(ruta); if (!txt) continue;
    const filas = [];
    for (const row of _todos(_xml(txt), "row")) {
      const fi = +row.getAttribute("r") - 1, fila = filas[fi] = [];
      for (const c of _hijos(row, "c")) {
        const t = c.getAttribute("t"), s = +c.getAttribute("s") || 0, v = _hijos(c, "v")[0];
        let val = null;
        if (t === "inlineStr") val = _todos(c, "t").map(x => x.textContent).join("");
        else if (v) {
          const raw = v.textContent;
          if (t === "s") val = compartidas[+raw]; else if (t === "str" || t === "e") val = raw; else if (t === "b") val = raw === "1";
          else { val = parseFloat(raw); if (esFecha.has(s) && Number.isFinite(val)) val = serialAFecha(val); }
        }
        fila[_colNum(c.getAttribute("r"))] = val;
      }
    }
    hojas[sh.getAttribute("name")] = Array.from(filas, f => f ? Array.from(f, x => x === undefined ? null : x) : []);
  }
  return hojas;
}

/* ---------------- XLSX: escribir ---------------- */
const _esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const _colLetra = i => { let s = ""; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
function fechaASerial(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const d = Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 + 25569;
  return d + (m[4] ? (+m[4] * 3600 + +m[5] * 60 + +m[6]) / 86400 : 0);
}
function crearXlsx(hojasDatos) {  // hojasDatos: {nombre: filas[][]} — las filas ya incluyen el encabezado en la fila 0
  const enc = new TextEncoder(), nombres = Object.keys(hojasDatos);
  const hojasXml = nombres.map(nom => {
    const filas = hojasDatos[nom], fc = COL_FECHAS[nom] || [];
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
    xml += '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
    xml += "<cols>" + (ANCHOS[nom] || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("") + "</cols><sheetData>";
    filas.forEach((fila, ri) => {
      xml += `<row r="${ri + 1}">`;
      fila.forEach((v, ci) => {
        if (v == null || v === "") return;
        const ref = _colLetra(ci) + (ri + 1);
        if (ri === 0) xml += `<c r="${ref}" s="3" t="inlineStr"><is><t>${_esc(v)}</t></is></c>`;
        else if (fc.includes(ci) && typeof v === "string" && fechaASerial(v) != null)
          xml += `<c r="${ref}" s="${v.length > 10 ? 2 : 1}"><v>${fechaASerial(v)}</v></c>`;
        else if (typeof v === "number") xml += `<c r="${ref}"><v>${v}</v></c>`;
        else if (typeof v === "boolean") xml += `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
        else xml += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${_esc(v)}</t></is></c>`;
      });
      xml += "</row>";
    });
    return xml + "</sheetData></worksheet>";
  });
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="2"><numFmt numFmtId="164" formatCode="DD/MM/YYYY"/><numFmt numFmtId="165" formatCode="DD/MM/YYYY HH:MM"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8588D"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const wbXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    nombres.map((n, i) => `<sheet name="${_esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") + "</sheets></workbook>";
  const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    nombres.map((n, i) => `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
    `<Relationship Id="rId${nombres.length + 1}" Type="${R}/styles" Target="styles.xml"/></Relationships>`;
  const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    nombres.map((n, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") + "</Types>";
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const archivos = [["[Content_Types].xml", ct], ["_rels/.rels", rootRels], ["xl/workbook.xml", wbXml], ["xl/_rels/workbook.xml.rels", wbRels], ["xl/styles.xml", styles],
    ...hojasXml.map((x, i) => [`xl/worksheets/sheet${i + 1}.xml`, x])].map(([n, t]) => [n, enc.encode(t)]);
  return crearZip(archivos);
}

/* Datos de Flamingo <-> Excel (mismas hojas y columnas que la versión de escritorio) */
function datosAExcel(hojas) {
  const out = {};
  for (const n of Object.keys(HOJAS)) out[n] = [HOJAS[n], ...(hojas[n] || [])];
  return crearXlsx(out);
}
async function excelADatos(buf) {
  const x = await leerXlsx(buf), hojas = {};
  if (!Object.keys(HOJAS).some(n => x[n])) throw new Error("Este Excel no tiene las hojas de Flamingo (Productos, Facturas, Ventas…).");
  for (const n of Object.keys(HOJAS)) {
    const fc = COL_FECHAS[n] || [], filas = (x[n] || []).slice(1).filter(f => f && f.some(v => v != null && v !== ""));
    hojas[n] = filas.map(f => {
      const r = Array.from({ length: HOJAS[n].length }, (_, i) => f[i] === undefined ? null : f[i]);
      for (const i of fc) if (typeof r[i] === "string") { const a = String(r[i]); if (!/^\d{4}-\d{2}-\d{2}/.test(a)) { try { r[i] = parseFecha(a); } catch (e) { /* queda como texto */ } } }
      return r;
    });
  }
  // bases creadas con versiones anteriores
  const cab = (x["Facturas"] || [[]])[0] || [];
  if (cab[0] !== "ID" && hojas["Facturas"].length) {
    const viejas = (x["Facturas"] || []).slice(1).filter(f => f && f.some(v => v != null));
    hojas["Facturas"] = viejas.map((f, i) => { const [fecha, prov, nro, neto, iva, piva, iibb, interno, flete, total] = Array.from({ length: 10 }, (_, k) => f[k] ?? null);
      return [i + 1, typeof fecha === "string" ? aFecha(fecha) : fecha, null, prov, nro, neto, iva, piva, iibb, interno, flete, total, 0, null, null]; });
  }
  for (const r of hojas["Productos"]) if (r[6] == null || r[6] === "") r[6] = calcularCosto(parseNum(r[2]), parseNum(r[5])).total;
  return hojas;
}
