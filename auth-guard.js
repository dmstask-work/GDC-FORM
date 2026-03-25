// auth-guard.js — included on every protected page (index, form_informasi, form_aktivitas).
// Sets window.authReady which form scripts await before initializing.
// Also binds the logout button on whichever page has id="btnLogout".

window.authReady = (async () => {
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if (!session) {
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
      window.location.replace("/login.html");
    });
  }
});
