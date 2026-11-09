
const CATS=CATEGORIAS, PAGOS=MEDIOS_PAGO;
const $=s=>document.querySelector(s), dlg=$('#dlg');
const money=n=>'$ '+Number(n).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
const q=n=>Number(n).toLocaleString('es-AR',{maximumFractionDigits:3});
const num=s=>{s=String(s).trim().replace('$','').replace(/\s/g,'');if(!s)return 0;
 if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
 else if(s.includes(','))s=s.replace(',','.');else if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
 const v=Number(s);if(isNaN(v))throw Error('Número inválido: '+s);return v};
const hoy=()=>{const d=new Date();return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear()};
function el(tag,props={},kids=[]){const e=document.createElement(tag);Object.assign(e,props);
 [].concat(kids).forEach(k=>e.append(k));return e}
function toast(m,err){const t=$('#toast');t.textContent=m;t.className=err?'err':'';t.style.display='block';
 clearTimeout(t._h);t._h=setTimeout(()=>t.style.display='none',err?6000:3500)}
const call=(url,method,body)=>API.call(url,method,body);
const guard=fn=>async(...a)=>{try{return await fn(...a)}catch(e){toast(e.message,true)}};

let prods=[], venta=[], selP=null;
const byName=n=>prods.find(p=>p.nombre.toLowerCase()===String(n).trim().toLowerCase());
async function load(){prods=await call('/api/productos');drawP();drawV();drawS();await Promise.all([drawC(),drawI()])}

/* ---------- pestañas ---------- */
const TABS=['Inicio','Productos','Compras','Ventas','Stock'];
function go(t,hist){TABS.forEach(x=>$('#t-'+x).classList.toggle('hide',x!==t));
 document.querySelectorAll('#menu button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
 load().then(()=>{if(hist){const b=document.querySelector('#t-'+t+' .sub button[data-s=hist]');b&&b.click()}})}
document.querySelectorAll('#menu button').forEach(b=>b.onclick=()=>go(b.dataset.t));
const THEME=()=>{try{return localStorage.getItem('flamingo-theme')}catch(e){return null}};
function setTheme(t){document.documentElement.dataset.theme=t;try{localStorage.setItem('flamingo-theme',t)}catch(e){}}
if(THEME()==='dark')setTheme('dark');
$('#theme').onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
$('#i-fecha').textContent=new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase());
function pct(a,b){if(b==null||b===0)return{t:'Sin datos del mes pasado'};const p=Math.round((a-b)/b*100);return{t:(p>=0?'▲ ':'▼ ')+Math.abs(p)+' % vs. mes pasado'}}
async function drawI(){const r=await call('/api/resumen');const k=$('#i-kpis');k.replaceChildren();
 const card=(l,v,s,red)=>k.append(el('div',{className:'kpi'+(red?' red':'')},[el('div',{className:'l',textContent:l}),el('div',{className:'v',textContent:v}),el('div',{className:'s'+(red?' red':''),textContent:s})]));
 card('Vendido este mes',money(r.vendido),pct(r.vendido,r.vendido_prev).t);
 card('Comprado este mes',money(r.comprado),pct(r.comprado,r.comprado_prev).t);
 card('Debo a proveedores',money(r.debo),r.facturas_pendientes?`${r.facturas_vencidas} vencida(s) · ${r.facturas_pendientes} pendiente(s)`:'Sin facturas pendientes',r.facturas_vencidas>0);
 card('Valor del stock (a costo)',money(r.valor_stock),r.productos+' producto(s)');
 const L=$('#i-list');L.replaceChildren();
 const n=r.facturas_pendientes+r.sin_stock.length+r.poco_stock.length,urg=r.facturas_vencidas+r.sin_stock.length;
 $('#i-n').textContent=n?`${n} cosa${n>1?'s':''} (${urg} urgente${urg==1?'':'s'})`:'todo al día';
 if(!n)L.append(el('div',{className:'panel ok',textContent:'No hay nada pendiente: no debés facturas y todos los productos tienen stock.'}));
 if(r.para_pagar.length){const p=el('div',{className:'panel'},[el('h4',{},[el('span',{},['Para pagar',el('small',{textContent:r.facturas_pendientes+(r.facturas_vencidas?` · ${r.facturas_vencidas} urgente(s)`:'')})]),el('b',{textContent:money(r.debo)})])]);
  r.para_pagar.forEach(x=>{const d=x.dias_venc,t=d==null?'Sin vencimiento':(d<0?`Vencida hace ${-d} día${d==-1?'':'s'}`:(d===0?'Vence hoy':`Vence en ${d} día${d==1?'':'s'}`));
   p.append(el('div',{className:'row'+(x.estado==='vencida'?' u':'')},[el('div',{},[x.proveedor+(x.factura?' · factura '+x.factura:''),el('small',{textContent:t})]),el('b',{textContent:money(x.saldo)})]))});L.append(p)}
 const grp=(t,arr,u)=>{if(!arr.length)return;const p=el('div',{className:'panel'},[el('h4',{},[el('span',{},[t,el('small',{textContent:arr.length+(u?' · urgente(s)':'')})])])]);
  arr.forEach(x=>p.append(el('div',{className:'row'+(u?' u':'')},[el('div',{},[x.nombre,el('small',{textContent:x.categoria+(u?' · sin stock':' · quedan pocas unidades')})]),el('b',{textContent:'Stock: '+q(x.stock)})])));L.append(p)};
 grp('Sin stock',r.sin_stock,true);grp('Poco stock (hasta '+r.poco_stock_limite+' unidades)',r.poco_stock,false)}
