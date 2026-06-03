/* =========================================================================
   Portafolio — lógica del front-end
   1) Pega tu Project URL y tu anon/publishable key abajo.
   2) Sube los 3 archivos (index.html, styles.css, app.js) a tu hosting.
   La anon key es SEGURA en el navegador: tus datos están protegidos por RLS.
   NUNCA pongas aquí la service role ni las API keys de precios.
   ========================================================================= */

const SUPABASE_URL      = 'https://dyyxoxlwftmzkyspzsam.supabase.co';  
const SUPABASE_ANON_KEY = 'sb_publishable_aZ_W9PEjHAuYC9ldC6692A_qi-_pAal'; 

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $  = (id) => document.getElementById(id);
const PALETTE = ['#1F3A5F','#2E7D6F','#B7791F','#9C6B3F','#3E9486','#6B7FA3','#C2A878','#4A6FA5','#8FA37E','#7A776E'];

/* ---------- formato ---------- */
const nf2 = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n) => (n == null ? '—' : '$' + nf2.format(Number(n)));
const pct   = (n) => (n == null ? '—' : (Number(n) * 100).toFixed(2) + '%');
const qty   = (n) => (n == null ? '—' : Number(n).toLocaleString('es-MX', { maximumFractionDigits: 6 }));
const dmy   = (s) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const signClass = (n) => (Number(n) > 0 ? 'pos' : Number(n) < 0 ? 'neg' : '');

/* ---------- auth ---------- */
$('btn-login').onclick = async () => {
  const email = $('email').value.trim();
  if (!email) { $('login-msg').textContent = 'Escribe tu correo.'; return; }
  if (SUPABASE_URL.includes('<tu-proyecto>')) {
    $('login-msg').className = 'msg err';
    $('login-msg').textContent = 'Falta configurar SUPABASE_URL y la anon key en app.js.';
    return;
  }
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
  $('login-msg').className = error ? 'msg err' : 'msg';
  $('login-msg').textContent = error ? error.message : 'Listo: revisa tu correo y abre el enlace mágico.';
};
$('btn-logout').onclick = async () => { await sb.auth.signOut(); location.reload(); };

sb.auth.onAuthStateChange((_event, session) => {
  const logged = !!session;
  $('login').classList.toggle('hidden', logged);
  $('app').classList.toggle('hidden', !logged);
  if (logged) {
    $('m-email').textContent = session.user.email;
    loadAll();
    subscribeRealtime();
  }
});

/* ---------- navegación por pestañas ---------- */
$('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab'); if (!btn) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const view = btn.dataset.view;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  $('v-' + view).classList.remove('hidden');
});

/* ---------- carga principal ---------- */
let charts = {};
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
  _realizedCache = realizedPnl(trades.data || []);   // calcula realizado antes del Resumen
  // meta superior
  $('m-fx').textContent  = P.fx_spot ? nf2.format(P.fx_spot) : '—';
  $('m-val').textContent = money(P.valor_usd);

  renderOperaciones(trades.data || []);
  renderResumen(P, C, holdings.data || [], exposure.data || []);
  renderPosiciones(holdings.data || []);
  renderWatchlist(signals.data || []);
  renderDividendos(dividends.data || [], S);
  renderEfectivo(S, C, cashflows.data || []);
}

