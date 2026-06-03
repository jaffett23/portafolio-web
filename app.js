<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Portafolio</title>
  <link rel="stylesheet" href="styles.css" />
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <!-- Login -->
  <section id="login">
    <h2>Entrar</h2>
    <input id="email" type="email" placeholder="tu@correo.com" />
    <button id="btn-login">Enviar enlace mágico</button>
    <p id="login-msg"></p>
  </section>

  <!-- App (oculta hasta iniciar sesión) -->
  <section id="app" hidden>
    <header><h1>Mi portafolio</h1><button id="btn-logout">Salir</button></header>
    <div id="kpis"></div>
    <canvas id="chart-sector" height="120"></canvas>
    <h2>Watchlist</h2>
    <table id="tabla-watchlist"><thead><tr>
      <th>Ticker</th><th>Precio</th><th>Referencia</th><th>Señal</th>
    </tr></thead><tbody></tbody></table>
  </section>

  <script src="app.js"></script>
</body>
</html>