document.querySelectorAll('.sub').forEach(sub=>{const sec=sub.parentElement.id.slice(2),pre={Compras:'c',Ventas:'v',Stock:'s'}[sec],hoja={Compras:'Compras',Ventas:'Ventas',Stock:'Movimientos'}[sec];
 sub.querySelectorAll('button').forEach(b=>b.onclick=guard(async()=>{
  sub.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));
  const h=b.dataset.s!=='nueva';$('#'+pre+'-nueva').classList.toggle('hide',h);$('#'+pre+'-hist').classList.toggle('hide',!h);
  if(h){const d=await call('/api/historial/'+(b.dataset.s==='hist2'?'Facturas':hoja));const box=$('#'+pre+'-hist');box.replaceChildren(
   el('table',{},[el('thead',{},el('tr',{},d.cols.map(c=>el('th',{textContent:c})))),
   el('tbody',{},d.filas.map(f=>el('tr',{},f.map(v=>el('td',{textContent:v})))))]))}}))});

/* ---------- diálogo ---------- */
function dialog(title,fields,onOk){
 $('#dlg-t').textContent=title;const b=$('#dlg-b');b.replaceChildren();const refs={};
 fields.forEach(f=>{let inp;if(f.box){const d=el('div',{className:'desg'});refs[f.k]=d;b.append(d);return}if(f.options){inp=el('select');(f.empty?['']:[]).concat(f.options).forEach(o=>inp.append(el('option',{value:o,textContent:o||'— elegir —'})))}
  else if(f.list){inp=el('input');inp.setAttribute('list','dl-'+f.k);const dl=el('datalist',{id:'dl-'+f.k});f.list.forEach(o=>dl.append(el('option',{value:o})));b.append(dl)}
  else if(f.check){inp=el('input',{type:'checkbox'});inp.checked=!!f.v}else inp=el('input');if(f.v!==undefined&&!f.check)inp.value=f.v;if(f.ro)inp.disabled=true;refs[f.k]=inp;
  if(f.onchange)inp.addEventListener('change',()=>f.onchange(refs));b.append(el('label',{className:f.check?'chk':''},[f.l,inp]))});
 $('#dlg-form').onsubmit=e=>{e.preventDefault();run()};
 const run=guard(async()=>{const v={};for(const k in refs)v[k]=refs[k].type==='checkbox'?refs[k].checked:refs[k].value;await onOk(v);});
 fields.forEach(f=>f.init&&f.init(refs));dlg.showModal();refs[fields[0].k].focus()}
const done=()=>dlg.close();

/* ---------- productos ---------- */
$('#p-cat').append(...['Todas',...CATS].map(c=>el('option',{textContent:c})));
$('#s-cat').append(...['Todas',...CATS].map(c=>el('option',{textContent:c})));
$('#p-cat').onchange=$('#p-q').oninput=()=>drawP();
function selectable(tbody,key,get,set){tbody.onclick=e=>{const tr=e.target.closest('tr');if(!tr)return;set(tr.dataset.k);
 tbody.querySelectorAll('tr').forEach(r=>r.classList.toggle('sel',r===tr))}}
function drawP(){const c=$('#p-cat').value,s=$('#p-q').value.toLowerCase(),b=$('#p-body');b.replaceChildren();
 prods.filter(p=>(c==='Todas'||p.categoria===c)&&p.nombre.toLowerCase().includes(s)).sort((a,b)=>a.nombre.localeCompare(b.nombre)).forEach(p=>{
  const tr=el('tr',{},[el('td',{textContent:p.nombre}),el('td',{textContent:p.categoria}),el('td',{className:'n',textContent:money(p.costo)}),el('td',{className:'n',textContent:money(p.costo_final)}),
   el('td',{className:'n',textContent:money(p.precio)}),el('td',{className:'n',textContent:p.precio>0&&p.costo_final>0?(Math.round((p.precio/p.costo_final-1)*1000)/10).toLocaleString('es-AR')+' %':'—'}),el('td',{className:'n',textContent:q(p.stock)})]);
  tr.dataset.k=p.nombre;if(p.nombre===selP)tr.classList.add('sel');tr.ondblclick=()=>{selP=p.nombre;prodEditar()};b.append(tr)})}
selectable($('#p-body'),0,0,k=>selP=k);
const FIJOS=IMPUESTOS_FIJOS;
function calcCosto(neto,interno){const L=FIJOS.map(([n,pc])=>[n,pc,neto*pc/100]);if(interno)L.push(['Impuesto interno',interno,neto*interno/100]);
 return{lineas:L,total:L.reduce((a,x)=>a+x[2],neto)}}
function prodDialog(p){const nuevo=!p;p=p||{};
 const f=[{k:'nombre',l:'Nombre de producto',v:p.nombre||''},{k:'categoria',l:'Categoría',options:CATS,empty:!p.categoria,v:p.categoria||''},
  {k:'costo',l:'Costo de compra (neto, sin impuestos)',v:p.costo??0},
  {k:'check',l:'Agregar impuesto interno',check:1,v:!!p.interno},
  {k:'interno',l:'Impuesto interno % (entre 0 y 30)',v:p.interno||''},
  {k:'box',box:1,init:r=>{
   const g=x=>{try{return num(x)}catch(e){return 0}};
   const upd=origin=>{r.interno.disabled=!r.check.checked;const i=r.check.checked?g(r.interno.value):0;const d=calcCosto(g(r.costo.value),i);
    r.box.replaceChildren(el('table',{},[...d.lineas.map(l=>el('tr',{},[el('td',{textContent:l[0]+' '+l[1].toLocaleString('es-AR')+' %'}),el('td',{className:'n',textContent:money(l[2])})])),
     el('tr',{className:'tt'},[el('td',{textContent:'Costo final'}),el('td',{className:'n',textContent:money(d.total)})])]));
    if(origin==='precio'){r._m=d.total>0?(g(r.precio.value)/d.total-1)*100:null;r.margen.value=r._m==null?'':Math.round(r._m*10)/10}
    else if(origin==='margen')r._m=r.margen.value===''?null:g(r.margen.value);
    if((origin==='costo'||origin==='margen')&&r._m!=null)r.precio.value=Math.round(d.total*(1+r._m/100)*100)/100};
   ['costo','interno'].forEach(k=>r[k].addEventListener('input',()=>upd('costo')));r.margen.addEventListener('input',()=>upd('margen'));
   r.check.addEventListener('change',()=>upd('costo'));r.precio.addEventListener('input',()=>upd('precio'));
   upd(g(r.precio.value)>0?'precio':null)}},
  {k:'margen',l:'Margen de ganancia % (calcula el precio)',v:''},
  {k:'precio',l:'Precio de venta',v:p.precio??0}];
 if(nuevo)f.push({k:'stock',l:'Stock inicial',v:'0'});
 dialog(nuevo?'Nuevo producto':'Editar producto',f,async v=>{
  let interno=null;if(v.check){interno=num(v.interno);if(interno<0||interno>30)throw Error('El impuesto interno debe estar entre 0 y 30 %.')}
  const body={nombre:v.nombre,categoria:v.categoria,costo:num(v.costo),precio:num(v.precio),interno};
  if(nuevo){body.stock=v.stock;await call('/api/productos','POST',body);toast('Producto guardado')}
  else{await call('/api/productos','PUT',{...body,original:p.nombre});selP=v.nombre}
  done();load()})}
