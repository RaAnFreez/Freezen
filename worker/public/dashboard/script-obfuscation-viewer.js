(() => {
  const state = { currentScriptId: '', versions: new Map(), scanning: false };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const css = document.createElement('style');
  css.textContent = `
    .frezen-obf-status{display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:5px 8px;border-radius:999px;font-size:10px;font-weight:800;background:#17111f;color:#c3b2d8;border:1px solid rgba(181,108,255,.18)}
    .frezen-obf-status.ok{background:#102318;color:#7fe8a6;border-color:rgba(72,221,142,.22)}
    .frezen-obf-status.warn{background:#2b2112;color:#e4c27d;border-color:rgba(255,193,83,.2)}
    .frezen-obf-viewer-backdrop{position:fixed;inset:0;z-index:4200;background:rgba(0,0,0,.78);backdrop-filter:blur(12px);display:flex;align-items:flex-end;justify-content:center;padding:10px}
    .frezen-obf-viewer{width:min(100%,1000px);height:min(94vh,900px);display:flex;flex-direction:column;background:#120e17;border:1px solid rgba(255,255,255,.08);border-radius:18px;box-shadow:0 30px 120px rgba(0,0,0,.55);overflow:hidden}
    .frezen-obf-head{display:flex;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.06)}
    .frezen-obf-head h3{margin:0;font-size:18px}.frezen-obf-head p{margin:4px 0 0;color:#8f99aa;font-size:11px}
    .frezen-obf-head button{border:0;background:transparent;color:#b6bfca;font-size:24px}
    .frezen-obf-meta{display:flex;gap:7px;flex-wrap:wrap;padding:12px 18px;border-bottom:1px solid rgba(255,255,255,.05)}
    .frezen-obf-pill{padding:5px 8px;border-radius:999px;background:#17131d;color:#adb7c4;font-size:10px}.frezen-obf-pill.ok{background:#102318;color:#7fe8a6}.frezen-obf-pill.warn{background:#2b2112;color:#e4c27d}
    .frezen-obf-code{flex:1;width:100%;border:0;resize:none;padding:16px;background:#0b0a0f;color:#e6eaf0;font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;outline:none}
    .frezen-obf-foot{display:flex;gap:8px;padding:12px 18px;border-top:1px solid rgba(255,255,255,.06)}.frezen-obf-foot button{flex:1;min-height:44px;border:0;border-radius:10px;background:#211927;color:#e1e7ef;font:inherit;font-weight:700}.frezen-obf-foot .primary{background:#a85cff;color:#fff}
    @media(min-width:700px){.frezen-obf-viewer-backdrop{align-items:center}.frezen-obf-viewer{height:min(92vh,900px);border-radius:18px}}
  `;
  document.head.appendChild(css);

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const requestUrl = typeof args[0] === 'string' ? args[0] : String(args[0]?.url || '');
      const parsed = new URL(requestUrl, location.href);
      const match = parsed.pathname.match(/^\/api\/v1\/scripts\/([^/]+)$/);
      if (response.ok && match && !parsed.search) {
        const clone = response.clone();
        const data = await clone.json().catch(() => null);
        if (data?.script?.id) {
          state.currentScriptId = data.script.id;
          state.versions.clear();
          for (const version of data.versions || []) state.versions.set(String(version.version), version);
          setTimeout(scan, 0);
        }
      }
    } catch {}
    return response;
  };

  function scan(){
    if (state.scanning) return;
    state.scanning = true;
    try {
      document.querySelectorAll('.lua-modal .lua-card').forEach(card => {
        if (card.querySelector('.frezen-obf-view')) return;
        const versionNode = card.querySelector('.lua-card-head b');
        if (!versionNode) return;
        const version = versionNode.textContent.trim();
        const meta = state.versions.get(version);
        if (!meta?.id || !state.currentScriptId) return;
        const actions = card.querySelector('.lua-actions');
        if (!actions) return;
        const button = document.createElement('button');
        button.className = 'lua-btn frezen-obf-view';
        button.textContent = 'View obfuscated';
        button.onclick = () => openViewer(state.currentScriptId, meta.id, version);
        actions.appendChild(button);
        const badge = document.createElement('div');
        badge.className = 'frezen-obf-status';
        badge.textContent = 'Checking obfuscation…';
        card.appendChild(badge);
        verifyVersion(state.currentScriptId, meta.id, badge);
      });
    } finally { state.scanning = false; }
  }

  async function verifyVersion(scriptId, versionId, badge){
    try{
      const response = await originalFetch(`/api/v1/scripts/${encodeURIComponent(scriptId)}?view=obfuscated&version_id=${encodeURIComponent(versionId)}`, { credentials:'same-origin', headers:{accept:'application/json'} });
      const data = await response.json().catch(()=>({}));
      const verified = data?.payload?.obfuscation_verified === true;
      badge.className = `frezen-obf-status ${verified?'ok':'warn'}`;
      badge.textContent = verified ? `Obfuscated · ${data.payload.profile?.mode || 'Advanced Techniques'} v${data.payload.profile?.version || '1.1'} · ${data.payload.profile?.strength || 'VERY_HIGH'} · ${data.payload.profile?.protectionLevel || 100}%` : 'Legacy / unverified payload';
    } catch { badge.className='frezen-obf-status warn'; badge.textContent='Unable to verify payload'; }
  }

  async function openViewer(scriptId, versionId, version){
    try{
      const response = await originalFetch(`/api/v1/scripts/${encodeURIComponent(scriptId)}?view=obfuscated&version_id=${encodeURIComponent(versionId)}`, { credentials:'same-origin', headers:{accept:'application/json'} });
      const data = await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      const payload = data.payload || {};
      const verified = payload.obfuscation_verified === true;
      const wrap=document.createElement('div');
      wrap.className='frezen-obf-viewer-backdrop';
      wrap.innerHTML=`<section class="frezen-obf-viewer"><div class="frezen-obf-head"><div><h3>Obfuscated payload · ${esc(version)}</h3><p>This is the exact content stored in <code>script_files.content</code> and returned by the delivery path.</p></div><button id="close">×</button></div><div class="frezen-obf-meta"><span class="frezen-obf-pill ${verified?'ok':'warn'}">${verified?'VERIFIED':'LEGACY / UNVERIFIED'}</span><span class="frezen-obf-pill">${esc(payload.profile?.mode || 'Unknown profile')}</span><span class="frezen-obf-pill">${esc(payload.profile?.strength || 'n/a')}</span><span class="frezen-obf-pill">Protection ${esc(payload.profile?.protectionLevel ?? 'n/a')}%</span><span class="frezen-obf-pill">${esc(payload.size_bytes || 0)} bytes</span><span class="frezen-obf-pill">SHA-256 ${esc(payload.sha256 || 'n/a')}</span></div><textarea class="frezen-obf-code" readonly spellcheck="false">${payload.content || ''}</textarea><div class="frezen-obf-foot"><button id="copy">Copy obfuscated</button><button class="primary" id="close2">Close</button></div></section>`;
      document.body.appendChild(wrap);
      const close=()=>wrap.remove();wrap.querySelector('#close').onclick=close;wrap.querySelector('#close2').onclick=close;
      wrap.querySelector('#copy').onclick=async()=>{await navigator.clipboard.writeText(payload.content||'');const button=wrap.querySelector('#copy');button.textContent='Copied';setTimeout(()=>button.textContent='Copy obfuscated',1200);};
    }catch(error){alert(`Unable to load obfuscated payload: ${error.message}`);}
  }

  new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded', scan, { once:true });
  setTimeout(scan,0);
})();
