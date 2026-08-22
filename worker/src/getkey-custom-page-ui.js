const LINK_BOX_ID = 'safelinku-checkpoint-link';
const OPEN_MARKER = "open.onclick=()=>{if(open.dataset.launch)location.href=open.dataset.launch};";

const ENHANCED_OPEN_HANDLER = `open.onclick=async()=>{if(!open.dataset.launch)return;open.disabled=true;show('Preparing SafeLinkU checkpoint…');try{const d=await req(open.dataset.launch+'?json=1');if(!d.url)throw new Error('SafeLinkU did not return a checkpoint URL');let box=document.getElementById('${LINK_BOX_ID}');if(!box){box=document.createElement('div');box.id='${LINK_BOX_ID}';box.className='status';status.insertAdjacentElement('afterend',box)}box.innerHTML='<div class="label">SafeLinkU checkpoint ready</div><a id="safelinku-checkpoint-anchor" href="'+esc(d.url)+'" target="_self" rel="nofollow noopener" style="display:block;margin-top:8px;color:#c39bff;word-break:break-all;text-decoration:underline">'+esc(d.url)+'</a><button type="button" id="safelinku-open-button" style="margin-top:12px">Open SafeLinkU Checkpoint</button>';document.getElementById('safelinku-open-button').onclick=()=>{location.href=d.url};show('SafeLinkU checkpoint is ready. Open it below to continue.')}catch(e){show(e.message,true)}finally{open.disabled=false}};`;

export function enhanceGetKeyPage(response) {
  return response.text().then((html) => {
    if (!html.includes(OPEN_MARKER)) return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
    const enhanced = html.replace(OPEN_MARKER, ENHANCED_OPEN_HANDLER);
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return new Response(enhanced, { status: response.status, statusText: response.statusText, headers });
  });
}