const prodNuevo=()=>prodDialog();
const prodEditar=()=>{const p=byName(selP);if(!p)return toast('Elegí un producto de la lista.',true);prodDialog(p)};
const prodBorrar=guard(async()=>{const p=byName(selP);if(!p)return toast('Elegí un producto de la lista.',true);
 if(!confirm('¿Eliminar «'+p.nombre+'»?\n(El historial se conserva)'))return;
 await call('/api/productos','DELETE',{nombre:p.nombre});selP=null;load()});

/* ---------- compras: proveedores y facturas ---------- */
let provs=[],facts=[],provSel=null,selF=null,fFiltro='todas',fOrden='rec',selV=null;
const dec=n=>Number(n).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
async function drawC(){[provs,facts]=await Promise.all([call('/api/proveedores'),call('/api/facturas')]);
 if(provSel&&!provs.some(p=>p.nombre===provSel))provSel=null;if(selF!=null&&!facts.some(f=>f.id===selF))selF=null;drawPv();drawFv()}
function drawPv(){const tot=provs.reduce((a,p)=>a+p.debo,0),pen=provs.reduce((a,p)=>a+p.pendientes,0),D=$('#pv-debo');
 D.textContent=`Debo en total: ${money(tot)}  (${pen} factura${pen==1?'':'s'} pendiente${pen==1?'':'s'})`;D.className='debo'+(tot>0?' red':'');
 const s=$('#pv-q').value.toLowerCase(),b=$('#pv-body');b.replaceChildren();
 const row=(k,n,d)=>{const tr=el('tr',{},[el('td',{textContent:n}),el('td',{className:'n',textContent:dec(d)})]);tr.dataset.k=k;if((provSel||'')===k)tr.classList.add('sel');b.append(tr)};
 row('','Todos los proveedores',tot);provs.filter(p=>p.nombre.toLowerCase().includes(s)).forEach(p=>row(p.nombre,p.nombre,p.debo));
 const i=$('#pv-info');i.replaceChildren();const p=provs.find(x=>x.nombre===provSel);
 if(!p){i.append(el('div',{className:'mute',textContent:'Elegí un proveedor para ver o cambiar sus datos (teléfono, email, CUIT…).'}));return}
 [['Teléfono',p.telefono],['Email',p.email],['CUIT',p.cuit],['Notas',p.notas]].filter(x=>x[1]).forEach(([l,v])=>i.append(el('div',{},[el('b',{textContent:l+': '}),v])));
 if(!p.telefono&&!p.email&&!p.cuit&&!p.notas)i.append(el('div',{className:'mute',textContent:'Sin datos de contacto cargados.'}));
 i.append(el('div',{className:'btns'},[el('button',{className:'b',textContent:'Editar',onclick:()=>provDlg(p)}),el('button',{className:'b',textContent:'Eliminar',onclick:()=>provBorrar(p)})]))}
$('#pv-body').onclick=e=>{const tr=e.target.closest('tr');if(!tr)return;provSel=tr.dataset.k||null;selF=null;drawPv();drawFv()};
$('#pv-q').oninput=drawPv;
function drawFv(){const mine=facts.filter(f=>!provSel||f.proveedor===provSel),sum=k=>mine.reduce((a,f)=>a+f[k],0);
 $('#fv-t').textContent=provSel||'Todos los proveedores';$('#fv-n').textContent=`${mine.length} factura${mine.length==1?'':'s'} cargada${mine.length==1?'':'s'}`;
 const K=$('#fv-kpis');K.replaceChildren();
 [['Total facturado',sum('total'),''],['IVA de las compras',sum('iva'),''],['Pagado',sum('pagado'),'grn'],['Debo',sum('saldo'),'red']].forEach(([l,v,c])=>K.append(el('div',{className:'kpi '+c},[el('div',{className:'l',textContent:l}),el('div',{className:'v',textContent:money(v)})])));
 const list=mine.filter(f=>fFiltro==='todas'||(fFiltro==='pendientes'?f.saldo>0.005:f.saldo<=0.005));
 list.sort((a,b)=>(a.fecha_iso<b.fecha_iso?-1:a.fecha_iso>b.fecha_iso?1:a.id-b.id)*(fOrden==='rec'?-1:1));
 const b=$('#fv-body');b.replaceChildren();const showP=!provSel;$('#fv-thp').classList.toggle('hide',!showP);
 if(!list.length){b.append(el('tr',{},[el('td',{colSpan:showP?8:7,className:'vacio',textContent:facts.length?'No hay facturas con ese filtro.':'Todavía no cargaste facturas de compra. Usá «+ Nueva factura».'})]));return}
 const cls={pagada:'f-pag',vencida:'f-venc',pendiente:'f-pend'};
 list.forEach(f=>{const tr=el('tr',{className:cls[f.estado]},[...(showP?[el('td',{className:'pc',textContent:f.proveedor,title:f.proveedor})]:[]),el('td',{textContent:f.factura||'—'}),el('td',{textContent:f.fecha}),el('td',{className:'vc',textContent:f.vence||'—'}),
  el('td',{className:'n',textContent:dec(f.total)}),el('td',{className:'n',textContent:dec(f.iva)}),el('td',{className:'n',textContent:dec(f.pagado)}),el('td',{className:'n',textContent:dec(f.saldo)})]);
  tr.dataset.k=f.id;if(f.id===selF)tr.classList.add('sel');tr.ondblclick=()=>{selF=f.id;facVer()};b.append(tr)})}
