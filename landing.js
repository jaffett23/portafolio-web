/* =========================================================================
   landing.js — contenido y comportamiento de la página informativa
   ====== EDITA AQUÍ CADA MES: cambia "RESUMEN_MES" por el mes anterior ======
   ========================================================================= */
const RESUMEN_MES = {
  mes: 'Mayo 2026',
  intro: 'Mercados en máximos impulsados por tecnología e inteligencia artificial, con la inflación al alza y un cambio al frente de la Reserva Federal.',
  highlights: [
    { v: '+5.0%',  l: 'S&P 500 (mes)' },
    { v: '+8.0%',  l: 'Nasdaq (mes)' },
    { v: '51,032', l: 'Dow Jones' },
    { v: '3.8%',   l: 'Inflación PCE' },
    { v: '3.75%',  l: 'Tasa Fed' },
  ],
  noticias: [
    { tag: 'Renta variable', accent: '#1F3A5F',
      titulo: 'Wall Street cierra mayo en récord',
      texto: 'El Nasdaq subió cerca de 8% (su mejor mes de 2026) y el S&P 500 alrededor de 5%, ambos en máximos históricos; el Dow cruzó los 51,000 por primera vez.',
      fuente: 'CNBC' },
    { tag: 'Política monetaria', accent: '#2E7D6F',
      titulo: 'Kevin Warsh asume la Reserva Federal',
      texto: 'Tras el fin del mandato de Powell, Warsh toma el cargo con la tasa en 3.75%; el mercado descuenta una pausa, aunque suben las apuestas de alza por la inflación.',
      fuente: 'YCharts' },
    { tag: 'Inflación', accent: '#B7791F',
      titulo: 'La inflación PCE sube a 3.8%',
      texto: 'El índice PCE de abril marcó 3.8% interanual, su nivel más alto en casi tres años, presionando las expectativas de tasas.',
      fuente: 'Depto. de Comercio de EE.UU. / TheStreet' },
    { tag: 'Tecnología e IA', accent: '#1F3A5F',
      titulo: 'La IA impulsa a las tecnológicas',
      texto: 'Nvidia avanzó por el lanzamiento de un nuevo chip para PC; Dell saltó cerca de 33% (su mejor día) por resultados y pedidos de IA, y Micron superó el billón de dólares de capitalización.',
      fuente: 'CNBC' },
    { tag: 'Energía y geopolítica', accent: '#9C6B3F',
      titulo: 'Petróleo elevado por tensión con Irán',
      texto: 'El conflicto en Medio Oriente mantuvo el crudo alto (rango aproximado de 91 a 105 dólares) y dejó al sector energético rezagado por segundo mes.',
      fuente: 'Recapitulación de mercado, mayo 2026' },
  ],
};

/* ---------- render ---------- */
const $ = (id) => document.getElementById(id);
$('mes-tag').textContent = '— ' + RESUMEN_MES.mes;
$('mes-lead').textContent = RESUMEN_MES.intro;
$('year').textContent = new Date().getFullYear();

$('highlights').innerHTML = RESUMEN_MES.highlights.map(h =>
  `<div class="hl"><div class="v">${h.v}</div><div class="l">${h.l}</div></div>`).join('');

$('news-grid').innerHTML = RESUMEN_MES.noticias.map(n => `
  <article class="news-card" style="--accent:${n.accent}">
    <div class="tag">${n.tag}</div>
    <h3>${n.titulo}</h3>
    <p>${n.texto}</p>
    <div class="src">Fuente: ${n.fuente}</div>
  </article>`).join('');

/* ---------- menú (scroll suave + hamburguesa) ---------- */
document.documentElement.style.scrollBehavior = 'smooth';
$('burger').addEventListener('click', () => $('lp-links').classList.toggle('open'));
document.querySelectorAll('.lp-links a').forEach(a =>
  a.addEventListener('click', () => $('lp-links').classList.remove('open')));

/* ---------- botón de acceso: si ya hay sesión, manda al portafolio ---------- */
(async () => {
  try {
    if (!window.SUPABASE_URL || window.SUPABASE_URL.includes('REEMPLAZA')) return;
    const { data: { session } } = await window.sb.auth.getSession();
    if (session) {
      const btn = $('btn-acceso');
      btn.textContent = 'Mi portafolio →';
      btn.setAttribute('href', 'app.html');
    }
  } catch (_e) { /* landing funciona aunque Supabase no esté configurado */ }
})();
