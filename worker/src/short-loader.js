const escapeLua = (value) => String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n");

export function buildCompactLoaderSource(request, scriptId) {
  const origin = new URL(request.url).origin;
  const id = encodeURIComponent(scriptId);
  const bootstrapUrl = `${origin}/loader/${id}?bootstrap=1&key=`;
  return [
    'script_key="PASTE YOUR KEY HERE";',
    `local _frezen_http=game:GetService("HttpService");local _frezen_bootstrap=\"${bootstrapUrl}\".._frezen_http:UrlEncode(script_key);local _frezen_ok,_frezen_src=pcall(function() return game:HttpGet(_frezen_bootstrap) end);if not _frezen_ok then error("FREZEN_BOOTSTRAP_HTTP_FAILED:"..tostring(_frezen_src)) end;if type(_frezen_src)~="string" or _frezen_src=="" then error("FREZEN_BOOTSTRAP_EMPTY") end;local _frezen_load=loadstring or load;if type(_frezen_load)~="function" then error("FREZEN_LOADSTRING_UNAVAILABLE") end;local _frezen_chunk,_frezen_compile_error=_frezen_load(_frezen_src);if type(_frezen_chunk)~="function" then error("FREZEN_BOOTSTRAP_COMPILE_FAILED:"..tostring(_frezen_compile_error)) end;local _frezen_run_ok,_frezen_run_error=pcall(_frezen_chunk);if not _frezen_run_ok then error("FREZEN_BOOTSTRAP_RUNTIME_FAILED:"..tostring(_frezen_run_error)) end`,
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
    'local game_ready=false;',
    'pcall(function()',
    '  local Players=game:GetService("Players");',
    '  local waitFn=(task and task.wait) or wait;',
    '  local player=nil;',
    '  for _=1,100 do',
    '    player=Players.LocalPlayer;',
    '    if not player then',
    '      local players=Players:GetPlayers();',
    '      if #players>0 then player=players[1] end;',
    '    end;',
    '    if player then break end;',
    '    if type(waitFn)=="function" then pcall(waitFn,0.1) end;',
    '  end;',
    '  if player then',
    '    local nameOk,name=pcall(function() return player.Name end);',
    '    local displayOk,displayName=pcall(function() return player.DisplayName end);',
    '    local idOk,uid=pcall(function() return player.UserId end);',
    '    if nameOk and type(name)=="string" and name~="" then',
    '      game_username=name;',
    '    elseif displayOk and type(displayName)=="string" and displayName~="" then',
    '      game_username=displayName;',
    '    end;',
    '    if idOk and uid then game_user_id=tostring(uid) end;',
    '    game_ready=(game_username~="" and game_user_id~="");',
    '  end;',
    'end);',
    'if not game_ready then',
    '  pcall(function()',
    '    local Players=game:GetService("Players");',
    '    local player=Players.LocalPlayer;',
    '    if player then',
    '      local okName,name=pcall(function() return player.Name end);',
    '      local okId,uid=pcall(function() return player.UserId end);',
    '      if okName and type(name)=="string" and name~="" then game_username=name end;',
    '      if okId and uid then game_user_id=tostring(uid) end;',
    '    end;',
    '  end);',
    'end;',
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
    `local _frezen_url="${endpoint}?key="..HttpService:UrlEncode(script_key).."&hwid="..HttpService:UrlEncode(hwid).."&game_username="..HttpService:UrlEncode(game_username).."&game_user_id="..HttpService:UrlEncode(game_user_id);`,
    'local _frezen_http_ok,source=pcall(function() return game:HttpGet(_frezen_url) end);',
    'if not _frezen_http_ok then error("FREZEN_PAYLOAD_HTTP_FAILED:"..tostring(source)) end;',
    'if type(source)~="string" or source=="" then error("FREZEN_PAYLOAD_EMPTY") end;',
    'local _frezen_load=loadstring or load;',
    'if type(_frezen_load)~="function" then error("FREZEN_LOADSTRING_UNAVAILABLE") end;',
    'local _frezen_chunk,_frezen_compile_error=_frezen_load(source);',
    'if type(_frezen_chunk)~="function" then error("FREZEN_PAYLOAD_COMPILE_FAILED:"..tostring(_frezen_compile_error)) end;',
    'local _frezen_run_ok,_frezen_run_error=pcall(_frezen_chunk);',
    'if not _frezen_run_ok then error("FREZEN_PAYLOAD_RUNTIME_FAILED:"..tostring(_frezen_run_error)) end;',
  ].join("\n");
}
