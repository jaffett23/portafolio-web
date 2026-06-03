/* =========================================================================
   config.js — credenciales públicas + cliente Supabase compartido (`sb`).
   Lo cargan index.html, auth.html y app.html ANTES de su propio script.
   - La anon/publishable key es SEGURA en el navegador (RLS protege tus datos).
   - NUNCA pongas aquí la service role ni las API keys de precios.
   SOLO tienes que cambiar las dos líneas de abajo.
   ========================================================================= */
window.SUPABASE_URL      = 'https://dyyxoxlwftmzkyspzsam.supabase.co';   
window.SUPABASE_ANON_KEY = 'sb_publishable_aZ_W9PEjHAuYC9ldC6692A_qi-_pAal';              
 
// Cliente compartido por todas las páginas (no lo edites).
const sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
window.sb = sb;
