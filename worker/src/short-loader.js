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
    'pcall(function()',
    '  local Players=game:GetService("Players");',
    '  local player=Players.LocalPlayer;',
    '  if not player then',
    '    local players=Players:GetPlayers();',
    '    if #players>0 then player=players[1] end;',
    '  end;',
    '  if not player and Players.PlayerAdded then',
    '    player=Players.PlayerAdded:Wait();',
    '  end;',
    '  if player then',
    '    local nameOk,name=pcall(function() return player.Name end);',
    '    local idOk,uid=pcall(function() return player.UserId end);',
    '    if nameOk and type(name)=="string" and name~="" then game_username=name end;',
    '    if idOk and uid then game_user_id=tostring(uid) end;',
    '  end',
    'end);',
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