$('#fv-body').onclick=e=>{const tr=e.target.closest('tr');if(!tr||!tr.dataset.k)return;selF=+tr.dataset.k;drawFv()};
document.querySelectorAll('.filt .seg').forEach(b=>b.onclick=()=>{if(b.dataset.f)fFiltro=b.dataset.f;else fOrden=b.dataset.o;
 document.querySelectorAll('.filt .seg').forEach(x=>{if((x.dataset.f&&b.dataset.f)||(x.dataset.o&&b.dataset.o))x.classList.toggle('on',x===b)});drawFv()});
const needF=()=>{const f=facts.find(x=>x.id===selF);if(!f)throw Error('Elegí una factura de la lista.');return f};
const facVer=guard(async()=>{await facturaDlg(needF().id)});
const pagoDlg=guard(async total=>{const f=needF();if(f.saldo<=0.005)throw Error('Esa factura ya está pagada.');
 dialog(total?'Marcar como pagada':'Registrar pago',[{k:'fecha',l:'Fecha del pago',v:hoy()},
  {k:'monto',l:'Monto (saldo: '+money(f.saldo)+')',v:String(f.saldo).replace('.',','),ro:!!total},{k:'medio',l:'Medio de pago',options:PAGOS,v:PAGOS[0]},{k:'nota',l:'Nota (opcional)'}],
  async v=>{const m=total?f.saldo:num(v.monto);const r=await call('/api/facturas/'+f.id+'/pago','POST',{monto:m,fecha:v.fecha,medio:v.medio,nota:v.nota});
   done();toast(r.saldo<=0.005?'Factura pagada por completo.':'Pago registrado. Saldo: '+money(r.saldo));load()})});
const facArchivo=guard(async()=>{const f=needF();await abrirAdjunto(f.archivo);toast('Abriendo '+f.archivo+'…')});
const facBorrar=guard(async()=>{const f=needF();
 if(!confirm('¿Eliminar la factura '+(f.factura||'sin número')+' de '+f.proveedor+'?\n\nSe borran el registro y sus pagos. El stock y los movimientos NO se modifican.'))return;
 await call('/api/facturas/'+f.id,'DELETE');selF=null;toast('Factura eliminada');load()});
const provDlg=p=>dialog(p?'Editar proveedor':'Nuevo proveedor',[{k:'nombre',l:'Nombre',v:p?p.nombre:''},{k:'telefono',l:'Teléfono',v:p?p.telefono:''},{k:'email',l:'Email',v:p?p.email:''},{k:'cuit',l:'CUIT',v:p?p.cuit:''},{k:'notas',l:'Notas',v:p?p.notas:''}],
 async v=>{if(p)await call('/api/proveedores','PUT',{...v,original:p.nombre});else await call('/api/proveedores','POST',v);provSel=v.nombre.trim();done();toast('Proveedor guardado');load()});
const provBorrar=guard(async p=>{if(!confirm('¿Eliminar el proveedor «'+p.nombre+'»?'))return;await call('/api/proveedores','DELETE',{nombre:p.nombre});provSel=null;toast('Proveedor eliminado');load()});

/* ---------- diálogo: factura de compra ---------- */
const dF=$('#dlgF'),FI=[['neto','Neto'],['iva','IVA'],['percepcion_iva','Percep. IVA'],['iibb','Percep. IIBB'],['interno','Imp. interno'],['flete','Flete'],['total','Total']];
let F=null;
FI.forEach(([k,l])=>$('#f-imps').append(el('label',{},[l,el('input',{id:'fi-'+k,inputMode:'decimal',placeholder:l}),el('small',{id:'fp-'+k,className:'pc'})])));
const fgv=k=>{try{return num($('#fi-'+k).value)}catch(e){return 0}};
const fsub=()=>F.lineas.reduce((a,l)=>a+l.cant*l.precio,0);
function calc(s){s=String(s).trim();if(!s)return NaN;if(s[0]!=='=')return num(s);const x=s.slice(1).replace(/\s/g,'');
 if(!x||!/^[\d.,+\-*\/()]+$/.test(x))throw Error('Fórmula inválida: '+s);
 let v;try{v=Function('"use strict";return ('+x.replace(/[\d.,]+/g,t=>String(num(t)))+')')()}catch(e){throw Error('Fórmula inválida: '+s)}
 if(!isFinite(v))throw Error('Fórmula inválida: '+s);return Math.round(v*10000)/10000}
function fImp(){if(!F)return;const sum=fsub();$('#fi-neto').placeholder=sum?dec(sum):'Neto';const neto=fgv('neto')||sum;
 const otros=['iva','percepcion_iva','iibb','interno','flete'].reduce((a,k)=>a+fgv(k),0);$('#fi-total').placeholder=neto?dec(neto+otros):'Total';
 FI.forEach(([k])=>{$('#fp-'+k).textContent=(k==='neto'||k==='total'||!neto||!fgv(k))?'':(Math.round(fgv(k)/neto*10000)/100).toLocaleString('es-AR')+' % del neto'});
 const tot=fgv('total'),c=$('#f-chk');
 if(tot&&neto){const ok=Math.abs(neto+otros-tot)<=1;c.className='chk2 '+(ok?'okc':'warn');
  c.textContent=ok?'✓ Neto + impuestos coincide con el total.':'⚠ No cierra: neto + impuestos = '+money(neto+otros)+' y el total es '+money(tot)+'. Revisá los importes.'}else{c.textContent='';c.className='chk2'}}
