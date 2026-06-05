/* =========================================================================
   app.js — tablero protegido (app.html). `sb` viene de config.js.
   Roles: admin = edita todo (paneles); cliente = ve su portafolio,
   registra operaciones y administra sus parámetros, sin editar tablas.
   ========================================================================= */
const $ = (id) => document.getElementById(id);
const PALETTE = ['#0A2540','#15467A','#2D6CB0','#15784B','#9A6A12','#5B6B7C','#3E6E9C','#7C8AA0','#A8B4C4','#1F4E79'];
const SECTORS = ['Tecnología','Consumo básico','Salud','Financiero','Industrial','Energía','Materiales','Comunicación','Servicios públicos','Bienes raíces','ETF amplio','Cripto / ETF spot','Otro'];
const ASSET_TYPES = ['Acción','ETF','ETF apalancado','Cripto / ETF spot','Fibra','Bono / CETES','Otro'];
const FREQS = ['Mensual','Trimestral','Semestral','Anual','—'];

/* ---------- formato ---------- */
const nf2 = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n) => (n == null ? '—' : '$' + nf2.format(Number(n)));
const pct   = (n) => (n == null ? '—' : (Number(n) * 100).toFixed(2) + '%');
const qty   = (n) => (n == null ? '—' : Number(n).toLocaleString('es-MX', { maximumFractionDigits: 6 }));
const dmy   = (s) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const signClass = (n) => (Number(n) > 0 ? 'pos' : Number(n) < 0 ? 'neg' : '');
const esc = (v) => (v == null ? '' : String(v).replace(/"/g, '&quot;'));

/* ---------- sesión y rol ---------- */
let userRole = 'viewer';
let myUid = null;
async function initSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.replace('auth.html'); return; }
  myUid = session.user.id;
  $('m-email').textContent = session.user.email;
  const { data: me } = await sb.from('profiles').select('role').eq('id', myUid).maybeSingle();
  userRole = (me && me.role) ? me.role : 'viewer';
  applyRole(userRole);
  if (userRole === 'admin') await setupClientSwitch();
  loadAll();
  subscribeRealtime();
}
function applyRole(role) {
  const admin = role === 'admin';
  document.body.classList.toggle('is-client', !admin);
  const badge = $('m-role');
  if (badge) { badge.textContent = admin ? 'Administrador' : 'Cliente'; badge.className = 'role-badge ' + (admin ? 'role-admin' : 'role-viewer'); }
  const note = $('ro-note'); if (note) note.style.display = admin ? 'none' : '';
}
$('btn-logout').onclick = async () => { await sb.auth.signOut(); location.replace('index.html'); };
sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') location.replace('index.html'); });
initSession();

/* ---------- navegación por pestañas ---------- */
$('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab'); if (!btn) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  $('v-' + btn.dataset.view).classList.remove('hidden');
});

/* ---------- carga principal ---------- */
let charts = {};
let _holdings = [], _signals = [], _divs = [], _trades = [];
async function loadAll() {
  const [pnl, cash, holdings, signals, dividends, trades, cashflows, settings, exposure] = await Promise.all([
    sb.from('v_pnl').select('*').maybeSingle(),
    sb.from('v_cash').select('*').maybeSingle(),
    sb.from('v_holdings').select('*').order('market_value', { ascending: false }),
    sb.from('v_signals').select('*').order('ticker'),
    sb.from('v_dividends').select('*').order('ticker'),
    sb.from('trades').select('*').order('trade_date'),
    sb.from('cash_flows').select('*').order('flow_date'),
    sb.from('settings').select('*').maybeSingle(),
    sb.from('v_exposure').select('*'),
  ]);

  const P = pnl.data || {}, C = cash.data || {}, S = settings.data || {};
  _holdings = holdings.data || []; _signals = signals.data || []; _divs = dividends.data || []; _trades = trades.data || [];
  _realizedCache = realizedPnl(_trades);

  $('m-fx').textContent  = P.fx_spot ? nf2.format(P.fx_spot) : '—';
  $('m-val').textContent = money(P.valor_usd);

  renderOperaciones(_trades);
  renderResumen(P, C, _holdings, exposure.data || []);
  renderPosiciones(_holdings);
  renderWatchlist(_signals);
  renderDividendos(_divs, S);
  renderEfectivo(S, C, cashflows.data || []);
}

