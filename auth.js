/* =========================================================================
   auth.js — inicio de sesión / registro con correo y contraseña.
   Usa `sb` definido en config.js. Redirige a app.html al iniciar sesión.
   ========================================================================= */
const $ = (id) => document.getElementById(id);
const APP_URL = 'app.html';

/* ---------- detectar recuperación de contraseña ---------- */
let inRecovery = false;
sb.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    inRecovery = true;
    showPane('recovery');
  }
});

/* ---------- si ya hay sesión (y no es recuperación), entra directo ---------- */
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  // pequeño respiro para que dispare PASSWORD_RECOVERY si venimos de ese enlace
  setTimeout(() => { if (session && !inRecovery) location.replace(APP_URL); }, 250);
})();

/* ---------- pestañas ---------- */
function showPane(name) {
  ['login', 'register', 'recovery'].forEach(p => {
    const pane = $('pane-' + p);
    if (pane) pane.classList.toggle('hidden', p !== name);
  });
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.pane === name));
}
document.querySelectorAll('.auth-tab').forEach(t => {
  t.addEventListener('click', () => showPane(t.dataset.pane));
});

/* ---------- utilidades ---------- */
function busy(btn, on, labelWhenBusy = 'Procesando…') {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.dataset.label || btn.textContent; btn.disabled = true; btn.textContent = labelWhenBusy; }
  else { btn.disabled = false; btn.textContent = btn.dataset.label || btn.textContent; }
}
function setMsg(id, text, isErr) { const el = $(id); if (el) { el.className = 'msg' + (isErr ? ' err' : ''); el.textContent = text; } }

/* ---------- LOGIN ---------- */
$('pane-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('btn-login');
  if (btn.disabled) return;
  const email = $('li-email').value.trim();
  const password = $('li-pass').value;
  if (!email || !password) { setMsg('login-msg', 'Escribe correo y contraseña.', true); return; }
  busy(btn, true, 'Entrando…');
  setMsg('login-msg', '');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    setMsg('login-msg', traducir(error.message), true);
    busy(btn, false);
  } else {
    setMsg('login-msg', 'Listo, entrando…');
    location.replace(APP_URL);
  }
});

/* ---------- REGISTRO ---------- */
$('pane-register').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('btn-register');
  if (btn.disabled) return;
  const full_name = $('rg-name').value.trim();
  const email = $('rg-email').value.trim();
  const password = $('rg-pass').value;
  const password2 = $('rg-pass2').value;
  if (!email || !password) { setMsg('register-msg', 'Completa correo y contraseña.', true); return; }
  if (password.length < 6) { setMsg('register-msg', 'La contraseña debe tener al menos 6 caracteres.', true); return; }
  if (password !== password2) { setMsg('register-msg', 'Las contraseñas no coinciden.', true); return; }
  busy(btn, true, 'Creando…');
  setMsg('register-msg', '');
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { full_name }, emailRedirectTo: window.location.origin + '/' + APP_URL }
  });
  if (error) {
    setMsg('register-msg', traducir(error.message), true);
    busy(btn, false);
  } else if (data.session) {
    // confirmación de correo desactivada → ya hay sesión
    location.replace(APP_URL);
  } else {
    // confirmación de correo activada → debe confirmar
    setMsg('register-msg', 'Cuenta creada. Revisa tu correo y confirma tu cuenta para entrar.');
    busy(btn, false);
  }
});

/* ---------- OLVIDÉ MI CONTRASEÑA ---------- */
$('btn-forgot').addEventListener('click', async () => {
  const btn = $('btn-forgot');
  const email = $('li-email').value.trim();
  if (!email) { setMsg('login-msg', 'Escribe tu correo arriba y vuelve a tocar “¿Olvidaste tu contraseña?”.', true); return; }
  if (btn.disabled) return;
  busy(btn, true, 'Enviando…');
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
  setMsg('login-msg', error ? traducir(error.message) : 'Te enviamos un correo para restablecer tu contraseña.', !!error);
  setTimeout(() => busy(btn, false), 1500);
});

/* ---------- NUEVA CONTRASEÑA (recuperación) ---------- */
$('pane-recovery').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('btn-recovery');
  if (btn.disabled) return;
  const password = $('rc-pass').value;
  if (password.length < 6) { setMsg('recovery-msg', 'La contraseña debe tener al menos 6 caracteres.', true); return; }
  busy(btn, true, 'Guardando…');
  const { error } = await sb.auth.updateUser({ password });
  if (error) { setMsg('recovery-msg', traducir(error.message), true); busy(btn, false); }
  else { setMsg('recovery-msg', 'Contraseña actualizada, entrando…'); location.replace(APP_URL); }
});

/* ---------- traduce los mensajes de error más comunes ---------- */
function traducir(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Aún no confirmas tu correo. Revisa tu bandeja.';
  if (m.includes('user already registered') || m.includes('already registered')) return 'Ese correo ya está registrado. Inicia sesión.';
  if (m.includes('rate') || m.includes('too many') || m.includes('seconds')) return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
  if (m.includes('password should be at least')) return 'La contraseña debe tener al menos 6 caracteres.';
  return msg;
}
