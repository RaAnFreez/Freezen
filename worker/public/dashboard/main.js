const sections = [
  ['overview','Overview','◈'],['licenses','Licenses','◇'],['keys','Keys','⌁'],['products','Products','▣'],['scripts','Scripts','{}'],['users','Users','♙'],['hwid','HWID','⌘'],['safelinku','SafeLinkU','↗'],['discord','Discord','◉'],['analytics','Analytics','⌁'],['audit','Audit Logs','≡'],['invites','Invites','✦'],['security','Security','◆'],['settings','Settings','⚙']
];
const app=document.querySelector('#app');
const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>typeof v==='number'?v.toLocaleString():String(v??'—');
app.innerHTML=`<div class="shell"><aside class="sidebar" id="sidebar"><div class="brand"><span class="mark">F</span><span>FREZEN</span></div><nav id="nav"></nav><div class="side-foot"><span class="dot"></span>System protected</div></aside><div class="overlay" id="overlay"></div><main class="main"><header class="top"><div class="top-left"><button class="menu" id="menu">☰</button><div><p class="eyebrow">CONTROL SYSTEM V3</p><h1 id="title">Overview</h1></div></div><div class="top-right"><span id="user-name" class="eyebrow">Loading…</span><div id="avatar" class="avatar">F</div></div></header><section class="content" id="content"></section></main></div>`;
const nav=document.querySelector('#nav');
nav.innerHTML=sections.map((s,i)=>`<button class="nav-item ${i===0?'active':''}" data-section="${s[0]}"><i>${s[2]}</i>${s[1]}</button>`).join('');
const content=document.querySelector('#content');
const title=document.querySelector('#title');
const sidebar=document.querySelector('#sidebar');
const overlay=document.querySelector('#overlay');
const card=(label,value,note,icon)=>`<article class="stat"><div class="stat-icon">${icon}</div><p>${label}</p><strong>${esc(num(value))}</strong><small>${esc(note)}</small></article>`;
function overview(data){
  const s=data?.stats||data?.metrics||data||{};
  const vals=[Number(s.total_licenses||0),Number(s.active_licenses||0),Number(s.expired_licenses||0),Number(s.revoked_licenses||0),Number(s.users||0),Number(s.script_requests||0),Number(s.safelinku_claims||0),Number(s.hwid_resets||0)];
  const max=Math.max(1,...vals);
  const activity=Array.isArray(data?.recent_activity)?data.recent_activity:[];
  content.innerHTML=`<div class="hero"><div><p class="eyebrow">PRIVATE ADMIN AREA</p><h2>Frezen Control Center</h2><p>Manage licenses, scripts, HWID, users and services from one secure dashboard.</p></div><span class="badge"><span class="dot"></span>Protected</span></div>
  <div class="stats">${card('Total Licenses',vals[0],'All license records','◇')}${card('Active Licenses',vals[1],'Currently valid','✓')}${card('Expired Licenses',vals[2],'Past expiration','◷')}${card('Revoked Licenses',vals[3],'Revoked or disabled','⊘')}${card('Users',vals[4],'Registered accounts','♙')}${card('Script Requests',vals[5],'Authorized requests','{}')}${card('SafeLinkU Claims',vals[6],'Recorded claims','↗')}${card('HWID Resets',vals[7],'Reset operations','⌘')}</div>
  <div class="columns"><section class="panel"><div class="panel-head"><div><p class="eyebrow">LICENSE ACTIVITY</p><h3>Activity overview</h3></div><div class="tabs"><button class="active">24H</button><button>7D</button><button>30D</button><button>90D</button></div></div><div class="chart">${vals.map(v=>`<i style="height:${Math.max(8,Math.round(v/max*100))}%"></i>`).join('')}</div></section>
  <section class="panel"><div class="panel-head"><div><p class="eyebrow">SYSTEM</p><h3>Service status</h3></div></div>${service('Authentication','Protected')}${service('Authorization','Protected')}${service('Database',data?.database||'Connected')}${service('Environment',data?.environment||'production')}</section></div>
  <section class="panel recent-panel"><div class="panel-head"><div><p class="eyebrow">AUDIT</p><h3>Recent activity</h3></div><button class="ghost" data-section="audit">View logs</button></div>${activity.length?activity.slice(0,8).map(a=>`<div class="activity"><span>${esc(a.action||a.event||'Activity')}<small>${esc(a.resource||a.user||'Frezen')}</small></span><small>${esc(a.created_at||a.timestamp||'')}</small></div>`).join(''):`<div class="empty"><b>No recent activity</b><span>Activity will appear here when events are recorded.</span></div>`}</section>`;
}
function service(label,value){return `<div class="service"><span><i class="dot"></i>${label}</span><b>${esc(value)}</b></div>`}
function placeholder(id){const s=sections.find(x=>x[0]===id);content.innerHTML=`<section class="panel placeholder"><p class="eyebrow">${esc((s?.[1]||id).toUpperCase())}</p><h2>${esc(s?.[1]||id)}</h2><p>This section is part of the Frezen Control System. Its live data and actions are connected to the authenticated API as each roadmap feature becomes active.</p></section>`}
async function loadOverview(){
  content.innerHTML='<section class="panel loading"><div class="spinner"></div><b>Loading Frezen data…</b><span>Authenticating and reading the dashboard API.</span></section>';
  try{const r=await fetch('/api/v1/dashboard/overview',{credentials:'same-origin',headers:{accept:'application/json'}});if(r.status===401||r.status===403){location.href='/login';return}if(!r.ok)throw new Error(`HTTP ${r.status}`);const d=await r.json();const u=d.user||d.current_user||null;if(u){document.querySelector('#user-name').textContent=u.username||u.email||'Owner';document.querySelector('#avatar').textContent=(u.username||u.email||'O').slice(0,1).toUpperCase()}overview(d)}catch(e){content.innerHTML=`<section class="hero error"><div><p class="eyebrow">DASHBOARD ERROR</p><h2>Unable to load live data</h2><p>The dashboard shell is working, but the authenticated overview API returned an error: ${esc(e.message)}</p></div><button class="primary" id="retry">Retry</button></section>`;document.querySelector('#retry').onclick=loadOverview}}
function select(id){document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.section===id));title.textContent=sections.find(s=>s[0]===id)?.[1]||id;if(id==='overview')loadOverview();else placeholder(id);sidebar.classList.remove('open');overlay.classList.remove('show')}
document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>select(b.dataset.section));
document.addEventListener('click',e=>{const b=e.target.closest('[data-section]');if(b&&!b.classList.contains('nav-item'))select(b.dataset.section)});
document.querySelector('#menu').onclick=()=>{sidebar.classList.add('open');overlay.classList.add('show')};overlay.onclick=()=>{sidebar.classList.remove('open');overlay.classList.remove('show')};
loadOverview();
