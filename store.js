/* Flamingo — datos en GitHub (repositorio privado) + «API» local que usa la pantalla. */
"use strict";

const RUTA_DATOS = "datos/flamingo.json", CARPETA_ARCHIVOS = "datos/facturas/";
const Cfg = {
  leer() { try { return JSON.parse(localStorage.getItem("flamingo-gh") || "null"); } catch (e) { return null; } },
  guardar(c) { localStorage.setItem("flamingo-gh", JSON.stringify(c)); },
  borrar() { try { localStorage.removeItem("flamingo-gh"); localStorage.removeItem("flamingo-cache"); } catch (e) { /* nada */ } },
};

/* ---- base64 con UTF-8 ---- */
const aB64 = bytes => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const deB64 = b64 => { const s = atob(b64.replace(/\s/g, "")), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
const textoAB64 = t => aB64(new TextEncoder().encode(t));
const b64ATexto = b => new TextDecoder().decode(deB64(b));

/* JSON con una fila por línea: el historial de GitHub queda legible */
function serializar(hojas) {
  const partes = Object.keys(HOJAS).map(n => {
    const filas = (hojas[n] || []).map(r => "  " + JSON.stringify(r));
    return `"${n}":[` + (filas.length ? "\n" + filas.join(",\n") + "\n" : "") + "]";
  });
  return `{"version":1,"hojas":{\n${partes.join(",\n")}\n}}\n`;
}

class ErrorGH extends Error { constructor(msg, status) { super(msg); this.status = status; } }

const GH = {
  cfg: null,
  url(ruta) { return `https://api.github.com/repos/${this.cfg.owner}/${this.cfg.repo}/contents/${ruta.split("/").map(encodeURIComponent).join("/")}`; },
  async req(url, { method = "GET", body, headers = {} } = {}) {
    let r;
    try {
      r = await fetch(url, { method, cache: "no-store", body: body ? JSON.stringify(body) : undefined, headers: {
        Authorization: "Bearer " + this.cfg.token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...headers } });
    } catch (e) { throw new ErrorGH("Sin conexión a internet.", 0); }
    return r;
  },
  async fallo(r) {
    let msg = ""; try { msg = (await r.json()).message || ""; } catch (e) { /* nada */ }
    if (r.status === 401) return new ErrorGH("El token de GitHub no es válido o venció. Creá uno nuevo y volvé a conectar.", 401);
    if (r.status === 403 && /rate limit/i.test(msg)) return new ErrorGH("GitHub pidió esperar un momento (demasiadas consultas). Probá en un minuto.", 403);
    if (r.status === 403) return new ErrorGH("El token no tiene permiso de escritura (Contents: Read and write) sobre el repositorio de datos.", 403);
    if (r.status === 404) return new ErrorGH("No encuentro el repositorio o el archivo. Revisá usuario/nombre y que el token tenga acceso a ese repositorio.", 404);
    return new ErrorGH(`GitHub respondió ${r.status}${msg ? ": " + msg : ""}`, r.status);
  },
  /* lee un archivo del repo. Devuelve {estado:304} o {sha, bytes, etag} o null si no existe */
  async leer(ruta, etag) {
    const r = await this.req(this.url(ruta), { headers: etag ? { "If-None-Match": etag } : {} });
    if (r.status === 304) return { estado: 304 };
    if (r.status === 404) return null;
    if (!r.ok) throw await this.fallo(r);
    const j = await r.json();
    let bytes;
    if (j.encoding === "base64" && j.content) bytes = deB64(j.content);
    else {  // archivos de más de 1 MB: se pide el contenido en crudo
      const rr = await this.req(this.url(ruta), { headers: { Accept: "application/vnd.github.raw+json" } });
      if (!rr.ok) throw await this.fallo(rr);
      bytes = new Uint8Array(await rr.arrayBuffer());
    }
    return { estado: 200, sha: j.sha, bytes, etag: r.headers.get("ETag") };
  },
  async sha(ruta) { const r = await this.req(this.url(ruta)); if (r.status === 404) return null; if (!r.ok) throw await this.fallo(r); return (await r.json()).sha; },
  /* crea / actualiza. Si el sha ya no coincide -> error con .conflicto = true */
  async escribir(ruta, contenidoB64, mensaje, sha) {
    const r = await this.req(this.url(ruta), { method: "PUT", body: { message: mensaje, content: contenidoB64, ...(sha ? { sha } : {}) } });
    if (r.status === 409 || r.status === 422) { const e = new ErrorGH("Cambios simultáneos.", r.status); e.conflicto = true; throw e; }
    if (!r.ok) throw await this.fallo(r);
    return (await r.json()).content.sha;
  },
};

/* ---- almacenamiento en GitHub: interfaz común de «backend» ---- */
const GitHubBackend = {
  tipo: "github",
  etiqueta() { return GH.cfg.repo; },
  descripcion() { return `GitHub · repositorio privado ${GH.cfg.owner}/${GH.cfg.repo}`; },
  iniciar(cfg) { GH.cfg = cfg; return this; },
  async leerDatos(etag) { return GH.leer(RUTA_DATOS, etag); },
  async escribirDatos(texto, mensaje, sha) { return GH.escribir(RUTA_DATOS, textoAB64(texto), mensaje, sha); },
  async subirArchivo(nombre, file) {
    const ruta = CARPETA_ARCHIVOS + nombre, b64 = aB64(new Uint8Array(await file.arrayBuffer()));
    try { await GH.escribir(ruta, b64, "Flamingo: adjuntar factura " + nombre, null); }
    catch (e) { if (!e.conflicto) throw e; await GH.escribir(ruta, b64, "Flamingo: adjuntar factura " + nombre, await GH.sha(ruta)); }
  },
  async bajarArchivo(nombre) {
    const r = await GH.req(GH.url(CARPETA_ARCHIVOS + nombre), { headers: { Accept: "application/vnd.github.raw+json" } });
    if (r.status === 404) ERR(`No encuentro el archivo «${nombre}» en el repositorio.`);
    if (!r.ok) throw await GH.fallo(r);
    return r.blob();
  },
  async conectar(f) {
    GH.cfg = { tipo: "github", owner: f.owner.trim(), repo: f.repo.trim(), token: f.token.trim() };
    const r = await GH.req(`https://api.github.com/repos/${encodeURIComponent(GH.cfg.owner)}/${encodeURIComponent(GH.cfg.repo)}`);
    if (!r.ok) throw await GH.fallo(r);
    const info = await r.json();
    if (info.private === false) ERR("Ese repositorio es PÚBLICO: cualquiera podría ver tus datos. En GitHub: Settings → Danger Zone → Change visibility → Private. Después volvé a conectar.");
    if (info.permissions && info.permissions.push === false) ERR("El token solo puede leer. Necesita el permiso «Contents: Read and write».");
    return GH.cfg;
  },
};

/* ---- almacenamiento en Google Drive (Google Identity Services + Drive API v3, permiso «drive.file») ----
   Los datos quedan en tu Drive: carpeta «Flamingo» → flamingo.json (y las facturas adjuntas). La app solo ve lo que ella misma creó. */
const SCOPE_DRIVE = "https://www.googleapis.com/auth/drive.file", MIME_CARPETA = "application/vnd.google-apps.folder";
const DriveBackend = {
  tipo: "drive", cfg: null, token: null, expira: 0, carpetaId: null, archivoId: null, _gsi: null, _pidiendo: false,
  etiqueta() { return "Google Drive"; },
  descripcion() { return "Google Drive · carpeta «Flamingo»" + (this.cfg.email ? " · " + this.cfg.email : ""); },
  iniciar(cfg) {
    this.cfg = cfg;
    try { const t = JSON.parse(localStorage.getItem("flamingo-gtoken") || "null"); if (t && t.exp > Date.now()) { this.token = t.token; this.expira = t.exp; } } catch (e) { /* nada */ }
    this._cargarGsi().catch(() => {});
    /* el token de Google dura 1 hora: se renueva con un toque (hace falta un gesto del usuario para que el navegador deje abrir la ventana) */
    document.addEventListener("pointerdown", ev => {
      if (ev.target.closest && ev.target.closest("#login,#setup")) return;
      if (this.cfg && (!this.token || Date.now() > this.expira - 10 * 60 * 1000) && !this._pidiendo) {
        this._pidiendo = true; this._pedirToken("").catch(() => {}).finally(() => { this._pidiendo = false; if (typeof pintarEstado === "function") pintarEstado(); });
      }
    }, true);
    return this;
  },
  _cargarGsi() {
    if (this._gsi) return this._gsi;
    return this._gsi = new Promise((ok, mal) => {
      if (window.google && google.accounts && google.accounts.oauth2) return ok();
      const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true;
      s.onload = () => ok(); s.onerror = () => { this._gsi = null; mal(new ErrorGH("No se pudo cargar el inicio de sesión de Google (¿sin internet?).", 0)); };
      document.head.append(s);
    });
  },
  async _pedirToken(prompt) {
    await this._cargarGsi();
    return new Promise((ok, mal) => {
      const tc = google.accounts.oauth2.initTokenClient({
        client_id: this.cfg.clientId, scope: SCOPE_DRIVE, prompt,
        callback: r => {
          if (r.error) return mal(new ErrorGH("Google rechazó el acceso: " + (r.error_description || r.error), 401));
          this.token = r.access_token; this.expira = Date.now() + (Number(r.expires_in || 3600) - 120) * 1000;
          try { localStorage.setItem("flamingo-gtoken", JSON.stringify({ token: this.token, exp: this.expira })); } catch (e) { /* nada */ }
          ok(this.token);
        },
        error_callback: e => mal(new ErrorGH(e && e.type === "popup_failed_to_open"
          ? "El navegador bloqueó la ventana de Google. Tocá «Reconectar con Google» en ⚙."
          : e && e.type === "popup_closed" ? "Cerraste la ventana de Google antes de terminar." : "No se pudo iniciar sesión con Google" + (e && e.type ? " (" + e.type + ")" : "") + ".", 401)),
      });
      tc.requestAccessToken({ prompt });
    });
  },
  async reconectar() { await this._pedirToken(""); },
  sesionVigente() { return !!this.token && Date.now() < this.expira; },
  async _tk() {
    if (this.sesionVigente()) return this.token;
    try { return await this._pedirToken(""); }
    catch (e) { if (e.status === 0) throw e; throw new ErrorGH("Tu sesión de Google venció. Tocá cualquier botón de la app o «Reconectar con Google» en ⚙.", 401); }
  },
  async _fallo(r) {
    let msg = "", motivo = ""; try { const j = await r.json(); msg = (j.error && j.error.message) || ""; motivo = (j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason) || ""; } catch (e) { /* nada */ }
    if (r.status === 401) { this.token = null; this.expira = 0; return new ErrorGH("Tu sesión de Google venció. Tocá cualquier botón de la app o «Reconectar con Google» en ⚙.", 401); }
    if (r.status === 403 && /accessNotConfigured|has not been used|is disabled/i.test(motivo + msg)) return new ErrorGH("Falta activar «Google Drive API» en tu proyecto de Google Cloud (APIs y servicios → Biblioteca → Google Drive API → Habilitar).", 403);
    if (r.status === 403 && /rate|quota/i.test(motivo + msg)) return new ErrorGH("Google pidió esperar un momento (demasiadas consultas). Probá en un minuto.", 403);
    if (r.status === 403) return new ErrorGH("Google denegó el permiso sobre Drive. " + msg, 403);
    if (r.status === 404) return new ErrorGH("No encuentro el archivo en tu Drive (¿lo borraste o lo moviste?).", 404);
    return new ErrorGH(`Google Drive respondió ${r.status}${msg ? ": " + msg : ""}`, r.status);
  },
  async _api(url, { method = "GET", body, headers = {} } = {}) {
    const tk = await this._tk();
    let r;
    try { r = await fetch(url, { method, body, cache: "no-store", headers: { Authorization: "Bearer " + tk, ...headers } }); }
    catch (e) { throw new ErrorGH("Sin conexión a internet.", 0); }
    if (!r.ok) throw await this._fallo(r);
    return r;
  },
  async _buscar(nombre, padre, mime) {
    const q = `name='${nombre.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' and trashed=false` + (padre ? ` and '${padre}' in parents` : "") + (mime ? ` and mimeType='${mime}'` : "");
    const r = await this._api("https://www.googleapis.com/drive/v3/files?" + new URLSearchParams({ q, spaces: "drive", orderBy: "createdTime", pageSize: "10", fields: "files(id,name,md5Checksum,version)" }));
    return (await r.json()).files || [];
  },
  async _carpeta(crear) {
    if (this.carpetaId) return this.carpetaId;
    let f = (await this._buscar("Flamingo", null, MIME_CARPETA))[0];
    if (!f && crear) f = await (await this._api("https://www.googleapis.com/drive/v3/files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Flamingo", mimeType: MIME_CARPETA }) })).json();
    return this.carpetaId = f ? f.id : null;
  },
  async _crear(nombre, mime, datos) {  // subida «multipart»: metadatos + contenido
    const lim = "flamingo" + Math.random().toString(36).slice(2);
    const cuerpo = new Blob([`--${lim}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: nombre, parents: [this.carpetaId], mimeType: mime })}\r\n--${lim}\r\nContent-Type: ${mime}\r\n\r\n`, datos, `\r\n--${lim}--`]);
    const r = await this._api("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,md5Checksum", { method: "POST", body: cuerpo, headers: { "Content-Type": `multipart/related; boundary=${lim}` } });
    return r.json();
  },
  async _actualizar(id, mime, datos) {
    const r = await this._api(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media&fields=id,md5Checksum`, { method: "PATCH", body: datos, headers: { "Content-Type": mime } });
    return r.json();
  },
  async _meta(id) { return (await this._api(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,md5Checksum,trashed`)).json(); },

  /* ---- interfaz común ---- */
  async leerDatos(etag) {
    await this._carpeta(true);
    let meta;
    if (!this.archivoId) {
      const f = (await this._buscar("flamingo.json", this.carpetaId))[0];
      if (!f) return null;
      this.archivoId = f.id; meta = f;
    } else {
      meta = await this._meta(this.archivoId);
      if (meta.trashed) { this.archivoId = null; return this.leerDatos(etag); }
    }
    if (etag && meta.md5Checksum === etag) return { estado: 304 };
    const r = await this._api(`https://www.googleapis.com/drive/v3/files/${this.archivoId}?alt=media`);
    return { estado: 200, sha: meta.md5Checksum, etag: meta.md5Checksum, bytes: new Uint8Array(await r.arrayBuffer()) };
  },
  async escribirDatos(texto, mensaje, sha) {
    await this._carpeta(true);
    if (!sha) { const m = await this._crear("flamingo.json", "application/json", texto); this.archivoId = m.id; return m.md5Checksum; }
    const actual = await this._meta(this.archivoId);  // Drive no tiene «escritura condicional»: se verifica justo antes de escribir
    if (actual.md5Checksum !== sha) { const e = new ErrorGH("Cambios simultáneos.", 409); e.conflicto = true; throw e; }
    return (await this._actualizar(this.archivoId, "application/json", texto)).md5Checksum;
  },
  async subirArchivo(nombre, file) {
    await this._carpeta(true);
    const mime = file.type || "application/octet-stream", ex = (await this._buscar(nombre, this.carpetaId))[0];
    if (ex) await this._actualizar(ex.id, mime, file); else await this._crear(nombre, mime, file);
  },
  async bajarArchivo(nombre) {
    await this._carpeta(false);
    const f = this.carpetaId ? (await this._buscar(nombre, this.carpetaId))[0] : null;
    if (!f) ERR(`No encuentro el archivo «${nombre}» en la carpeta Flamingo de tu Drive.`);
    return (await this._api(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`)).blob();
  },
  async conectar(f) {
    const clientId = String(f.clientId || "").trim();
    if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId)) ERR("El ID de cliente de Google debe terminar en .apps.googleusercontent.com (copialo completo desde Google Cloud Console → Clientes).");
    this.cfg = { tipo: "drive", clientId }; this.token = null; this.carpetaId = null; this.archivoId = null;
    await this._pedirToken("");
    const r = await this._api("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)");
    this.cfg.email = ((await r.json()).user || {}).emailAddress || "";
    await this._carpeta(true);
    return this.cfg;
  },
};

let B = null;  // backend activo (Drive o GitHub)

const Store = {
  hojas: null, sha: null, etag: null, ultima: null, enLinea: true, onCambio: null,
  conectado() { return !!B; },
  iniciar() {
    const c = Cfg.leer();
    if (!c) return false;
    B = (c.tipo === "drive" ? DriveBackend : GitHubBackend).iniciar(c);
    return true;
  },
  _cache() { try { const c = JSON.parse(localStorage.getItem("flamingo-cache") || "null"); if (c && c.hojas) { this.hojas = c.hojas; this.ultima = c.ultima; } } catch (e) { /* nada */ } },
  _guardarCache() { try { localStorage.setItem("flamingo-cache", JSON.stringify({ hojas: this.hojas, ultima: this.ultima })); } catch (e) { /* demasiado grande: sin caché */ } },
  _aplicar(res) {
    const j = JSON.parse(new TextDecoder().decode(res.bytes));
    this.hojas = new DB(j.hojas).d; this.sha = res.sha; this.etag = res.etag;
  },
  /* trae la última versión (si no cambió, casi no gasta) */
  async cargar() {
    try {
      const res = await B.leerDatos(this.hojas ? this.etag : null);
      let cambio = false;
      if (res === null) {  // todavía no existe el archivo: se crea vacío
        const vacia = DB.vacia();
        this.sha = await B.escribirDatos(serializar(vacia.hojas), "Flamingo: crear base de datos", null);
        this.hojas = vacia.hojas; this.etag = B.tipo === "drive" ? this.sha : null; cambio = true;
      } else if (res.estado === 200) { cambio = this.sha !== res.sha; this._aplicar(res); }
      this.enLinea = true; this.ultima = new Date().toISOString(); this._guardarCache();
      if (cambio && this.onCambio) this.onCambio();
      return cambio;
    } catch (e) {
      if (e.status === 0) { this.enLinea = false; if (!this.hojas) this._cache(); if (!this.hojas) throw e; return false; }
      throw e;
    }
  },
  get db() { return new DB(this.hojas || DB.vacia().hojas); },
  /* aplica un cambio sobre la última versión y lo sube. Si otro dispositivo cambió algo a la vez, reintenta solo. */
  async mutar(fn, mensaje = "Flamingo: actualización") {
    for (let intento = 0; intento < 5; intento++) {
      await this.cargar();
      if (!this.enLinea) ERR("Sin conexión a internet: no se puede guardar. Probá de nuevo cuando vuelva.");
      const db = new DB(this.hojas), res = fn(db);
      try {
        this.sha = await B.escribirDatos(serializar(db.d), mensaje, this.sha);
        this.hojas = db.d; this.etag = B.tipo === "drive" ? this.sha : null; this.ultima = new Date().toISOString(); this._guardarCache();
        return res;
      } catch (e) { if (e.conflicto) { this.etag = null; this.sha = null; continue; } if (e.status === 0) ERR("Sin conexión a internet: no se pudo guardar."); throw e; }
    }
    ERR("No se pudo guardar porque otro dispositivo estaba cambiando los datos al mismo tiempo. Probá otra vez.");
  },
  async reemplazar(hojas, mensaje) {  // importar un Excel: reemplaza todo
    await this.cargar();
    const d = new DB(hojas).d;
    this.sha = await B.escribirDatos(serializar(d), mensaje, this.sha);
    this.hojas = d; this.etag = B.tipo === "drive" ? this.sha : null; this.ultima = new Date().toISOString(); this._guardarCache();
  },
  async subirArchivo(nombre, file) {
    if (file.size > 20 * 1024 * 1024) ERR("El archivo pesa más de 20 MB.");
    return B.subirArchivo(nombre, file);
  },
  bajarArchivo(nombre) { return B.bajarArchivo(nombre); },
  /* primera conexión de un dispositivo: f = {tipo, ...campos} */
  async conectar(f) {
    const previo = B, back = f.tipo === "drive" ? DriveBackend : GitHubBackend;
    try {
      B = back;
      const cfg = await back.conectar(f);
      this.hojas = null; this.sha = null; this.etag = null;
      await this.cargar();
      Cfg.guardar(cfg);
      if (back === DriveBackend) back.iniciar(cfg);
    } catch (e) { B = previo; throw e; }
  },
  desconectar() { Cfg.borrar(); try { localStorage.removeItem("flamingo-gtoken"); } catch (e) { /* nada */ } B = null; GH.cfg = null; this.hojas = null; this.sha = null; this.etag = null; },
};

/* ---------- «API» local: mismas rutas que usaba la pantalla ---------- */
const _interno = d => (d.interno === undefined || d.interno === null || d.interno === "" || d.interno === false) ? null : parseNum(d.interno);
const _fechaOpt = t => { t = String(t || "").trim(); return t ? parseFecha(t) : null; };
const _seguro = n => (String(n || "").split(/[\\/]/).pop().replace(/[^\p{L}\p{N}_.\- ]/gu, "_")) || "factura";

async function _adjuntar(fid, file) {
  if (!(file && file.name)) return null;
  try {
    const nombre = `${String(fid).padStart(4, "0")}_${_seguro(file.name)}`;
    await Store.subirArchivo(nombre, file);
    await Store.mutar(db => db.adjuntarArchivo(fid, nombre), "Flamingo: factura " + fid + " con archivo");
  } catch (e) { return `La factura se guardó, pero no pude guardar el archivo adjunto: ${e.message}`; }
  return null;
}

const API = {
  async call(url, method = "GET", body) {
    const u = new URL(url, "http://x"), ruta = u.pathname, M = method.toUpperCase();
    const ok = { ok: true };
    let m;
    if (ruta === "/api/productos") {
      if (M === "GET") return Store.db.productos();
      if (M === "DELETE") { await Store.mutar(db => db.eliminarProducto(body.nombre), "Flamingo: eliminar producto"); return ok; }
      const d = body;
      if (M === "POST") await Store.mutar(db => db.guardarProducto(d.nombre, d.categoria, parseNum(d.costo), parseNum(d.precio), parseNum(d.stock), null, _interno(d)), "Flamingo: producto " + d.nombre);
      else await Store.mutar(db => db.guardarProducto(d.nombre, d.categoria, parseNum(d.costo), parseNum(d.precio), 0, d.original, _interno(d)), "Flamingo: producto " + d.nombre);
      return ok;
    }
    if (ruta === "/api/factura" && M === "POST") {
      const f = body.get("archivo"); if (!f) ERR("No se recibió ningún archivo.");
      const datos = await leerFactura(f), db = Store.db;
      const nombres = Object.fromEntries(db.productos().map(p => [cf(p.nombre), p.nombre]));
      for (const it of datos.items) { const k = cercano(cf(it.nombre), Object.keys(nombres), 0.8); it.vinculo = k ? nombres[k] : ""; }
      const provs = Object.fromEntries(db.proveedores().map(p => [cf(p.nombre), p.nombre]));
      const k = cercano(cf(datos.proveedor), Object.keys(provs), 0.75);
      if (k && cf(datos.proveedor)) datos.proveedor = provs[k];
      return datos;
    }
    if (ruta === "/api/proveedores") {
      if (M === "GET") return Store.db.proveedores();
      const d = body || {};
      if (M === "DELETE") { await Store.mutar(db => db.eliminarProveedor(d.nombre), "Flamingo: eliminar proveedor"); return ok; }
      await Store.mutar(db => db.guardarProveedor(d.nombre, d.telefono || "", d.email || "", d.cuit || "", d.notas || "", M === "PUT" ? d.original : null), "Flamingo: proveedor " + d.nombre);
      return ok;
    }
    if (ruta === "/api/facturas") {
      if (M === "GET") return Store.db.facturas(u.searchParams.get("proveedor"));
      const d = JSON.parse(body.get("datos") || "{}"), file = body.get("archivo");
      const fid = await Store.mutar(db => db.registrarFactura(parseFecha(d.fecha), _fechaOpt(d.vence), d.proveedor || "", d.factura || "", d.items || [],
        d.impuestos, String(d.notas || "").trim(), d.actualizar_costos !== false), `Flamingo: factura ${d.factura || ""} de ${d.proveedor || ""}`);
      return { id: fid, aviso: await _adjuntar(fid, file) };
    }
    if ((m = ruta.match(/^\/api\/facturas\/(\d+)$/))) {
      const fid = +m[1];
      if (M === "GET") return Store.db.factura(fid);
      if (M === "DELETE") { await Store.mutar(db => db.eliminarFactura(fid), "Flamingo: eliminar factura " + fid); return ok; }
      const d = JSON.parse(body.get("datos") || "{}"), file = body.get("archivo");
      await Store.mutar(db => db.actualizarFactura(fid, parseFecha(d.fecha), _fechaOpt(d.vence), d.proveedor || "", d.factura || "", d.impuestos, String(d.notas || "").trim()), "Flamingo: editar factura " + fid);
      return { id: fid, aviso: await _adjuntar(fid, file) };
    }
    if ((m = ruta.match(/^\/api\/facturas\/(\d+)\/pago$/))) {
      const d = body;
      const saldo = await Store.mutar(db => db.registrarPago(+m[1], parseNum(d.monto), parseFecha(d.fecha), d.medio || "", d.nota || ""), "Flamingo: pago de factura " + m[1]);
      return { saldo };
    }
    if (ruta === "/api/ventas" && M === "POST") {
      const d = body;
      if (!MEDIOS_PAGO.includes(d.pago)) ERR("Elegí un medio de pago.");
      const numero = await Store.mutar(db => db.registrarVenta(parseFecha(d.fecha), d.pago, d.items), "Flamingo: venta");
      return { numero };
    }
    if (ruta === "/api/stock" && M === "POST") {
      const d = body;
      await Store.mutar(db => db.ajustarStock(d.nombre, parseNum(d.cantidad), d.modo || "sumar", d.detalle || ""), "Flamingo: stock de " + d.nombre);
      return ok;
    }
    if (ruta === "/api/resumen") return Store.db.resumen();
    if ((m = ruta.match(/^\/api\/historial\/(\w+)$/))) return Store.db.historial(m[1]);
    ERR("Ruta desconocida: " + url);
  },
};

/* abre / descarga el archivo adjunto de una factura (la ventana se abre ya, dentro del toque, para que el celular no la bloquee) */
async function abrirAdjunto(nombre) {
  if (!nombre) ERR("Esta factura no tiene un archivo adjunto. Podés adjuntarlo desde «Ver / editar».");
  const esPdf = /\.pdf$/i.test(nombre), w = esPdf ? window.open("", "_blank") : null;
  try {
    const blob = await Store.bajarArchivo(nombre);
    const url = URL.createObjectURL(new Blob([blob], { type: esPdf ? "application/pdf" : blob.type || "application/octet-stream" }));
    if (w) w.location = url;
    else { const a = document.createElement("a"); a.href = url; a.download = nombre.replace(/^\d+_/, ""); document.body.append(a); a.click(); a.remove(); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { if (w) w.close(); throw e; }
}