/* ---------- RESUMEN ---------- */
function renderResumen(P, C, holdings, exposure) {
  const realized = _realizedCache;
  const aport = C.aportaciones_netas_mxn || 0;
  const plUsdTotal = (P.no_realizado_usd || 0) + (realized || 0);
  const plMxn = (P.valor_mxn || 0) - aport;
  const rendUsd = P.costo_base_usd ? plUsdTotal / P.costo_base_usd : 0;
  const rendMxn = aport ? plMxn / aport : 0;
  const riskPct = P.valor_usd ? (P.riesgo_usd || 0) / P.valor_usd : 0;
  const limit = P.risk_limit_pct || 0.12;

  const cards = [
    { c: 'navy', l: 'Valor total (USD)', v: money(P.valor_usd) },
    { c: 'navy', l: 'Valor total (MXN)', v: money(P.valor_mxn) },
    { c: '',     l: 'Aportaciones netas (MXN)', v: money(aport) },
    { c: signClass(P.no_realizado_usd), l: 'No realizado (USD)', v: money(P.no_realizado_usd) },
    { c: signClass(realized), l: 'Realizado (USD)', v: money(realized), s: 'operaciones cerradas' },
    { c: signClass(plUsdTotal), l: 'P&L total (USD)', v: money(plUsdTotal), s: pct(rendUsd) + ' sobre costo' },
    { c: signClass(plMxn), l: 'P&L vs aportaciones (MXN)', v: money(plMxn), s: pct(rendMxn) },
    { c: 'warn', l: 'Riesgo total (USD)', v: money(P.riesgo_usd), s: pct(riskPct) + ' · límite ' + pct(limit) },
  ];
  $('kpis').innerHTML = cards.map(k => `
    <div class="kpi ${k.c}">
      <div class="k-label">${k.l}</div>
      <div class="k-value num ${['pos','neg'].includes(k.c) ? k.c : ''}">${k.v}</div>
      ${k.s ? `<div class="k-sub num">${k.s}</div>` : ''}
    </div>`).join('');

  const maxW = holdings.reduce((m, h) => Math.max(m, h.weight || 0), 0);
  const losers = holdings.filter(h => (h.pnl_pct || 0) < -0.10).length;
  const al = [];
  if (riskPct >= limit) al.push(`Riesgo total ${pct(riskPct)} ≥ límite ${pct(limit)}.`);
  if (maxW > 0.25) al.push(`Concentración: la mayor posición pesa ${pct(maxW)} (>25%).`);
  if (losers > 0) al.push(`${losers} posición(es) con pérdida mayor a 10%.`);
  $('alertas').innerHTML = al.length
    ? `<div class="alert-banner">⚠ ${al.join(' &nbsp;·&nbsp; ')}</div>`
    : `<div class="alert-banner ok">✓ Sin alertas: riesgo dentro del límite y sin sobreconcentración.</div>`;

  const sectors = exposure.filter(e => e.dim === 'sector');
  drawDoughnut('chart-sector', sectors.map(s => s.label), sectors.map(s => Number(s.market_value)));
  const buckets = exposure.filter(e => e.dim === 'bucket');
  drawBar('chart-bucket', buckets.map(b => b.label), buckets.map(b => Number(b.market_value)));
  // NUEVAS: peso por ticker y G/P USD por ticker
  drawWeight('chart-weight', holdings.map(h => h.ticker), holdings.map(h => (h.weight || 0) * 100));
  drawPnl('chart-pnl', holdings.map(h => h.ticker), holdings.map(h => h.pnl_usd || 0));
}

