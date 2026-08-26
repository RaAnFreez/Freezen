export function buildKeylessLoaderSource(request, scriptId, deliveryToken) {
  const origin = new URL(request.url).origin;
  const id = encodeURIComponent(scriptId);
  const safeToken = String(deliveryToken ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
  const endpoint = `${origin}/files/${id}.lua`;

  return [
    `local __frezen_delivery_token="${safeToken}";`,
    'local HttpService=game:GetService("HttpService");',
    'local Players=game:GetService("Players");',
    'local hwid="";',
    'local game_username="";',
    'local game_user_id="";',
    'pcall(function()',
    '  local player=Players.LocalPlayer;',
    '  if not player then local ps=Players:GetPlayers();if #ps>0 then player=ps[1] end end;',
    '  if player then',
    '    local ok,name=pcall(function() return player.Name end);if ok and type(name)=="string" and name~="" then game_username=name end;',
    '    local ok2,uid=pcall(function() return player.UserId end);if ok2 and uid then game_user_id=tostring(uid) end;',
    '  end;',
    'end);',
    'local ok,idv=pcall(function() return game:GetService("RbxAnalyticsService"):GetClientId() end);if ok and type(idv)=="string" and idv~="" then hwid=idv end;',
    'if hwid=="" then error("FREZEN_HWID_UNAVAILABLE") end;',
    `local _frezen_url="${endpoint}?delivery_token="..HttpService:UrlEncode(__frezen_delivery_token).."&hwid="..HttpService:UrlEncode(hwid).."&game_username="..HttpService:UrlEncode(game_username).."&game_user_id="..HttpService:UrlEncode(game_user_id);`,
    'local okHttp,source=pcall(function() return game:HttpGet(_frezen_url) end);',
    'if not okHttp then error("FREZEN_PAYLOAD_HTTP_FAILED:"..tostring(source)) end;',
    'if type(source)~="string" or source=="" then error("FREZEN_PAYLOAD_EMPTY") end;',
    'local loader=loadstring or load;if type(loader)~="function" then error("FREZEN_LOADSTRING_UNAVAILABLE") end;',
    'local chunk,compileError=loader(source);if type(chunk)~="function" then error("FREZEN_PAYLOAD_COMPILE_FAILED:"..tostring(compileError)) end;',
    'local okRun,runError=pcall(chunk);if not okRun then error("FREZEN_PAYLOAD_RUNTIME_FAILED:"..tostring(runError)) end;',
  ].join("\n");
}
