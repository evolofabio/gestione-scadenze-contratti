// ═══════════════════════════════════════
// LOGOUT
// ═══════════════════════════════════════
function doLogout() {
  authUser = null;
  if (typeof window.resetSupabaseSync === 'function') window.resetSupabaseSync();
  state.companies = [];
  if (window.supabaseClient && window.supabaseClient.auth) {
    window.supabaseClient.auth.signOut().catch(() => {});
  }
  const appShell = document.getElementById('app-shell');
  if (appShell) appShell.style.display = 'none';
  const loginScreen = document.getElementById('login-screen');
  if (loginScreen) {
    if (typeof renderLoginScreen === 'function') {
      renderLoginScreen();
    } else {
      loginScreen.innerHTML = '<div class="login-card"><h3>Sei stato disconnesso</h3><button class="tb-btn primary" onclick="location.reload()">Accedi di nuovo</button></div>';
      loginScreen.style.display = 'flex';
    }
  }
}
