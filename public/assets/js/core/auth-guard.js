// auth-guard.js — included on every protected page (index, form_informasi, form_aktivitas).
// Sets window.authReady which form scripts await before initializing.
// Also binds the logout button on whichever page has id="btnLogout".

const SESSION_DURATION_MS = 30 * 60 * 1000; // 30-minute hard session limit

window.authReady = (async () => {
  const { data: { session } } = await window.supabaseClient.auth.getSession();

  const loginTime = parseInt(localStorage.getItem("loginTime") || "0");
  const sessionExpired = !loginTime || (Date.now() - loginTime > SESSION_DURATION_MS);

  if (!session || sessionExpired) {
    await window.supabaseClient.auth.signOut();
    localStorage.removeItem("loginTime");
    window.location.replace("/login.html");
    // Never resolve so no further JS executes on this page
    await new Promise(() => {});
  }
  window.currentUser = session.user;
  // Reveal page now that auth is confirmed (body starts hidden to prevent flash)
  document.body.style.visibility = "visible";
})();

document.addEventListener("DOMContentLoaded", () => {
  const btnLogout = document.getElementById("btnLogout");
  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      await window.supabaseClient.auth.signOut();
      localStorage.removeItem("loginTime");
      window.location.replace("/login.html");
    });
  }
});