/* ---------- POSICIONES ---------- */
function renderPosiciones(rows) {
  const admin = userRole === 'admin';
  const tb = $('t-pos').querySelector('tbody');
  tb.innerHTML = rows.map(h => `
    <tr>
      <td class="l"><span class="tk">${h.ticker}</span></td>
      <td class="l cell-name">${h.name ?? ''}</td>
      <td class="c">${h.asset_type ?? ''}</td>
      <td class="c">${h.platform ?? ''}</td>
      <td class="l cell-name">${h.sector ?? ''}</td>
      <td class="num">${qty(h.quantity)}</td>
      <td class="num">${money(h.avg_cost)}</td>
      <td class="num">${money(h.price)}</td>
      <td class="num">${money(h.market_value)}</td>
      <td class="num ${signClass(h.pnl_usd)}">${money(h.pnl_usd)}</td>
      <td class="num ${signClass(h.pnl_pct)}">${pct(h.pnl_pct)}</td>
      <td class="num">${pct(h.weight)}</td>
      <td class="num">${money(h.stop_price)}</td>
      <td class="num">${money(h.risk_usd)}</td>
      <td class="c">${alertOf(h)}</td>
      ${actionCell(admin, 'pos', h.id)}
    </tr>`).join('');
  const tot = rows.reduce((a, h) => ({ val: a.val + (h.market_value || 0), pnl: a.pnl + (h.pnl_usd || 0), risk: a.risk + (h.risk_usd || 0) }), { val: 0, pnl: 0, risk: 0 });
  $('t-pos').querySelector('tfoot').innerHTML = `<tr>
    <td colspan="8">Total (${rows.length})</td>
    <td class="num">${money(tot.val)}</td>
    <td class="num ${signClass(tot.pnl)}">${money(tot.pnl)}</td>
    <td colspan="3"></td>
    <td class="num">${money(tot.risk)}</td><td></td><td class="col-actions"></td></tr>`;
}
function alertOf(h) {
  if ((h.weight || 0) > 0.25) return '<span class="badge b-amber">Concentración</span>';
  if ((h.pnl_pct || 0) < -0.10) return '<span class="badge b-red">Revisar pérdida</span>';
  return '<span class="badge b-green">OK</span>';
}

/* ---------- WATCHLIST ---------- */
function renderWatchlist(rows) {
  const admin = userRole === 'admin';
  const tb = $('t-wl').querySelector('tbody');
  tb.innerHTML = rows.map(s => `
    <tr>
      <td class="l"><span class="tk">${s.ticker}</span></td>
      <td class="l cell-name">${s.name ?? ''}</td>
      <td class="l cell-name">${s.sector ?? ''}</td>
      <td class="c">${s.en_cartera ? '<span class="badge b-navy">Sí</span>' : '<span class="badge b-grey">No</span>'}</td>
      <td class="num">${money(s.price)}</td>
      <td class="num">${money(s.reference)}</td>
      <td class="num ${signClass(s.var_ref)}">${s.var_ref == null ? '—' : pct(s.var_ref)}</td>
      <td class="num">${money(s.compra_min)}</td>
      <td class="num">${money(s.compra_max)}</td>
      <td class="num">${money(s.objetivo)}</td>
      <td class="c">${signalBadge(s.signal)}</td>
      <td class="l cell-name">${s.priority ?? ''}</td>
      ${actionCell(admin, 'wl', s.ticker)}
    </tr>`).join('');
}
function signalBadge(sig) {
  if (sig === 'En zona de compra') return `<span class="badge b-green">${sig}</span>`;
  if (sig === 'Debajo de zona: revisar tendencia') return `<span class="badge b-amber">Debajo de zona</span>`;
  if (sig === 'Extendido / no comprar') return `<span class="badge b-red">Extendido</span>`;
  if (sig === 'Sin histórico') return `<span class="badge b-grey">Sin histórico</span>`;
  return `<span class="badge b-grey">${sig ?? '—'}</span>`;
}
$('btn-add-wl').onclick = async () => {
  const ticker = ($('wl-ticker').value || '').trim().toUpperCase();
  if (!ticker) return wlMsg('Escribe un ticker.', true);
  try {
    await ensureInstrument(ticker);
    const { error } = await sb.from('watchlist').insert({ ticker, priority: $('wl-priority').value || null, note: $('wl-note').value || null });
    if (error) throw error;
    $('wl-ticker').value = ''; $('wl-priority').value = ''; $('wl-note').value = '';
    wlMsg('Agregado a watchlist.'); loadAll();
  } catch (e) { wlMsg(e.message, true); }
};
function wlMsg(t, e) { const m = $('wl-msg'); if (m) { m.className = 'msg' + (e ? ' err' : ''); m.textContent = t; } }