/* ---------- RESUMEN ---------- */
function renderResumen(P, C, holdings, exposure) {
  const realized = realizedPnlFromState();           // se calcula en renderOperaciones y se cachea
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

  // alertas
  const maxW = holdings.reduce((m, h) => Math.max(m, h.weight || 0), 0);
  const losers = holdings.filter(h => (h.pnl_pct || 0) < -0.10).length;
  const al = [];
  if (riskPct >= limit) al.push(`Riesgo total ${pct(riskPct)} ≥ límite ${pct(limit)}.`);
  if (maxW > 0.25) al.push(`Concentración: la mayor posición pesa ${pct(maxW)} (>25%).`);
  if (losers > 0) al.push(`${losers} posición(es) con pérdida mayor a 10%.`);
  $('alertas').innerHTML = al.length
    ? `<div class="alert-banner">⚠ ${al.join(' &nbsp;·&nbsp; ')}</div>`
    : `<div class="alert-banner ok">✓ Sin alertas: riesgo dentro del límite y sin sobreconcentración.</div>`;

  // charts
  const sectors = exposure.filter(e => e.dim === 'sector');
  drawDoughnut('chart-sector', sectors.map(s => s.label), sectors.map(s => Number(s.market_value)));
  const buckets = exposure.filter(e => e.dim === 'bucket');
  drawBar('chart-bucket', buckets.map(b => b.label), buckets.map(b => Number(b.market_value)));
}

/* ---------- POSICIONES ---------- */
function renderPosiciones(rows) {
  const tb = $('t-pos').querySelector('tbody');
  tb.innerHTML = rows.map(h => {
    const al = alertOf(h);
    return `<tr>
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
      <td class="c">${al.badge}</td>
    </tr>`;
  }).join('');
  const tot = rows.reduce((a, h) => ({
    cost: a.cost + (h.cost_basis || 0), val: a.val + (h.market_value || 0),
    pnl: a.pnl + (h.pnl_usd || 0), risk: a.risk + (h.risk_usd || 0)
  }), { cost: 0, val: 0, pnl: 0, risk: 0 });
  $('t-pos').querySelector('tfoot').innerHTML = `<tr>
    <td colspan="8">Total (${rows.length})</td>
    <td class="num">${money(tot.val)}</td>
    <td class="num ${signClass(tot.pnl)}">${money(tot.pnl)}</td>
    <td colspan="3"></td>
    <td class="num">${money(tot.risk)}</td><td></td></tr>`;
}
function alertOf(h) {
  if ((h.weight || 0) > 0.25) return { badge: '<span class="badge b-amber">Concentración</span>' };
  if ((h.pnl_pct || 0) < -0.10) return { badge: '<span class="badge b-red">Revisar pérdida</span>' };
  return { badge: '<span class="badge b-green">OK</span>' };
}

/* ---------- WATCHLIST ---------- */
function renderWatchlist(rows) {
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
    </tr>`).join('');
}
function signalBadge(sig) {
  if (sig === 'En zona de compra') return `<span class="badge b-green">${sig}</span>`;
  if (sig === 'Debajo de zona: revisar tendencia') return `<span class="badge b-amber">Debajo de zona</span>`;
  if (sig === 'Extendido / no comprar') return `<span class="badge b-red">Extendido</span>`;
  if (sig === 'Sin histórico') return `<span class="badge b-grey">Sin histórico</span>`;
  return `<span class="badge b-grey">${sig ?? '—'}</span>`;
}

/* ---------- DIVIDENDOS ---------- */
function renderDividendos(rows, S) {
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
    </tr>`).join('');
  const t = rows.reduce((a, d) => ({
    b: a.b + (d.bruto_anual || 0), us: a.us + (d.ret_eeuu || 0),
    mx: a.mx + (d.ret_mexico || 0), n: a.n + (d.neto_anual || 0)
  }), { b: 0, us: 0, mx: 0, n: 0 });
  $('t-div').querySelector('tfoot').innerHTML = `<tr>
    <td colspan="6">Total</td>
    <td class="num">${money(t.b)}</td><td class="num">${money(t.us)}</td>
    <td class="num">${money(t.mx)}</td><td class="num">${money(t.n)}</td><td></td></tr>`;
}
$('btn-save-ret').onclick = async () => {
  const us = parseFloat($('s-us').value), mx = parseFloat($('s-mx').value);
  const { error } = await sb.from('settings').update({ us_withholding: us, mx_withholding: mx }).eq('id', 1);
  if (!error) loadAll();
};