FI.forEach(([k])=>$('#fi-'+k).addEventListener('input',fImp));
function fDraw(){const b=$('#f-lin');b.replaceChildren();
 F.lineas.forEach((l,i)=>{const p=l.vinculo?byName(l.vinculo):null,vin=l.nuevo?'Nuevo: '+l.nuevo.nombre+' ('+l.nuevo.categoria+')':(l.vinculo||'— sin vincular —');
  let cam='',cc='';if(l.nuevo)cam='Nuevo';else if(p&&p.costo>0){const x=(l.precio/p.costo-1)*100;cam=(x>=0?'+':'')+(Math.round(x*10)/10).toLocaleString('es-AR')+' %';cc=x>0.05?'warn':(x<-0.05?'grn':'')}
  const tr=el('tr',{},[el('td',{textContent:l.desc}),el('td',{className:'n',textContent:q(l.cant)}),el('td',{className:'n',textContent:money(l.precio)}),el('td',{className:'n',textContent:money(l.cant*l.precio)}),
   el('td',{textContent:vin,className:(l.vinculo||l.nuevo)?'':'warn'}),el('td',{className:'n '+cc,textContent:cam})]);
  tr.dataset.k=i;if(i===F.sel)tr.classList.add('sel');tr.ondblclick=()=>fLineaDlg(i);b.append(tr)});
 $('#f-sub').textContent=money(fsub());fImp()}
function fProds(){const s=$('#f-q').value.toLowerCase(),b=$('#f-pbody');b.replaceChildren();
 [...F.nuevos.map(n=>({nombre:n.nombre,costo:null,nuevo:true})),...prods.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre))].filter(p=>p.nombre.toLowerCase().includes(s)).forEach(p=>{
  const tr=el('tr',{},[el('td',{textContent:p.nombre+(p.nuevo?'  (nuevo)':'')}),el('td',{className:'n',textContent:p.costo==null?'—':dec(p.costo)})]);tr.dataset.k=p.nombre;if(p.nombre===F.prod)tr.classList.add('sel');b.append(tr)});
 $('#f-hint').textContent=F.prod?'Producto elegido: '+F.prod:'←  Elegí el producto que compraste (opcional)'}
$('#f-q').oninput=()=>F&&fProds();
$('#f-pbody').onclick=e=>{const tr=e.target.closest('tr');if(!tr||!F)return;F.prod=tr.dataset.k;fProds()};
$('#f-lin').onclick=e=>{const tr=e.target.closest('tr');if(!tr||!F)return;F.sel=+tr.dataset.k;fDraw()};
const nuevoDe=n=>F.nuevos.find(x=>x.nombre===n)||null;
$('#f-add').onclick=guard(async()=>{if(!F.prod)throw Error('Elegí primero un producto de la lista de la izquierda (o creá uno con «+ Nuevo»).');
 if(!$('#f-cant').value.trim())throw Error('Ingresá la cantidad.');const cant=num($('#f-cant').value),precio=calc($('#f-precio').value);
 if(cant<=0)throw Error('La cantidad debe ser mayor a 0.');if(isNaN(precio)||precio<0)throw Error('Ingresá el precio por unidad (podés usar una cuenta, por ejemplo =75600/4).');
 const nu=nuevoDe(F.prod);F.lineas.push({desc:F.prod,cant,precio,vinculo:nu?'':F.prod,nuevo:nu});$('#f-cant').value=$('#f-precio').value='';fDraw();$('#f-cant').focus()});