/* ---------- DIVIDENDOS ---------- */
function renderDividendos(rows, S) {
  const admin = userRole === 'admin';
  if (S && S.us_withholding != null) $('s-us').value = S.us_withholding;
  if (S && S.mx_withholding != null) $('s-mx').value = S.mx_withholding;
  const tb = $('t-div').querySelector('tbody');
  tb.innerHTML = rows.map(d => `
    <tr>
      <td class="l"><span class="tk">${d.ticker}</span></td>
      <td class="c">${d.platform ?? ''}</td>
      <td class="num">${qty(d.quantity)}</td>
      <td class="c">${d.pays ? 'Sí' : 'No'}</td>
      <td class="c">${d.frequency ?? '—'}</td>
      <td class="num">${money(d.annual_per_share)}</td>
      <td class="num">${money(d.bruto_anual)}</td>
      <td class="num">${money(d.ret_eeuu)}</td>
      <td class="num">${money(d.ret_mexico)}</td>
      <td class="num">${money(d.neto_anual)}</td>
      <td class="l cell-name">${d.source ?? ''}</td>
      ${actionCell(admin, 'div', d.ticker)}
    </tr>`).join('');
  const t = rows.reduce((a, d) => ({ b: a.b + (d.bruto_anual || 0), us: a.us + (d.ret_eeuu || 0), mx: a.mx + (d.ret_mexico || 0), n: a.n + (d.neto_anual || 0) }), { b: 0, us: 0, mx: 0, n: 0 });
  $('t-div').querySelector('tfoot').innerHTML = `<tr>
    <td colspan="6">Total</td>
    <td class="num">${money(t.b)}</td><td class="num">${money(t.us)}</td>
    <td class="num">${money(t.mx)}</td><td class="num">${money(t.n)}</td><td></td><td class="col-actions"></td></tr>`;
}
$('btn-save-ret').onclick = async () => {
  const us = parseFloat($('s-us').value), mx = parseFloat($('s-mx').value);
  const { error } = await upsertSettings({ us_withholding: us, mx_withholding: mx });
  if (!error) loadAll();
};

/* ---------- OPERACIONES ---------- */
function renderOperaciones(rows) {
  const admin = userRole === 'admin';
  const tb = $('t-ops').querySelector('tbody');
  tb.innerHTML = rows.map(t => {
    const total = Number(t.quantity) * Number(t.price) + (t.side === 'COMPRA' ? Number(t.commission || 0) : -Number(t.commission || 0));
    return `<tr>
      <td class="l">${dmy(t.trade_date)}</td>
      <td class="c">${t.side === 'VENTA' ? '<span class="badge b-amber">VENTA</span>' : '<span class="badge b-grey">COMPRA</span>'}</td>
      <td class="c">${t.platform}</td>
      <td class="l"><span class="tk">${t.ticker}</span></td>
      <td class="num">${qty(t.quantity)}</td>
      <td class="num">${money(t.price)}</td>
      <td class="num">${money(t.commission)}</td>
      <td class="num">${money(total)}</td>
      ${actionCell(admin, 'tr', t.id)}
    </tr>`;
  }).join('');
  const comprado = rows.filter(t => t.side === 'COMPRA').reduce((s, t) => s + Number(t.quantity) * Number(t.price) + Number(t.commission || 0), 0);
  const vendido  = rows.filter(t => t.side === 'VENTA').reduce((s, t) => s + Number(t.quantity) * Number(t.price) - Number(t.commission || 0), 0);
  const comis    = rows.reduce((s, t) => s + Number(t.commission || 0), 0);
  const real     = realizedPnl(rows); _realizedCache = real;
  $('ops-kpis').innerHTML = [
    { l: 'Total comprado (USD)', v: money(comprado), c: '' },
    { l: 'Total vendido (USD)', v: money(vendido), c: '' },
    { l: 'Comisiones (USD)', v: money(comis), c: '' },
    { l: 'P&L realizado (USD)', v: money(real), c: signClass(real) },
  ].map(k => `<div class="kpi ${k.c}"><div class="k-label">${k.l}</div><div class="k-value num ${['pos','neg'].includes(k.c) ? k.c : ''}">${k.v}</div></div>`).join('');
}
let _realizedCache = 0;
function realizedPnl(trades) {
  const state = {}; let realized = 0;
  const sorted = [...trades].sort((a, b) => (a.trade_date > b.trade_date ? 1 : a.trade_date < b.trade_date ? -1 : 0));
  for (const t of sorted) {
    const k = t.platform + '|' + t.ticker;
    const s = state[k] || (state[k] = { q: 0, c: 0 });
    const q = Number(t.quantity), px = Number(t.price), cm = Number(t.commission || 0);
    if (t.side === 'COMPRA') { s.q += q; s.c += q * px + cm; }
    else { if (s.q <= 1e-12) continue; const avg = s.c / s.q; const costSold = avg * q; realized += (q * px - cm) - costSold; s.q -= q; s.c -= costSold; }
  }
  return realized;
}
function trMsg(t, e) { const m = $('trade-msg'); m.className = 'msg' + (e ? ' err' : ''); m.textContent = t; }
$('btn-add-trade').onclick = async () => {
  const row = {
    trade_date: $('tr-date').value, side: $('tr-side').value, platform: $('tr-plat').value,
    ticker: ($('tr-ticker').value || '').trim().toUpperCase(),
    quantity: parseFloat($('tr-qty').value), price: parseFloat($('tr-price').value),
    commission: parseFloat($('tr-comm').value || '0'),
  };
  if (!row.trade_date || !row.ticker || !(row.quantity > 0) || !(row.price > 0)) return trMsg('Completa fecha, ticker, cantidad y precio.', true);

  const { data: inst } = await sb.from('instruments').select('ticker').eq('ticker', row.ticker).maybeSingle();
  const panel = $('panel-nuevo-ticker');
  if (!inst) {
    if (panel.classList.contains('hidden')) {           // 1er clic: pide datos del ticker nuevo
      $('nt-ticker-label').textContent = row.ticker;
      panel.classList.remove('hidden');
      return trMsg('Ese ticker es nuevo: completa sus datos abajo y vuelve a tocar “Registrar”.', false);
    }
    const { error: ei } = await sb.from('instruments').insert({   // 2º clic: créalo
      ticker: row.ticker, name: $('nt-name').value || row.ticker,
      asset_type: $('nt-type').value, sector: $('nt-sector').value || 'Otro',
    });
    if (ei) return trMsg(ei.message, true);
  }
  const { error } = await sb.from('trades').insert(row);   // el trigger ajusta la posición
  if (error) return trMsg(error.message, true);
  $('tr-ticker').value = ''; $('tr-qty').value = ''; $('tr-price').value = '';
  $('nt-name').value = ''; $('nt-sector').value = ''; if ($('nt-strategy')) $('nt-strategy').value = '';
  panel.classList.add('hidden');
  trMsg('Operación registrada. La posición se actualizó automáticamente.', false);
  loadAll();
};

