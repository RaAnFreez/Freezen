import worker from "./index.js";
import { requirePrivateAccess } from "./security/private-access.js";

const PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
};

const html = (body, status = 200) => new Response(body, { status, headers: PAGE_HEADERS });
const redirect = (location) => new Response(null, { status: 302, headers: { location, "cache-control": "no-store" } });

const shell = (title, content, script = "") => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#080b10">
<meta name="robots" content="noindex,nofollow">
<title>${title}</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:#080b10;color:#e7edf5}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:radial-gradient(circle at top,#182331 0,transparent 42%),#080b10}main{width:min(100%,460px);border:1px solid #242d39;border-radius:18px;padding:26px;background:#0d1219;box-shadow:0 24px 70px #0009}h1{margin:0 0 6px;font-size:26px;letter-spacing:.04em}h2{font-size:18px;margin:24px 0 6px}p{color:#8994a4;line-height:1.55}.eyebrow{font-size:10px;font-weight:800;letter-spacing:.14em;color:#697586}.field{margin:16px 0}label{display:block;margin-bottom:7px;font-size:12px;color:#aeb9c8}input{width:100%;border:1px solid #293240;border-radius:10px;background:#10161f;color:#fff;padding:12px;font:inherit;outline:none}input:focus{border-color:#66768a}button{width:100%;border:1px solid #dfe7f1;border-radius:10px;background:#dfe7f1;color:#080b10;padding:12px;font:inherit;font-weight:800;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}.secondary{display:block;text-align:center;margin-top:14px;color:#9aa6b5;text-decoration:none;font-size:12px}.status{display:none;margin-top:14px;padding:11px;border-radius:10px;background:#151c26;color:#aeb9c8;white-space:pre-wrap;font-size:12px}.status.show{display:block}.danger{color:#e6a3a3}.note{font-size:11px;color:#697586}.brand{display:flex;align-items:center;gap:9px;font-weight:900;letter-spacing:.16em}.mark{width:32px;height:32px;display:grid;place-items:center;border:1px solid #4b596a;border-radius:9px;background:#121923}
</style>
</head><body><main>${content}</main>${script}</body></html>`;

const LOGIN_HTML = shell(
  "Frezen — Owner Login",
  `<div class="brand"><span class="mark">F</span><span>FREZEN</span></div>
  <p class="eyebrow" style="margin-top:24px">CONTROL SYSTEM V3</p>
  <h1>Owner Login</h1>
  <p>Sign in to the private Frezen Control Center.</p>
  <form id="login">
    <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required></div>
    <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required minlength="12"></div>
    <button id="submit" type="submit">Sign in</button>
  </form>
  <div id="status" class="status"></div>
  <a class="secondary" href="/setup/owner">First-time Owner setup</a>
  <a class="secondary" href="/forgot-password">Forgot password?</a>`,
  `<script>
const form=document.querySelector('#login'),status=document.querySelector('#status'),button=document.querySelector('#submit');
const show=(message,danger=false)=>{status.textContent=message;status.className='status show'+(danger?' danger':'')};
(async()=>{try{const r=await fetch('/api/v1/auth/verify',{credentials:'same-origin'});if(r.ok)location.replace('/dashboard/')}catch{}})();
form.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;show('Signing in…');try{const r=await fetch('/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},credentials:'same-origin',body:JSON.stringify({email:form.email.value,password:form.password.value})});const d=await r.json();if(!r.ok)throw new Error(d.message||d.error||'Login failed');location.replace(d.redirect_to||'/dashboard/')}catch(error){show(error.message,true);button.disabled=false}});
</script>`,
);

const OWNER_SETUP_HTML = shell(
  "Frezen — Owner Setup",
  `<div class="brand"><span class="mark">F</span><span>FREZEN</span></div>
  <p class="eyebrow" style="margin-top:24px">INITIAL SETUP</p>
  <h1>Create Owner Account</h1>
  <p>Create the first Owner account. The setup secret is used only for this request and is never stored in the page.</p>
  <form id="setup">
    <div class="field"><label for="secret">Setup Secret</label><input id="secret" type="password" autocomplete="off" required></div>
    <div class="field"><label for="email">Owner Email</label><input id="email" type="email" autocomplete="email" required></div>
    <div class="field"><label for="username">Username (optional)</label><input id="username" type="text" autocomplete="username" minlength="3" maxlength="64"></div>
    <div class="field"><label for="password">Owner Password</label><input id="password" type="password" autocomplete="new-password" minlength="12" required></div>
    <div class="field"><label for="confirm">Confirm Password</label><input id="confirm" type="password" autocomplete="new-password" minlength="12" required></div>
    <button id="submit" type="submit">Create Owner</button>
  </form>
  <div id="status" class="status"></div>
  <p class="note">Use the same FREZEN_MASTER_SECRET configured as a Cloudflare Worker secret. Never commit or share it.</p>
  <a class="secondary" href="/login">Back to login</a>`,
  `<script>
const form=document.querySelector('#setup'),status=document.querySelector('#status'),button=document.querySelector('#submit');
const show=(message,danger=false)=>{status.textContent=message;status.className='status show'+(danger?' danger':'')};
form.addEventListener('submit',async e=>{e.preventDefault();if(form.password.value!==form.confirm.value){show('Passwords do not match.',true);return}button.disabled=true;show('Creating Owner account…');try{const r=await fetch('/api/v1/setup/owner',{method:'POST',headers:{'content-type':'application/json','x-frezen-setup-secret':form.secret.value},body:JSON.stringify({email:form.email.value,username:form.username.value||undefined,password:form.password.value})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Owner setup failed');show('Owner account created. Redirecting to login…');setTimeout(()=>location.replace('/login'),700)}catch(error){show(error.message,true);button.disabled=false}});
</script>`,
);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") return redirect("/login");
    if (request.method === "GET" && (url.pathname === "/login" || url.pathname === "/login/")) return html(LOGIN_HTML);
    if (request.method === "GET" && (url.pathname === "/setup/owner" || url.pathname === "/setup/owner/")) return html(OWNER_SETUP_HTML);

    if (url.pathname === "/dashboard") {
      const access = await requirePrivateAccess(request, env, crypto.randomUUID());
      if (access instanceof Response) return access;
      return redirect("/dashboard/");
    }

    if (url.pathname.startsWith("/dashboard/")) {
      const access = await requirePrivateAccess(request, env, crypto.randomUUID());
      if (access instanceof Response) return access;
      if (!env.ASSETS) return new Response(JSON.stringify({ error: "STATIC_ASSETS_NOT_CONFIGURED" }), { status: 503, headers: { "content-type": "application/json" } });
      return env.ASSETS.fetch(request, env, ctx);
    }

    return worker.fetch(request, env, ctx);
  },
};