['#f-cant','#f-precio'].forEach(s=>$(s).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#f-add').click()}}));
$('#f-vinc').onclick=guard(async()=>{const l=F.lineas[F.sel];if(!l)throw Error('Elegí primero una línea de la factura (tabla de la derecha).');if(!F.prod)throw Error('Elegí el producto en la lista de la izquierda.');
 const nu=nuevoDe(F.prod);l.vinculo=nu?'':F.prod;l.nuevo=nu;fDraw()});
$('#f-quit').onclick=()=>{if(F.sel!=null&&F.lineas[F.sel]){F.lineas.splice(F.sel,1);F.sel=null;fDraw()}};
$('#f-new').onclick=()=>{const l=F.lineas[F.sel];dialog('Producto nuevo',[{k:'nombre',l:'Nombre de producto',v:l?l.desc:''},{k:'categoria',l:'Categoría',options:CATS,empty:1}],async v=>{
 const nombre=v.nombre.trim();if(!nombre)throw Error('Falta el nombre.');if(!CATS.includes(v.categoria))throw Error('Elegí una categoría.');
 if(byName(nombre)||nuevoDe(nombre))throw Error('Ya existe un producto con ese nombre: elegilo de la lista.');
 F.nuevos.push({nombre,categoria:v.categoria});if(l){l.vinculo='';l.nuevo=nuevoDe(nombre)}else F.prod=nombre;done();fProds();fDraw()})};
const fLineaDlg=i=>{const l=F.lineas[i];dialog('Editar línea',[{k:'desc',l:'Producto (como figura en la factura)',v:l.desc},{k:'cant',l:'Cantidad',v:String(l.cant).replace('.',',')},{k:'precio',l:'Precio por unidad (podés usar =75600/4)',v:String(l.precio).replace('.',',')}],
 async v=>{const cant=num(v.cant),precio=calc(v.precio);if(!v.desc.trim())throw Error('Falta el nombre.');if(cant<=0)throw Error('La cantidad debe ser mayor a 0.');if(isNaN(precio)||precio<0)throw Error('Precio inválido.');
  Object.assign(l,{desc:v.desc.trim(),cant,precio});done();fDraw()})};
$('#f-adj').onclick=()=>$('#f-file').click();
$('#f-file').onchange=e=>{const f=e.target.files[0];if(!f||!F)return;F.file=f;$('#f-adjn').textContent=f.name;e.target.value=''};
$('#f-leer').onclick=guard(async()=>{if(!F.file)throw Error('Primero adjuntá el archivo de la factura (PDF o Word).');
 toast('Leyendo factura…');const fd=new FormData();fd.append('archivo',F.file);const d=await call('/api/factura','POST',fd);
 if(d.proveedor&&!$('#f-prov').value.trim())$('#f-prov').value=d.proveedor;if(d.factura&&!$('#f-nro').value.trim())$('#f-nro').value=d.factura;
 if(d.fecha)$('#f-fecha').value=d.fecha;if(d.vencimiento&&!$('#f-vence').value.trim())$('#f-vence').value=d.vencimiento;
 const im=d.impuestos||{};FI.forEach(([k])=>{$('#fi-'+k).value=im[k]!=null?dec(im[k]):''});
 if(d.items.length){F.lineas=d.items.map(it=>({desc:it.nombre,cant:it.cantidad,precio:it.precio,vinculo:it.vinculo||'',nuevo:null}));F.sel=null}
 fDraw();const sin=F.lineas.filter(l=>!l.vinculo&&!l.nuevo).length,nImp=FI.filter(([k])=>im[k]!=null&&k!=='neto'&&k!=='total').length;
 toast((d.items.length?`Se leyeron ${d.items.length} producto(s)`:'No pude detectar productos (cargalos a mano)')+(nImp?` y ${nImp} impuesto(s)`:' (no encontré impuestos)')+'.'+
  (sin?`\n${sin} línea(s) sin vincular: elegí cada línea, elegí el producto a la izquierda y tocá «Vincular con producto» (o creá uno con «+ Nuevo»).`:'')+'\nRevisá todos los importes antes de guardar.',!d.items.length&&!nImp)});
async function facturaDlg(id){prods=await call('/api/productos');provs=await call('/api/proveedores');
 const ed=id!=null?await call('/api/facturas/'+id):null;F={id:ed?ed.id:null,edit:!!ed,lineas:[],nuevos:[],sel:null,prod:null,file:null};
 $('#f-t').textContent=ed?'Factura de compra':'Nueva factura de compra';
 $('#f-subt').textContent=ed?'Podés corregir los datos de la cabecera. Los productos ya sumaron stock, por eso no se editan acá.':'Cargá los datos de la factura y, si querés, los productos comprados para actualizar el stock y los costos.';
 $('#f-provs').replaceChildren(...provs.map(p=>el('option',{value:p.nombre})));
 $('#f-prov').value=ed?ed.proveedor:(provSel||'');$('#f-nro').value=ed?ed.factura:'';$('#f-fecha').value=ed?ed.fecha:hoy();$('#f-vence').value=ed?ed.vence:'';
 FI.forEach(([k])=>{$('#fi-'+k).value=ed&&ed[k]?dec(ed[k]):''});$('#f-notas').value=ed?ed.notas:'';$('#f-adjn').textContent=ed&&ed.archivo?ed.archivo:'Sin archivo adjunto';
 $('#f-prod').classList.toggle('hide',!!ed);$('#f-ro').classList.toggle('hide',!ed);$('#f-leer').classList.toggle('hide',!!ed);$('#f-ok').textContent=ed?'Guardar cambios':'Guardar factura';
 $('#f-q').value='';$('#f-cant').value=$('#f-precio').value='';$('#f-upd').checked=true;
 if(ed){$('#f-robody').replaceChildren(...(ed.lineas.length?ed.lineas.map(l=>el('tr',{},[el('td',{textContent:l.producto}),el('td',{className:'n',textContent:q(l.cantidad)}),el('td',{className:'n',textContent:money(l.precio)}),el('td',{className:'n',textContent:money(l.subtotal)})])):
   [el('tr',{},[el('td',{colSpan:4,className:'vacio',textContent:'Esta factura se cargó sin productos.'})])]));
  $('#f-ronote').textContent=`Pagado: ${money(ed.pagado)} · Saldo: ${money(ed.saldo)}`+(ed.pagos.length?'  ·  Pagos: '+ed.pagos.map(p=>p.fecha+' '+money(p.monto)+' ('+p.medio+')').join(', '):'')}
 else{fProds();fDraw()}
 fImp();dF.showModal();$('#f-prov').focus()}
dF.addEventListener('close',()=>{F=null});
$('#f-cancel').onclick=()=>dF.close();
$('#f-ok').onclick=guard(async()=>{const imp={};FI.forEach(([k,l])=>{try{imp[k]=num($('#fi-'+k).value)}catch(e){throw Error('Importe inválido en «'+l+'».')}});
 const body={proveedor:$('#f-prov').value.trim(),factura:$('#f-nro').value.trim(),fecha:$('#f-fecha').value.trim(),vence:$('#f-vence').value.trim(),impuestos:imp,notas:$('#f-notas').value.trim()};
 if(!body.proveedor)throw Error('Elegí o escribí el proveedor.');
 if(!F.edit){if(!F.lineas.length&&!(imp.neto||imp.total))throw Error('Cargá al menos un producto o los importes (neto o total) de la factura.');
  const sin=F.lineas.filter(l=>!l.vinculo&&!l.nuevo).length;
  if(sin&&!confirm(sin+' línea(s) sin vincular con un producto.\n\nQuedan en el historial de la factura pero NO suman stock ni cambian costos.\n\n¿Guardar igual?'))return;
  body.items=F.lineas.map(l=>{const nom=l.nuevo?l.nuevo.nombre:l.vinculo;return nom?{nombre:nom,categoria:l.nuevo?l.nuevo.categoria:undefined,cantidad:l.cant,precio:l.precio,descripcion:l.desc,vinculado:true}:
   {nombre:'',vinculado:false,descripcion:l.desc,cantidad:l.cant,precio:l.precio}});body.actualizar_costos=$('#f-upd').checked}
 const fd=new FormData();fd.append('datos',JSON.stringify(body));if(F.file)fd.append('archivo',F.file);
 const eraEdit=F.edit,conStock=!F.edit&&F.lineas.some(l=>l.vinculo||l.nuevo);
 const r=await call(eraEdit?'/api/facturas/'+F.id:'/api/facturas',eraEdit?'PUT':'POST',fd);
 dF.close();if(provSel&&provSel!==body.proveedor)provSel=body.proveedor;selF=r.id;
 toast(r.aviso||(eraEdit?'Cambios guardados.':'Factura guardada'+(conStock?': stock y costos actualizados.':'.')),!!r.aviso);load()});

function quitar(){if(selV!=null&&selV<venta.length)venta.splice(selV,1);selV=null;drawV()}
function vaciar(){venta=[];drawV()}

/* ---------- ventas ---------- */
$('#v-pago').append(...PAGOS.map(p=>el('option',{textContent:p})));$('#v-fecha').value=hoy();
function drawV(){const b=$('#v-body');b.replaceChildren();let t=0;
 venta.forEach((it,i)=>{const sub=it.cantidad*it.precio;t+=sub;
  const tr=el('tr',{},[el('td',{textContent:it.nombre}),el('td',{textContent:it.categoria}),el('td',{className:'n',textContent:q(it.cantidad)}),
   el('td',{className:'n',textContent:money(it.precio)}),el('td',{className:'n',textContent:money(sub)})]);tr.dataset.k=i;
  if(i===selV)tr.classList.add('sel');b.append(tr)});$('#v-tot').textContent='Total: '+money(t)}
selectable($('#v-body'),0,0,k=>selV=+k);
const itemVenta=()=>dialog('Agregar a la venta',[
 {k:'nombre',l:'Producto',options:prods.map(p=>p.nombre).sort(),empty:1,onchange:r=>{const p=byName(r.nombre.value);
  if(p){r.precio.value=p.precio||'';r.info.value='Stock disponible: '+q(p.stock)}}},
 {k:'info',l:'',ro:1},{k:'cantidad',l:'Cantidad',v:'1'},{k:'precio',l:'Precio unitario'}],
 async v=>{const p=byName(v.nombre);if(!p)throw Error('Elegí un producto.');const cant=num(v.cantidad),precio=num(v.precio);
  if(cant<=0)throw Error('La cantidad debe ser mayor a 0.');if(precio<=0)throw Error('Ingresá el precio de venta.');
  const ya=venta.filter(i=>i.nombre===p.nombre).reduce((a,i)=>a+i.cantidad,0);
  if(ya+cant>p.stock)throw Error(`Stock insuficiente de «${p.nombre}» (hay ${q(p.stock)}, ya agregaste ${q(ya)}).`);
  venta.push({nombre:p.nombre,categoria:p.categoria,cantidad:cant,precio});done();drawV()});
const guardarVenta=guard(async()=>{if(!venta.length)throw Error('Agregá al menos un producto.');
 const tot=venta.reduce((a,i)=>a+i.cantidad*i.precio,0);
 const r=await call('/api/ventas','POST',{fecha:$('#v-fecha').value,pago:$('#v-pago').value,items:venta});
 venta=[];$('#v-fecha').value=hoy();toast(`Venta N° ${r.numero} guardada. Total: ${money(tot)} (${$('#v-pago').value})`);load()});

/* ---------- stock ---------- */
$('#s-cat').onchange=$('#s-q').oninput=()=>drawS();let selS=null;
function drawS(){const c=$('#s-cat').value,s=$('#s-q').value.toLowerCase(),b=$('#s-body');b.replaceChildren();let u=0,v=0;
 prods.filter(p=>(c==='Todas'||p.categoria===c)&&p.nombre.toLowerCase().includes(s)).sort((a,b)=>a.nombre.localeCompare(b.nombre)).forEach(p=>{
  u+=p.stock;v+=p.stock*p.costo;const tr=el('tr',{},[el('td',{textContent:p.nombre}),el('td',{textContent:p.categoria}),
   el('td',{className:'n',textContent:q(p.stock)}),el('td',{className:'n',textContent:money(p.costo)}),el('td',{className:'n',textContent:money(p.stock*p.costo)})]);
  tr.dataset.k=p.nombre;if(p.nombre===selS)tr.classList.add('sel');b.append(tr)});
 $('#s-res').textContent=`Unidades: ${q(u)}   |   Valor del stock (a costo): ${money(v)}`}
selectable($('#s-body'),0,0,k=>selS=k);
const stockDlg=modo=>dialog(modo==='sumar'?'Cargar stock':'Fijar stock (inventario)',[
 {k:'nombre',l:'Producto',options:prods.map(p=>p.nombre).sort(),empty:1,v:selS||''},
 {k:'cantidad',l:modo==='sumar'?'Cantidad a sumar':'Stock real contado'},{k:'detalle',l:'Detalle (opcional)'}],
 async v=>{if(!v.nombre)throw Error('Elegí un producto.');await call('/api/stock','POST',{...v,cantidad:num(v.cantidad),modo});
  done();toast('Stock actualizado');load()});


/* ---------- conexión con GitHub, sincronización y PWA ---------- */
$('#mtheme').onclick=()=>$('#theme').click();
const hhmm=iso=>iso?new Date(iso).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}):'';
function pintarEstado(){const e=$('#sync');if(!e)return;
 const vencida=!!B&&B.tipo==='drive'&&!B.sesionVigente();
 e.textContent=!B?'':!Store.enLinea?`⚠ Sin conexión · datos de las ${hhmm(Store.ultima)}`:vencida?`⚠ ${B.etiqueta()} · tocá cualquier botón para renovar la sesión`:`☁ ${B.etiqueta()} · sincronizado ${hhmm(Store.ultima)}`;
 e.classList.toggle('warn',!!B&&(!Store.enLinea||vencida))}