/* ---------- EFECTIVO Y AJUSTES ---------- */
function renderEfectivo(S, C, flows) {
  if (S) {
    $('p-fx').value = S.fx_spot ?? ''; $('p-fxavg').value = S.fx_avg_purchase ?? '';
    $('p-cash').value = S.cash_usd ?? ''; $('p-ma').value = S.ma_window ?? '';
    $('p-risk').value = S.risk_limit_pct ?? '';
  }
  $('cash-kpis').innerHTML = [
    { l: 'Ingresos (MXN)', v: money(C.ingresos_mxn) },
    { l: 'Retiros (MXN)', v: money(C.retiros_mxn) },
    { l: 'Aportaciones netas (MXN)', v: money(C.aportaciones_netas_mxn) },
  ].map(k => `<div class="kpi"><div class="k-label">${k.l}</div><div class="k-value num">${k.v}</div></div>`).join('');
  const tb = $('t-cash').querySelector('tbody');
  tb.innerHTML = flows.map(f => `<tr>
    <td class="l">${dmy(f.flow_date)}</td><td class="c">${f.platform}</td>
    <td class="c">${f.kind === 'Retiro' ? '<span class="badge b-amber">Retiro</span>' : '<span class="badge b-green">Ingreso</span>'}</td>
    <td class="num">${money(f.amount_mxn)}</td></tr>`).join('');
  const net = flows.reduce((s, f) => s + (f.kind === 'Ingreso' ? Number(f.amount_mxn) : -Number(f.amount_mxn)), 0);
  $('t-cash').querySelector('tfoot').innerHTML = `<tr><td colspan="3">Neto</td><td class="num">${money(net)}</td></tr>`;
}
$('btn-save-settings').onclick = async () => {
  const payload = {
    fx_spot: parseFloat($('p-fx').value), fx_avg_purchase: parseFloat($('p-fxavg').value),
    cash_usd: parseFloat($('p-cash').value), ma_window: parseInt($('p-ma').value, 10),
    risk_limit_pct: parseFloat($('p-risk').value),
  };
  const { error } = await upsertSettings(payload);
  $('settings-msg').className = error ? 'msg err' : 'msg';
  $('settings-msg').textContent = error ? error.message : 'Parámetros guardados.';
  if (!error) loadAll();
};
$('btn-add-cash').onclick = async () => {
  const row = { flow_date: $('cf-date').value, platform: $('cf-plat').value, kind: $('cf-kind').value, amount_mxn: parseFloat($('cf-amt').value) };
  if (!row.flow_date || !(row.amount_mxn > 0)) return;
  const { error } = await sb.from('cash_flows').insert(row);
  if (!error) { $('cf-amt').value = ''; loadAll(); }
};

