(() => {
  const INTERNAL_NOTE = 'Frezen keyed loader uses a server-stored .lua file endpoint with server-side key and HWID validation.';
  const INTERNAL_LOADER_MARKER = `${location.origin}/files/internal.lua`;

  function loaderSource(scriptId) {
    const endpoint = `${location.origin}/files/${encodeURIComponent(scriptId)}.lua`;
    return [
      'script_key="PASTE YOUR KEY HERE";',
      'local HttpService=game:GetService("HttpService");',
      'local hwid="";',
      'local ok,value=pcall(function() return game:GetService("RbxAnalyticsService"):GetClientId() end);',
      'if ok and type(value)=="string" and value~="" then hwid=value end;',
      'if hwid=="" then',
      '  local getters={gethwid,get_hwid,getHWID};',
      '  for _,getter in ipairs(getters) do',
      '    if type(getter)=="function" then',
      '      local gok,gvalue=pcall(getter);',
      '      if gok and type(gvalue)=="string" and gvalue~="" then hwid=gvalue break end;',
      '    end',
      '  end',
      'end;',
      'if hwid=="" then error("FREZEN_HWID_UNAVAILABLE") end;',
      `local source=game:HttpGet("${endpoint}?key="..HttpService:UrlEncode(script_key).."&hwid="..HttpService:UrlEncode(hwid));`,
      'loadstring(source)();',
    ].join('\n');
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : input?.url || '';
      const method = String(init.method || (typeof input !== 'string' ? input?.method : 'GET') || 'GET').toUpperCase();
      if (method === 'POST' && new URL(url, location.origin).pathname === '/api/v1/scripts') {
        const headers = new Headers(init.headers || (typeof input !== 'string' ? input?.headers : undefined));
        const contentType = headers.get('content-type') || '';
        if (contentType.includes('application/json') && typeof init.body === 'string') {
          const body = JSON.parse(init.body);
          body.loader_url = INTERNAL_LOADER_MARKER;
          init = { ...init, headers, body: JSON.stringify(body) };
        }
      }
    } catch {}
    return nativeFetch(input, init);
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-act="loader"]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const scriptId = button.dataset.id;
    if (!scriptId) return;
    const source = loaderSource(scriptId);
    navigator.clipboard?.writeText(source)
      .then(() => alert('Frezen server-file loader copied. Replace PASTE YOUR KEY HERE with a valid key. HWID capture is enabled.'))
      .catch(() => alert(source));
  }, true);

  document.addEventListener('click', (event) => {
    if (!event.target.closest('#lua-create, [data-act="create-script"], [data-act="new-script"], #create-script, #new-script')) return;
    setTimeout(() => {
      const loader = document.querySelector('#lua-loader');
      if (!loader) return;
      loader.value = INTERNAL_LOADER_MARKER;
      loader.placeholder = 'Frezen server file loader';
      const field = loader.closest('.lua-field');
      if (field) field.style.display = 'none';
    }, 0);
  });
})();