let pendiente=false;
Store.onCambio=()=>{if(document.querySelector('dialog[open]'))pendiente=true;else load().then(pintarEstado)};
document.addEventListener('close',()=>{if(pendiente&&!document.querySelector('dialog[open]')){pendiente=false;load()}},true);
const refrescar=()=>{if(!document.hidden&&Store.conectado())Store.cargar().then(pintarEstado).catch(e=>{pintarEstado();if(e.status===401)toast(e.message,true)})};
setInterval(refrescar,20000);document.addEventListener('visibilitychange',refrescar);window.addEventListener('online',refrescar);

let stTipo='drive';
function stTab(t){stTipo=t;$('#st-drive').classList.toggle('hide',t!=='drive');$('#st-github').classList.toggle('hide',t!=='github');
 $('#tab-drive').classList.toggle('on',t==='drive');$('#tab-github').classList.toggle('on',t==='github');$('#st-err').textContent=''}
function verSetup(msg){$('#setup').classList.remove('hide');const c=Cfg.leer()||{};
 $('#st-owner').value=c.owner||'';$('#st-repo').value=c.repo||'flamingo-datos';$('#st-token').value='';
 $('#st-client').value=c.clientId||window.FLAMINGO_CLIENT_ID||'';stTab(c.tipo==='github'||(c.owner&&!c.tipo)?'github':'drive');$('#st-err').textContent=msg||''}