/* =========================================================================
   EDICIÓN ADMIN — botones por fila + modal genérico
   ========================================================================= */
function actionCell(admin, kind, key) {
  if (!admin) return '<td class="col-actions"></td>';
  return `<td class="c col-actions">
    <button class="btn-mini" data-act="ed-${kind}" data-key="${esc(key)}">Editar</button>
    <button class="btn-mini danger" data-act="del-${kind}" data-key="${esc(key)}">Borrar</button>
  </td>`;
}
function edField(f, val) {
  const v = esc(val);
  if (f.type === 'readonly') return `<div class="ed-row"><label>${f.label}</label><input id="ef-${f.key}" value="${v}" disabled></div>`;
  if (f.type === 'select') { const o = f.options.map(x => `<option ${String(x) === String(val) ? 'selected' : ''}>${x}</option>`).join(''); return `<div class="ed-row"><label>${f.label}</label><select id="ef-${f.key}">${o}</select></div>`; }
  const t = f.type === 'number' ? 'number' : (f.type === 'date' ? 'date' : 'text');
  const step = f.type === 'number' ? 'step="any"' : '';
  return `<div class="ed-row"><label>${f.label}</label><input id="ef-${f.key}" type="${t}" ${step} value="${v}"></div>`;
}
function openEditor(title, fields, values, onSave) {
  $('editor-title').textContent = title;
  $('editor-fields').innerHTML = fields.map(f => edField(f, values[f.key])).join('');
  $('editor-msg').textContent = ''; $('editor-msg').className = 'msg';
  $('editor').classList.remove('hidden');
  $('editor-save').onclick = async () => {
    const out = {};
    for (const f of fields) {
      if (f.type === 'readonly') { out[f.key] = values[f.key]; continue; }
      const el = $('ef-' + f.key);
      out[f.key] = f.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value;
    }
    try { await onSave(out); closeEditor(); loadAll(); }
    catch (err) { $('editor-msg').className = 'msg err'; $('editor-msg').textContent = err.message || 'No se pudo guardar.'; }
  };
}
function closeEditor() { $('editor').classList.add('hidden'); }
$('editor-cancel').onclick = closeEditor;
$('editor').addEventListener('click', (e) => { if (e.target.id === 'editor') closeEditor(); });

async function ensureInstrument(ticker, name, asset_type, sector) {
  const { data } = await sb.from('instruments').select('ticker').eq('ticker', ticker).maybeSingle();
  if (!data) {
    const { error } = await sb.from('instruments').insert({ ticker, name: name || ticker, asset_type: asset_type || 'Otro', sector: sector || 'Otro' });
    if (error) throw error;
  } else if (name != null || asset_type != null || sector != null) {
    const patch = {}; if (name != null) patch.name = name; if (asset_type != null) patch.asset_type = asset_type; if (sector != null) patch.sector = sector;
    await sb.from('instruments').update(patch).eq('ticker', ticker);
  }
}

