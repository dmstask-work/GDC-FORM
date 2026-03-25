// login.js — handles the login form on login.html.
// Users log in with a username (e.g. "yunia"). The internal Supabase email is derived
// from the username using the same formula used in admin-users.mjs to create accounts.
// Admin creates accounts by running: node admin-users.mjs create <username> <password>

// ─── Email formula (must match admin-users.mjs EXACTLY) ───────────────────────
const INTERNAL_DOMAIN = "salesform.internal";
function usernameToEmail(username) {
  return `${username.toLowerCase().trim().replace(/\s+/g, ".")}@${INTERNAL_DOMAIN}`;
}
// ──────────────────────────────────────────────────────────────────────────────

// If already authenticated, skip straight to the app menu
window.supabaseClient.auth.getSession().then(({ data: { session } }) => {
  if (session) {
    window.location.replace("/");
  }
});

const loginForm      = document.getElementById("loginForm");
const usernameInput  = document.getElementById("loginUsername");
const passwordInput  = document.getElementById("loginPassword");
const btnLogin       = document.getElementById("btnLogin");
const loginStatus    = document.getElementById("loginStatus");
const errorModal     = document.getElementById("loginErrorModal");
const errorMessage   = document.getElementById("loginErrorMessage");
const btnCloseError  = document.getElementById("btnCloseLoginError");

btnCloseError.addEventListener("click", () => { errorModal.hidden = true; });
errorModal.addEventListener("click", (e) => {
  if (e.target === errorModal.querySelector(".success-modal-backdrop")) {
    errorModal.hidden = true;
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !errorModal.hidden) errorModal.hidden = true;
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  btnLogin.disabled = true;
  loginStatus.textContent = "Sedang login...";
  loginStatus.className = "status";

  const username = usernameInput.value.trim();
  const email    = usernameToEmail(username);

  const { error } = await window.supabaseClient.auth.signInWithPassword({
    email,
    password: passwordInput.value
  });

  loginStatus.textContent = "";

  if (error) {
    // Distinguish between unknown username vs wrong password by checking sales_master.
    const { data: salesMatch } = await window.supabaseClient
      .from(window.APP_CONFIG.SALES_TABLE_NAME || "sales_master")
      .select("sales_code")
      .ilike("sales_name", usernameInput.value.trim())
      .maybeSingle();

    errorMessage.textContent = salesMatch
      ? "Password salah. Hubungi admin untuk reset password."
      : "Username tidak ditemukan. Pastikan username sesuai nama sales Anda.";
    errorModal.hidden = false;
    btnLogin.disabled = false;
    return;
  }

  window.location.replace("/");
});
