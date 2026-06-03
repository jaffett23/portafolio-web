// La anon/publishable key es SEGURA en el navegador porque RLS protege tus datos.
const sb = supabase.createClient(
  'https://<tu-proyecto>.supabase.co',
  '<ANON_O_PUBLISHABLE_KEY>'
)

const $ = (id) => document.getElementById(id)

// --- Login con enlace mágico ---
$('btn-login').onclick = async () => {
  const email = $('email').value
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin }
  })
  $('login-msg').textContent = error ? error.message : 'Revisa tu correo y abre el enlace.'
}
$('btn-logout').onclick = async () => { await sb.auth.signOut(); location.reload() }

// --- Reacciona a la sesión ---
sb.auth.onAuthStateChange((_e, session) => {
  const logged = !!session
  $('login').hidden = logged
  $('app').hidden = !logged
  if (logged) cargarDatos()
})

async function cargarDatos() {
  // KPIs desde la vista v_pnl
  const { data: pnl } = await sb.from('v_pnl').select('*').single()
  if (pnl) $('kpis').innerHTML = `
    <div>Valor (USD): <b>$${(pnl.valor_usd ?? 0).toFixed(2)}</b></div>
    <div>Valor (MXN): <b>$${(pnl.valor_mxn ?? 0).toFixed(2)}</b></div>
    <div>No realizado (USD): <b>$${(pnl.no_realizado_usd ?? 0).toFixed(2)}</b></div>`

  // Tabla de señales
  const { data: sig } = await sb.from('v_signals').select('*').order('ticker')
  const tb = $('tabla-watchlist').querySelector('tbody')
  tb.innerHTML = (sig ?? []).map(s => `
    <tr><td>${s.ticker}</td><td>$${(s.price ?? 0).toFixed(2)}</td>
        <td>$${(s.reference ?? 0).toFixed(2)}</td><td>${s.signal}</td></tr>`).join('')

  // Gráfica de exposición por sector (suma valor por sector con una consulta sencilla)
  const { data: pos } = await sb.from('positions').select('ticker, quantity')
  // (para producción, expón una vista v_exposure; aquí va un ejemplo simple)
  renderChart(sig)
}

let chart
function renderChart(rows) {
  const ctx = $('chart-sector')
  const bySector = {}
  for (const r of rows ?? []) bySector[r.sector] = (bySector[r.sector] ?? 0) + (r.price ?? 0)
  if (chart) chart.destroy()
  chart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: Object.keys(bySector), datasets: [{ data: Object.values(bySector) }] }
  })
}