/* ---- editores por tabla ---- */
function editPosition(h) {
  if (!h) return;
  openEditor('Editar posición · ' + h.ticker, [
    { key: 'ticker', label: 'Ticker', type: 'readonly' },
    { key: 'name', label: 'Nombre', type: 'text' },
    { key: 'asset_type', label: 'Tipo', type: 'select', options: ASSET_TYPES },
    { key: 'sector', label: 'Sector', type: 'select', options: SECTORS },
    { key: 'platform', label: 'Plataforma', type: 'select', options: ['GBM', 'ARQ'] },
    { key: 'quantity', label: 'Cantidad', type: 'number' },
    { key: 'avg_cost', label: 'Costo promedio (USD)', type: 'number' },
    { key: 'strategy', label: 'Estrategia', type: 'text' },
  ], h, async (o) => {
    await ensureInstrument(h.ticker, o.name, o.asset_type, o.sector);
    const { error } = await sb.from('positions').update({ platform: o.platform, quantity: o.quantity, avg_cost: o.avg_cost, strategy: o.strategy }).eq('id', h.id);
    if (error) throw error;
  });
}
function editWatch(s) {
  if (!s) return;
  openEditor('Editar watchlist · ' + s.ticker, [
    { key: 'ticker', label: 'Ticker', type: 'readonly' },
    { key: 'name', label: 'Nombre', type: 'text' },
    { key: 'sector', label: 'Sector', type: 'select', options: SECTORS },
    { key: 'priority', label: 'Prioridad', type: 'select', options: ['Alta', 'Media', 'Baja', '—'] },
    { key: 'note', label: 'Nota', type: 'text' },
  ], s, async (o) => {
    await ensureInstrument(s.ticker, o.name, null, o.sector);
    const { error } = await sb.from('watchlist').update({ priority: o.priority, note: o.note }).eq('ticker', s.ticker);
    if (error) throw error;
  });
}
function editDiv(d) {
  if (!d) return;
  openEditor('Editar dividendo · ' + d.ticker, [
    { key: 'ticker', label: 'Ticker', type: 'readonly' },
    { key: 'pays', label: '¿Paga dividendo?', type: 'select', options: ['Sí', 'No'] },
    { key: 'frequency', label: 'Frecuencia', type: 'select', options: FREQS },
    { key: 'payments_per_year', label: 'Pagos por año', type: 'number' },
    { key: 'annual_per_share', label: 'Dividendo anual/acción (USD)', type: 'number' },
    { key: 'source', label: 'Fuente', type: 'text' },
  ], { ...d, pays: d.pays ? 'Sí' : 'No' }, async (o) => {
    const { error } = await sb.from('dividends').update({
      pays: o.pays === 'Sí', frequency: o.frequency, payments_per_year: o.payments_per_year,
      annual_per_share: o.annual_per_share, source: o.source,
    }).eq('ticker', d.ticker);
    if (error) throw error;
  });
}
function editTrade(t) {
  if (!t) return;
  openEditor('Editar operación', [
    { key: 'trade_date', label: 'Fecha', type: 'date' },
    { key: 'side', label: 'Operación', type: 'select', options: ['COMPRA', 'VENTA'] },
    { key: 'platform', label: 'Plataforma', type: 'select', options: ['GBM', 'ARQ'] },
    { key: 'ticker', label: 'Ticker', type: 'text' },
    { key: 'quantity', label: 'Cantidad', type: 'number' },
    { key: 'price', label: 'Precio (USD)', type: 'number' },
    { key: 'commission', label: 'Comisión (USD)', type: 'number' },
  ], t, async (o) => {
    const { error } = await sb.from('trades').update({
      trade_date: o.trade_date, side: o.side, platform: o.platform, ticker: (o.ticker || '').toUpperCase(),
      quantity: o.quantity, price: o.price, commission: o.commission,
    }).eq('id', t.id);
    if (error) throw error;
  });
}
async function delRow(table, col, key, msg) {
  if (!confirm(msg)) return;
  const q = sb.from(table).delete();
  const { error } = col === 'id' ? await q.eq('id', Number(key)) : await q.eq(col, key);
  if (error) alert(error.message); else loadAll();
}

/* ---- delegación de clics de las filas ---- */
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const k = b.dataset.key;
  switch (b.dataset.act) {
    case 'ed-pos': return editPosition(_holdings.find(h => String(h.id) === k));
    case 'del-pos': return delRow('positions', 'id', k, '¿Borrar esta posición?');
    case 'ed-wl': return editWatch(_signals.find(s => s.ticker === k));
    case 'del-wl': return delRow('watchlist', 'ticker', k, '¿Quitar este ticker de la watchlist?');
    case 'ed-div': return editDiv(_divs.find(d => d.ticker === k));
    case 'del-div': return delRow('dividends', 'ticker', k, '¿Borrar este dividendo?');
    case 'ed-tr': return editTrade(_trades.find(t => String(t.id) === k));
    case 'del-tr': return delRow('trades', 'id', k, '¿Borrar esta operación? La posición no se recalcula sola.');
  }
});

