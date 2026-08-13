import { createClaim } from "./safelinku.js";

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Frezen — Get Key</title>
<style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#09090b;color:#fafafa}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at top,#18181b,#09090b 55%)}main{width:min(100%,460px);border:1px solid #27272a;border-radius:20px;padding:28px;background:#111113;box-shadow:0 20px 60px #0008}h1{margin:0 0 8px;font-size:28px}p{color:#a1a1aa;line-height:1.5}.field{margin:20px 0 12px}label{display:block;margin-bottom:8px;font-size:14px;color:#d4d4d8}select,button{width:100%;border-radius:12px;border:1px solid #3f3f46;padding:12px 14px;font:inherit}select{background:#18181b;color:#fff}button{margin-top:12px;background:#fafafa;color:#09090b;font-weight:700;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}.status{margin-top:18px;padding:12px;border-radius:12px;background:#18181b;white-space:pre-wrap}.small{font-size:12px;color:#71717a}.key{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:16px;word-break:break-all}</style>
</head>
<body><main>
<h1>FREZEN</h1><p>Get a license key for an available product.</p>
<div class="field"><label for="product">Product</label><select id="product"><option value="">Loading products…</option></select></div>
<button id="continue" disabled>Continue</button>
<div id="status" class="status" hidden></div>
<p class="small">Verification is performed by the Frezen API. No SafeLinkU verification is simulated or bypassed.</p>
<script>
const product=document.getElementById('product'),button=document.getElementById('continue'),status=document.getElementById('status');
const show=(text)=>{status.hidden=false;status.textContent=text};
async function load(){try{const r=await fetch('/api/v1/get-key/products',{headers:{accept:'application/json'}});const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to load products');product.innerHTML='<option value="">Select a product</option>'+(d.products||[]).map(p=>'<option value="'+encodeURIComponent(p.id)+'">'+String(p.name).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\\"':'&quot;'}[c]||c))+'</option>').join('');button.disabled=false}catch(e){show(e.message)}}
product.addEventListener('change',()=>button.disabled=!product.value);
button.addEventListener('click',async()=>{button.disabled=true;show('Starting official verification…');try{const r=await fetch('/api/v1/get-key/claim',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({product_id:decodeURIComponent(product.value)})});const d=await r.json();if(!r.ok)throw new Error(d.message||d.error||'Verification unavailable');if(d.license_key){show('Your Frezen Key:\n\n'+d.license_key);return}show('Verification completed, but no key was returned.');}catch(e){show(e.message)}finally{button.disabled=false}});
load();
</script></main></body></html>`;

const publicProduct = (row) => ({ id: row.id, name: row.name, description: row.description, version: row.version });
const response = (body, status = 200, requestId = crypto.randomUUID(), contentType = "application/json; charset=utf-8") => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": contentType, "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-request-id": requestId } });

export async function getKeyPage(requestId) { return response(HTML, 200, requestId, "text/html; charset=utf-8"); }

export async function listPublicProducts(env, requestId) {
  if (!env?.DB) return response({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);
  try {
    const result = await env.DB.prepare("SELECT id, name, description, version FROM products WHERE status = 'ACTIVE' ORDER BY name ASC").all();
    return response({ products: (result?.results ?? []).map(publicProduct), request_id: requestId });
  } catch {
    return response({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId);
  }
}

export async function claimPublicKey(request, env, requestId) {
  let body;
  try { body = await request.json(); } catch { return response({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }
  const productId = typeof body?.product_id === "string" ? body.product_id.trim() : "";
  if (!productId || productId.length > 128) return response({ error: "INVALID_PRODUCT_ID", request_id: requestId }, 400, requestId);
  if (!env?.DB) return response({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);
  try {
    const product = await env.DB.prepare("SELECT id, status FROM products WHERE id = ?1 LIMIT 1").bind(productId).first();
    if (!product) return response({ error: "PRODUCT_NOT_FOUND", request_id: requestId }, 404, requestId);
    if (product.status !== "ACTIVE") return response({ error: "PRODUCT_DISABLED", request_id: requestId }, 409, requestId);
    const claim = await createClaim(env, requestId, { product_id: productId });
    if (!claim?.ok) return response({ error: claim?.error ?? "SAFELINKU_VERIFICATION_UNAVAILABLE", message: "Official SafeLinkU verification is not configured yet. No key was generated.", request_id: requestId }, claim?.status ?? 503, requestId);
    return response({ error: "CLAIM_COMPLETED_WITHOUT_LICENSE", message: "SafeLinkU verification completed but license issuance is not configured.", request_id: requestId }, 501, requestId);
  } catch {
    return response({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId);
  }
}