/* ---------- OPERACIONES ---------- */
let _trades = [];
function renderOperaciones(rows) {
  _trades = rows;
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
    </tr>`;
  }).join('');
  const comprado = rows.filter(t => t.side === 'COMPRA').reduce((s, t) => s + Number(t.quantity) * Number(t.price) + Number(t.commission || 0), 0);
  const vendido  = rows.filter(t => t.side === 'VENTA').reduce((s, t) => s + Number(t.quantity) * Number(t.price) - Number(t.commission || 0), 0);
  const comis    = rows.reduce((s, t) => s + Number(t.commission || 0), 0);
  const real     = realizedPnl(rows);
  _realizedCache = real;
  $('ops-kpis').innerHTML = [
    { l: 'Total comprado (USD)', v: money(comprado), c: '' },
    { l: 'Total vendido (USD)', v: money(vendido), c: '' },
    { l: 'Comisiones (USD)', v: money(comis), c: '' },
    { l: 'P&L realizado (USD)', v: money(real), c: signClass(real) },
  ].map(k => `<div class="kpi ${k.c}"><div class="k-label">${k.l}</div><div class="k-value num ${['pos','neg'].includes(k.c) ? k.c : ''}">${k.v}</div></div>`).join('');
}
let _realizedCache = 0;
function realizedPnlFromState() { return _realizedCache; }
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
$('btn-add-trade').onclick = async () => {
  const row = {
    trade_date: $('tr-date').value, side: $('tr-side').value, platform: $('tr-plat').value,
    ticker: $('tr-ticker').value.trim().toUpperCase(),
    quantity: parseFloat($('tr-qty').value), price: parseFloat($('tr-price').value),
    commission: parseFloat($('tr-comm').value || '0'),
  };
  if (!row.trade_date || !row.ticker || !(row.quantity > 0) || !(row.price > 0)) {
    $('trade-msg').className = 'msg err'; $('trade-msg').textContent = 'Completa fecha, ticker, cantidad y precio.'; return;
  }
  const { error } = await sb.from('trades').insert(row);
  $('trade-msg').className = error ? 'msg err' : 'msg';
  $('trade-msg').textContent = error ? error.message : 'Operación agregada. Recuerda ajustar la posición si cambió.';
  if (!error) { $('tr-ticker').value = ''; $('tr-qty').value = ''; $('tr-price').value = ''; loadAll(); }
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
  const { error } = await sb.from('settings').update(payload).eq('id', 1);
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

/* ---------- charts ---------- */
function drawDoughnut(id, labels, data) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart($(id), {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: PALETTE, borderColor: '#FBF7F0', borderWidth: 2 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: { legend: { position: 'right', labels: { font: { family: 'Hanken Grotesk', size: 11 }, color: '#23303F', boxWidth: 12 } } }
    }
  });
}
function drawBar(id, labels, data) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart($(id), {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: ['#2E7D6F', '#1F3A5F', '#B7791F'], borderRadius: 6, maxBarThickness: 80 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { callback: (v) => '$' + v.toLocaleString('es-MX'), font: { family: 'Hanken Grotesk' }, color: '#7A776E' }, grid: { color: '#E4DCCD' } },
        x: { ticks: { font: { family: 'Hanken Grotesk', size: 11 }, color: '#23303F' }, grid: { display: false } }
      }
    }
  });
}

/* ---------- tiempo real (refresca al cambiar precios) ---------- */
let _rtTimer = null;
function subscribeRealtime() {
  sb.channel('precios-cambios')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'prices' }, () => {
      clearTimeout(_rtTimer); _rtTimer = setTimeout(loadAll, 1200);
    })
    .subscribe();
}

/* fecha de hoy por defecto en los formularios */
const today = new Date().toISOString().slice(0, 10);
['tr-date', 'cf-date'].forEach(id => { if ($(id)) $(id).value = today; });
