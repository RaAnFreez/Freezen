export function isBrowserNavigation(request) {
  const mode = (request.headers.get("sec-fetch-mode") || "").toLowerCase();
  const dest = (request.headers.get("sec-fetch-dest") || "").toLowerCase();
  const accept = (request.headers.get("accept") || "").toLowerCase();
  const userAgent = (request.headers.get("user-agent") || "").toLowerCase();
  if (mode === "navigate" || dest === "document") return true;
  return accept.includes("text/html") && /mozilla|chrome|safari|firefox|edg\//i.test(userAgent);
}

export function blockedBrowserPage(requestId = "") {
  const id = String(requestId || "").replace(/[<>"']/g, "");
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>You cant access this link</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 20% 10%,#2b1a43 0,#120d18 38%,#08060b 100%);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f6f1fb}.card{width:min(100%,560px);padding:34px;border:1px solid rgba(191,111,255,.2);border-radius:28px;background:rgba(24,17,31,.88);box-shadow:0 30px 100px rgba(0,0,0,.5);backdrop-filter:blur(18px);text-align:center}.icon{width:74px;height:74px;margin:0 auto 22px;border-radius:22px;display:grid;place-items:center;background:linear-gradient(145deg,#ad5cff,#7130a5);box-shadow:0 16px 40px rgba(161,81,255,.26);font-size:34px}h1{margin:0;font-size:30px;letter-spacing:-.03em}p{margin:12px auto 0;max-width:420px;color:#aaa0b3;line-height:1.6}.badge{display:inline-flex;margin-top:22px;padding:9px 13px;border-radius:999px;background:#24192d;color:#c99cff;font-size:12px;font-weight:700}.small{margin-top:18px;color:#6f6576;font-size:11px}</style></head><body><main class="card"><div class="icon">🔒</div><h1>You cant access this link</h1><p>This server-file endpoint is intended for the Frezen loader. Direct browser navigation is not available.</p><div class="badge">FREZEN SERVER-FILE</div><div class="small">${id ? `Request ID: ${id}` : ""}</div></main></body></html>`;
  return new Response(body, { status: 403, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, no-cache, must-revalidate", pragma: "no-cache", "x-content-type-options": "nosniff", ...(id ? { "x-frezen-request-id": id } : {}) } });
}
