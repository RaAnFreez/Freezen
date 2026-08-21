const escapeLua = (value) => String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n");

export function buildCompactLoaderSource(request, scriptId) {
  const origin = new URL(request.url).origin;
  const id = encodeURIComponent(scriptId);
  const bootstrapUrl = `${origin}/loader/${id}?bootstrap=1&key=`;
  return [
    'script_key="PASTE YOUR KEY HERE";',
    `loadstring(game:HttpGet("${bootstrapUrl}"..game:GetService("HttpService"):UrlEncode(script_key)))()`,
  ].join("\n");
}

export function buildRuntimeLoaderSource(request, scriptId, key = "PASTE YOUR KEY HERE") {
  const origin = new URL(request.url).origin;
  const id = encodeURIComponent(scriptId);
  const endpoint = `${origin}/files/${id}.lua`;
  const safeKey = escapeLua(key);
  return [
    `script_key="${safeKey}";`,
    'local HttpService=game:GetService("HttpService");',
    'local hwid="";',
    'local game_username="";',
    'local game_user_id="";',
    'pcall(function() local Players=game:GetService("Players"); local player=Players.LocalPlayer; if player then game_username=player.Name or ""; game_user_id=tostring(player.UserId or "") end end);',
    'local ok,value=pcall(function() return game:GetService("RbxAnalyticsService"):GetClientId() end);',
    'if ok and type(value)=="string" and value~="" then hwid=value end;',
    'if hwid=="" then',
    '  local providers={gethwid,get_hwid,getHWID,getexecutorhwid};',
    '  for _,getter in ipairs(providers) do',
    '    if type(getter)=="function" then',
    '      local gok,gvalue=pcall(getter);',
    '      if gok and type(gvalue)=="string" and gvalue~="" then hwid=gvalue break end;',
    '    end',
    '  end',
    'end;',
    'if hwid=="" and type(syn)=="table" and type(syn.get_hwid)=="function" then',
    '  local gok,gvalue=pcall(syn.get_hwid);',
    '  if gok and type(gvalue)=="string" and gvalue~="" then hwid=gvalue end;',
    'end;',
    'if hwid=="" then error("FREZEN_HWID_UNAVAILABLE") end;',
    `local source=game:HttpGet("${endpoint}?key="..HttpService:UrlEncode(script_key).."&hwid="..HttpService:UrlEncode(hwid).."&game_username="..HttpService:UrlEncode(game_username).."&game_user_id="..HttpService:UrlEncode(game_user_id));`,
    'loadstring(source)();',
  ].join("\n");
}