$('#st-form').onsubmit=async ev=>{ev.preventDefault();const b=$('#st-ok');b.disabled=true;const txt=b.textContent;b.textContent='Conectando…';$('#st-err').textContent='';
 try{await Store.conectar(stTipo==='drive'?{tipo:'drive',clientId:$('#st-client').value}:{tipo:'github',owner:$('#st-owner').value,repo:$('#st-repo').value,token:$('#st-token').value});
  $('#setup').classList.add('hide');toast('Conectado');go('Inicio');pintarEstado()}
 catch(e){$('#st-err').textContent=e.message}finally{b.disabled=false;b.textContent=txt}};

function cfgDlg(){$('#cfg-info').textContent=`Datos en: ${B?B.descripcion():'—'}`;$('#cfg-re').classList.toggle('hide',!B||B.tipo!=='drive');
 $('#cfg-sync').textContent=Store.enLinea?`Última sincronización: ${hhmm(Store.ultima)}`:`Sin conexión. Mostrando datos guardados a las ${hhmm(Store.ultima)}.`;$('#dlgCfg').showModal()}
const cfgSync=guard(async()=>{await Store.cargar();await load();pintarEstado();cfgDlg();toast(Store.enLinea?'Datos al día':'Sin conexión',!Store.enLinea)});
const cfgBajar=guard(async()=>{const blob=datosAExcel(Store.hojas);const a=document.createElement('a');a.href=URL.createObjectURL(blob);
 a.download='flamingo_db_'+hoyISO()+'.xlsx';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),30000);toast('Excel descargado')});
$('#cfg-xl').onchange=guard(async ev=>{const f=ev.target.files[0];ev.target.value='';if(!f)return;
 const hojas=await excelADatos(await f.arrayBuffer());
 const n=hojas.Productos.length,fa=hojas.Facturas.length,ve=new Set(hojas.Ventas.map(r=>r[1])).size;
 const hay=Store.hojas&&(Store.hojas.Productos.length||Store.hojas.Facturas.length||Store.hojas.Ventas.length);
 if(!confirm(`Este Excel tiene ${n} producto(s), ${fa} factura(s) y ${ve} venta(s).\n\n${hay?'Esto REEMPLAZA todos los datos que hay ahora en GitHub. ':''}¿Importar?`))return;
 await Store.reemplazar(hojas,'Flamingo: importar Excel');$('#dlgCfg').close();await load();pintarEstado();toast('Excel importado')});
const cfgReconectar=guard(async()=>{await B.reconectar();await Store.cargar();await load();pintarEstado();toast('Sesión de Google renovada')});
const cfgSalir=()=>{if(!confirm('¿Desconectar este dispositivo?\nLos datos siguen guardados en la nube; solo se borra el acceso guardado en este dispositivo.'))return;Store.desconectar();location.reload()};

function verLogin(){$('#login').classList.remove('hide');const c=Cfg.leer()||{};$('#lg-cuenta').textContent=c.email?`Cuenta: ${c.email}`:'';$('#lg-err').textContent=''}
$('#lg-ok').onclick=async()=>{const b=$('#lg-ok');b.disabled=true;$('#lg-err').textContent='';
 try{await B.reconectar();await Store.cargar();$('#login').classList.add('hide');go('Inicio');pintarEstado()}
 catch(e){$('#lg-err').textContent=e.message}finally{b.disabled=false}};
$('#lg-off').onclick=()=>{Store._cache();if(Store.hojas){Store.enLinea=false;$('#login').classList.add('hide');go('Inicio');pintarEstado()}else $('#lg-err').textContent='Todavía no hay datos guardados en este dispositivo.'};
async function arrancar(){
 if(!Store.iniciar()){verSetup();return}
 if(B.tipo==='drive'&&!B.sesionVigente()){verLogin();return}  // Google necesita un toque para abrir su ventana de acceso
 try{await Store.cargar()}catch(e){if(B.tipo==='github'&&(e.status===401||e.status===404||e.status===403)){verSetup(e.message);return}toast(e.message,true)}
 go('Inicio');pintarEstado()}
arrancar();
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
