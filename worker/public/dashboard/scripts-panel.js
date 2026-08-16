const scriptsRoot = document.querySelector('#content');
const html = (v) => String(v ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let scriptItems = [];
let scriptSystemAvailable = true;
let scriptSystemMessage = '';

async function scriptRequest(url, options = {}) {
  const r = await fetch(url, { credentials:'same-origin', ...options, headers:{accept:'application/json', ...(options.headers||{})} });
  if (r.status === 401 || r.status === 403) { location.href='/login'; throw new Error('SESSION_EXPIRED'); }
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

function scriptSystemBanner() {
  return scriptSystemAvailable ? '' : `<div class="script-schema-warning"><b>Script Manager is waiting for its existing database schema.</b><span>${html(scriptSystemMessage || 'The production database does not currently expose the script tables. The UI will not create fake or local-only records.')}</span></div>`;
}

function setScriptUnavailable(message) {
  scriptSystemAvailable = false;
  scriptSystemMessage = message;
  const search = document.querySelector('#script-search');
  const status = document.querySelector('#script-status');
  const create = document.querySelector('#script-create');
  if (search) search.disabled = true;
  if (status) status.disabled = true;
  if (create) create.disabled = true;
  const old = document.querySelector('.script-schema-warning');
  if (!old) document.querySelector('.panel')?.insertAdjacentHTML('afterend', scriptSystemBanner());
}

function scriptPage() {
  scriptsRoot.innerHTML = `<section class="hero"><div><p class="eyebrow">SCRIPT DELIVERY</p><h2>Script Manager</h2><p>Manage protected Lua scripts, versions and release state from the Owner dashboard.</p></div><span class="badge"><span class="dot"></span>Protected</span></section>
  <section class="panel"><div class="scripts-toolbar"><div class="field"><label for="script-search">Search</label><input id="script-search" placeholder="Name, product or description"></div><div class="field"><label for="script-status">Status</label><select id="script-status"><option value="">All statuses</option><option>ACTIVE</option><option>DISABLED</option></select></div><button class="primary" id="script-refresh">Refresh</button><button class="primary" id="script-create">+ New Script</button></div></section>
  ${scriptSystemBanner()}
  <section class="panel"><div class="panel-head"><div><p class="eyebrow">CATALOG</p><h3>Scripts</h3></div><span id="script-count" class="eyebrow"></span></div><div id="script-grid" class="script-grid"></div></section>`;
  document.querySelector('#script-search').oninput = () => { if (scriptSystemAvailable) loadScripts(); };
  document.querySelector('#script-status').onchange = () => { if (scriptSystemAvailable) loadScripts(); };
  document.querySelector('#script-refresh').onclick = loadScripts;
  document.querySelector('#script-create').onclick = createScriptModal;
  loadScripts();
}

function renderScripts() {
  const grid = document.querySelector('#script-grid');
  document.querySelector('#script-count').textContent = `${scriptItems.length} script${scriptItems.length===1?'':'s'}`;
  if (!scriptItems.length) {
    grid.innerHTML = scriptSystemAvailable
      ? '<div class="empty"><b>No scripts found</b><span>Create a script and associate it with an active product.</span></div>'
      : '<div class="empty"><b>Script data is unavailable</b><span>The UI remains available, but production persistence cannot be simulated while the existing schema is missing.</span></div>';
    return;
  }
  grid.innerHTML = scriptItems.map(s => `<article class="script-card"><div class="panel-head"><div><p class="eyebrow">${html(s.product_name || s.product_id)}</p><h3>${html(s.name)}</h3></div><span class="status-pill ${html(String(s.status||'').toLowerCase())}">${html(s.status)}</span></div><p>${html(s.description || 'No description')}</p><div class="script-meta"><span>${html(s.version_count ?? 0)} versions</span><span>Active: ${html(s.active_version || 'none')}</span></div><div class="script-actions"><button class="ghost" data-script="${html(s.id)}" data-action="details">Details</button><button class="ghost" data-script="${html(s.id)}" data-action="version">Upload version</button><button class="ghost" data-script="${html(s.id)}" data-action="toggle">${s.status==='ACTIVE'?'Disable':'Enable'}</button></div></article>`).join('');
  grid.querySelectorAll('[data-script]').forEach(b => b.onclick=()=>scriptAction(b.dataset.action,b.dataset.script));
}

async function loadScripts() {
  const grid = document.querySelector('#script-grid'); if (!grid) return;
  if (!scriptSystemAvailable) { renderScripts(); return; }
  grid.innerHTML='<div class="empty"><div class="spinner"></div><b>Loading scripts…</b></div>';
  const q=encodeURIComponent(document.querySelector('#script-search').value.trim());
  const status=encodeURIComponent(document.querySelector('#script-status').value);
  try {
    const data=await scriptRequest(`/api/v1/scripts?page=1&page_size=50&q=${q}&status=${status}`);
    scriptItems=Array.isArray(data.scripts)?data.scripts:[];
    renderScripts();
  } catch(e){
    const error = String(e.message || 'DATABASE_ERROR');
    if (error === 'DATABASE_ERROR' || error === 'DATABASE_UNAVAILABLE' || error === 'SCRIPT_SCHEMA_UNAVAILABLE') {
      scriptItems = [];
      setScriptUnavailable('The existing Script Manager tables are not available in production. No fake records or local persistence are created.');
      renderScripts();
      return;
    }
    grid.innerHTML=`<div class="empty"><b>Unable to load scripts</b><span>${html(error)}</span></div>`;
  }
}

function closeModal(){ document.querySelector('.modal-backdrop')?.remove(); }
function modal(title, body){ const wrap=document.createElement('div'); wrap.className='modal-backdrop'; wrap.innerHTML=`<div class="modal"><div class="panel-head"><h2>${html(title)}</h2><button class="ghost" id="modal-close">Close</button></div>${body}</div>`; document.body.appendChild(wrap); wrap.querySelector('#modal-close').onclick=closeModal; return wrap.querySelector('.modal'); }

async function createScriptModal(){
  if (!scriptSystemAvailable) { alert(scriptSystemMessage || 'Script Manager database schema is unavailable.'); return; }
  let products=[]; try { const d=await scriptRequest('/api/v1/products?page=1&page_size=50'); products=Array.isArray(d.products)?d.products:[]; } catch(e){ alert(e.message); return; }
  const m=modal('Create Script',`<div class="field"><label>Product</label><select id="new-product">${products.map(p=>`<option value="${html(p.id)}">${html(p.name)} — ${html(p.status)}</option>`).join('')}</select></div><div class="field"><label>Name</label><input id="new-name" placeholder="example.lua"></div><div class="field"><label>Description</label><textarea id="new-description" placeholder="What this script does"></textarea></div><div class="modal-actions"><button class="ghost" id="cancel">Cancel</button><button class="primary" id="save">Create Script</button></div>`);
  m.querySelector('#cancel').onclick=closeModal;
  m.querySelector('#save').onclick=async()=>{ try { await scriptRequest('/api/v1/scripts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({product_id:m.querySelector('#new-product').value,name:m.querySelector('#new-name').value,description:m.querySelector('#new-description').value})}); closeModal(); loadScripts(); } catch(e){ alert(`Create failed: ${e.message}`); } };
}

function renderVersions(script, versions) {
  return versions.length ? versions.map(v => {
    const active = String(v.status || '').toUpperCase() === 'ACTIVE';
    const disabled = String(v.status || '').toUpperCase() === 'DISABLED';
    const action = active ? '' : disabled ? '' : `<button class="ghost version-action" data-version="${html(v.id)}" data-action="activate">Activate</button><button class="ghost version-action" data-version="${html(v.id)}" data-action="disable">Disable</button>`;
    return `<div class="version-row"><span><b>${html(v.version)}</b><small>${html(v.release_notes||'No release notes')}</small></span><span>${html(v.status)}</span><span class="version-actions">${action}</span></div>`;
  }).join('') : '<div class="empty"><b>No versions</b><span>Upload a Lua version to begin a release lifecycle.</span></div>';
}

async function openScriptDetails(id){
  try {
    const d=await scriptRequest(`/api/v1/scripts/${encodeURIComponent(id)}`);
    const m=modal(d.script?.name||'Script details',`<p>${html(d.script?.description||'No description')}</p><div class="script-meta"><span>Status: ${html(d.script?.status)}</span><span>Product: ${html(d.script?.product_name||d.script?.product_id)}</span></div><div class="version-list" id="version-list">${renderVersions(d.script,d.versions||[])}</div>`);
    m.querySelectorAll('.version-action').forEach(b=>b.onclick=()=>changeVersionState(id,b.dataset.version,b.dataset.action));
  } catch(e){ alert(e.message); }
}

async function changeVersionState(scriptId, versionId, action){
  const verb = action === 'activate' ? 'Activate' : 'Disable';
  if(!confirm(`${verb} this script version?`)) return;
  const endpoint = action === 'activate'
    ? `/api/v1/scripts/${encodeURIComponent(scriptId)}/versions/${encodeURIComponent(versionId)}/active`
    : `/api/v1/scripts/${encodeURIComponent(scriptId)}/versions/${encodeURIComponent(versionId)}/disabled`;
  try { await scriptRequest(endpoint,{method:'PATCH'}); closeModal(); await openScriptDetails(scriptId); loadScripts(); }
  catch(e){ alert(`${verb} failed: ${e.message}`); }
}

async function scriptAction(action,id){
  if (!scriptSystemAvailable) { alert(scriptSystemMessage || 'Script Manager database schema is unavailable.'); return; }
  if(action==='details'){ await openScriptDetails(id); return; }
  if(action==='toggle'){const s=scriptItems.find(x=>x.id===id);if(!s)return;if(!confirm(`${s.status==='ACTIVE'?'Disable':'Enable'} ${s.name}?`))return;try{await scriptRequest(`/api/v1/scripts/${encodeURIComponent(id)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:s.status==='ACTIVE'?'DISABLED':'ACTIVE'})});loadScripts();}catch(e){alert(e.message);}return;}
  if(action==='version'){ uploadVersionModal(id); }
}

function uploadVersionModal(id){
 const m=modal('Upload Script Version',`<p class="eyebrow">Lua files only • maximum 512 KB</p><div class="field"><label>Version</label><input id="version" placeholder="v1.0.0"></div><div class="field"><label>Lua file</label><input id="lua" type="file" accept=".lua,text/plain"></div><div class="field"><label>Release notes</label><textarea id="notes"></textarea></div><div class="modal-actions"><button class="ghost" id="cancel">Cancel</button><button class="primary" id="upload">Upload</button></div>`);
 m.querySelector('#cancel').onclick=closeModal;
 m.querySelector('#upload').onclick=async()=>{const file=m.querySelector('#lua').files[0];if(!file){alert('Select a .lua file');return;}const form=new FormData();form.append('file',file);form.append('version',m.querySelector('#version').value);form.append('release_notes',m.querySelector('#notes').value);try{await scriptRequest(`/api/v1/scripts/${encodeURIComponent(id)}/versions`,{method:'POST',body:form});closeModal();alert('Version uploaded as ARCHIVED. Open Details to activate it when ready.');loadScripts();}catch(e){alert(`Upload failed: ${e.message}`);}};
}

function mountScripts(){ if(!scriptsRoot)return; scriptPage(); }

window.FrezenDashboardPanels = window.FrezenDashboardPanels || {};
window.FrezenDashboardPanels.scripts = mountScripts;