/* ---------- charts ---------- */
function drawDoughnut(id, labels, data) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart($(id), {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: PALETTE, borderColor: '#FFFFFF', borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: { legend: { position: 'right', labels: { font: { family: 'IBM Plex Sans', size: 11 }, color: '#15273B', boxWidth: 12 } } } }
  });
}
function drawBar(id, labels, data) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart($(id), {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: ['#15467A', '#0A2540', '#9A6A12'], borderRadius: 6, maxBarThickness: 80 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { y: { ticks: { callback: (v) => '$' + v.toLocaleString('es-MX'), font: { family: 'IBM Plex Sans' }, color: '#5B6B7C' }, grid: { color: '#D7DFEA' } },
                x: { ticks: { font: { family: 'IBM Plex Sans', size: 11 }, color: '#15273B' }, grid: { display: false } } } }
  });
}
function drawWeight(id, labels, data) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart($(id), {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: '#15467A', borderRadius: 5, maxBarThickness: 44 }] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => c.parsed.y.toFixed(1) + '%' } } },
      scales: { y: { ticks: { callback: (v) => v + '%', font: { family: 'IBM Plex Sans' }, color: '#5B6B7C' }, grid: { color: '#D7DFEA' } },
                x: { ticks: { font: { family: 'IBM Plex Sans', size: 10 }, color: '#15273B' }, grid: { display: false } } } }
  });
}
function drawPnl(id, labels, data) {
  if (charts[id]) charts[id].destroy();
  const colors = data.map(v => (v >= 0 ? '#15784B' : '#C0392B'));
  charts[id] = new Chart($(id), {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 5, maxBarThickness: 44 }] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => '$' + Number(c.parsed.y).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) } } },
      scales: { y: { ticks: { callback: (v) => '$' + v.toLocaleString('es-MX'), font: { family: 'IBM Plex Sans' }, color: '#5B6B7C' }, grid: { color: '#D7DFEA' } },
                x: { ticks: { font: { family: 'IBM Plex Sans', size: 10 }, color: '#15273B' }, grid: { display: false } } } }
  });
}

/* ---------- tiempo real ---------- */
let _rtTimer = null;
function subscribeRealtime() {
  sb.channel('precios-cambios')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'prices' }, () => { clearTimeout(_rtTimer); _rtTimer = setTimeout(loadAll, 1200); })
    .subscribe();
}

/* fecha de hoy por defecto */
const today = new Date().toISOString().slice(0, 10);
['tr-date', 'cf-date'].forEach(id => { if ($(id)) $(id).value = today; });

/* =========================================================================
   ADMIN: cambiar entre clientes (ver/editar su portafolio)
   ========================================================================= */
async function setupClientSwitch() {
  const sw = $('client-switch'); if (!sw) return;
  sw.style.display = 'flex';
  const sel = $('sel-client');
  const { data: clientes } = await sb.from('v_clientes').select('*');
  const list = clientes || [];
  const opts = [`<option value="${myUid}">Yo — mi portafolio</option>`];
  list.filter(c => c.id !== myUid)
      .sort((a, b) => (a.nombre || a.email).localeCompare(b.nombre || b.email))
      .forEach(c => opts.push(`<option value="${c.id}">${c.nombre || c.email}${c.role === 'admin' ? ' (admin)' : ''}</option>`));
  sel.innerHTML = opts.join('');

  // refleja el contexto actual guardado en el servidor
  const { data: ctx } = await sb.from('admin_context').select('acting_user_id').maybeSingle();
  const acting = (ctx && ctx.acting_user_id) ? ctx.acting_user_id : myUid;
  sel.value = acting;
  reflectActing(acting, list);

  sel.onchange = async () => {
    const id = sel.value;
    if (id === myUid) await sb.rpc('clear_acting_user');
    else await sb.rpc('set_acting_user', { p_user: id });
    reflectActing(id, list);
    loadAll();
  };
}
function reflectActing(id, list) {
  const b = $('acting-banner'); if (!b) return;
  if (id && id !== myUid) {
    const c = (list || []).find(x => x.id === id);
    b.style.display = '';
    b.textContent = 'Editando el portafolio de: ' + (c ? (c.nombre || c.email) : id);
  } else {
    b.style.display = 'none';
  }
}

/* settings por-usuario: actualiza la fila del usuario activo, o la crea */
async function upsertSettings(patch) {
  const { data: cur } = await sb.from('settings').select('id').maybeSingle();
  if (cur) return await sb.from('settings').update(patch).eq('id', cur.id);
  return await sb.from('settings').insert(patch);   // user_id = effective_uid() por defecto
}
