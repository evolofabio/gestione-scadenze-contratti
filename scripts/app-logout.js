// ═══════════════════════════════════════
// LOGOUT
// ═══════════════════════════════════════
function doLogout() {
  authUser = null;
  if (window.supabaseClient && window.supabaseClient.auth) {
    window.supabaseClient.auth.signOut().catch(() => {});
  }
  var appShell = document.getElementById('app-shell');
  if(appShell) appShell.style.display = 'none';
  var loginScreen = document.getElementById('login-screen');
  if(loginScreen) {
    loginScreen.innerHTML = '<div class="login-card"><h3>Sei stato disconnesso</h3><button class="tb-btn primary" onclick="location.reload()">Accedi di nuovo</button></div>';
    loginScreen.style.display = 'flex';
  }
}
