const COUNTRY_CODES = new Set(["AF","AX","AL","DZ","AS","AD","AO","AI","AQ","AG","AR","AM","AW","AU","AT","AZ","BS","BH","BD","BB","BY","BE","BZ","BJ","BM","BT","BO","BQ","BA","BW","BV","BR","IO","BN","BG","BF","BI","CV","KH","CM","CA","KY","CF","TD","CL","CN","CX","CC","CO","KM","CG","CD","CK","CR","CI","HR","CU","CW","CY","CZ","DK","DJ","DM","DO","EC","EG","SV","GQ","ER","EE","SZ","ET","FK","FO","FJ","FI","FR","GF","PF","TF","GA","GM","GE","DE","GH","GI","GR","GL","GD","GP","GU","GT","GG","GN","GW","GY","HT","HM","VA","HN","HK","HU","IS","IN","ID","IR","IQ","IE","IM","IL","IT","JM","JP","JE","JO","KZ","KE","KI","KP","KR","KW","KG","LA","LV","LB","LS","LR","LY","LI","LT","LU","MO","MG","MW","MY","MV","ML","MT","MH","MQ","MR","MU","YT","MX","FM","MD","MC","MN","ME","MS","MA","MZ","MM","NA","NR","NP","NL","NC","NZ","NI","NE","NG","NU","NF","MK","MP","NO","OM","PK","PW","PS","PA","PG","PY","PE","PH","PN","PL","PT","PR","QA","RE","RO","RU","RW","BL","SH","KN","LC","MF","PM","VC","WS","SM","ST","SA","SN","RS","SC","SL","SG","SX","SK","SI","SB","SO","ZA","GS","SS","ES","LK","SD","SR","SJ","SE","CH","SY","TW","TJ","TZ","TH","TL","TG","TK","TO","TT","TN","TR","TM","TC","TV","UG","UA","AE","GB","US","UM","UY","UZ","VU","VE","VN","VG","VI","WF","EH","YE","ZM","ZW"]);

const AUTOMATION_UA = /headless|phantomjs|selenium|playwright|puppeteer|webdriver/i;
const DATACENTER_ORG = /(amazon|aws|google|microsoft|azure|digitalocean|linode|vultr|hetzner|ovh|leaseweb|contabo|oracle|rackspace|hostinger|cloudways|choopa|m247|vpn|proxy|nordvpn|expressvpn|surfshark|protonvpn|private internet access|pia vpn|windscribe|tunnelbear|cyberghost|hola vpn)/i;

function readJson(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function detectBrowser(userAgent = '', clientBrowser = '') {
  const client = String(clientBrowser || '').trim();
  if (client) return client;
  const ua = String(userAgent || '');
  if (/FBAN|FBAV/i.test(ua)) return 'Facebook In-App Browser';
  if (/Instagram/i.test(ua)) return 'Instagram In-App Browser';
  if (/TikTok/i.test(ua)) return 'TikTok In-App Browser';
  if (/LinkedInApp/i.test(ua)) return 'LinkedIn In-App Browser';
  if (/Pinterest/i.test(ua)) return 'Pinterest In-App Browser';
  if (/Snapchat/i.test(ua)) return 'Snapchat In-App Browser';
  if (/GSA/i.test(ua)) return 'Google Search App';
  if (/;\s*wv\)/i.test(ua)) return 'WebView';
  if (/UCBrowser/i.test(ua)) return 'UC Browser';
  if (/QQBrowser/i.test(ua)) return 'QQ Browser';
  if (/YaBrowser/i.test(ua)) return 'Yandex Browser';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/OPR\//i.test(ua)) return 'Opera';
  if (/Vivaldi/i.test(ua)) return 'Vivaldi';
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/Brave/i.test(ua)) return 'Brave';
  if (/Chrome\//i.test(ua)) return 'Chrome';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/CriOS\//i.test(ua)) return 'Chrome';
  if (/FxiOS\//i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua) && !/Chrome|CriOS|Edg|OPR|Android/i.test(ua)) return 'Safari';
  if (/Android/i.test(ua)) return 'Android Browser';
  if (/Trident\//i.test(ua) || /MSIE/i.test(ua)) return 'Internet Explorer';
  if (/Chromium/i.test(ua)) return 'Chromium';
  return 'Other/Unknown';
}

function getPolicy(provider) {
  const settings = readJson(provider?.settings_json, {});
  const protection = settings?.protection && typeof settings.protection === 'object' ? settings.protection : {};
  return {
    visitor: Boolean(protection.visitor),
    vpn: Boolean(protection.vpn),
    adblock: Boolean(protection.adblock),
    incognito: Boolean(protection.incognito),
    blockedCountries: Array.isArray(protection.blocked_countries) ? protection.blocked_countries.map((x) => String(x).trim().toUpperCase()).filter((x) => COUNTRY_CODES.has(x)) : [],
    blockedBrowsers: Array.isArray(protection.blocked_browsers) ? protection.blocked_browsers.map((x) => String(x).trim()).filter(Boolean) : [],
  };
}

async function providerForSlug(env, slug) {
  if (!env?.DB) return null;
  const service = await env.DB.prepare('SELECT id FROM frezen_key_services WHERE slug = ?1 AND active = 1 LIMIT 1').bind(String(slug || '').trim().toLowerCase()).first();
  if (!service?.id) return null;
  return env.DB.prepare('SELECT id, settings_json FROM frezen_key_providers WHERE service_id = ?1 AND active = 1 ORDER BY updated_at DESC LIMIT 1').bind(service.id).first();
}

async function providerForFlow(env, flowId) {
  if (!env?.DB || !flowId) return null;
  const flow = await env.DB.prepare('SELECT service_id FROM getkey_public_sessions WHERE id = ?1 LIMIT 1').bind(flowId).first().catch(() => null);
  if (flow?.service_id) return env.DB.prepare('SELECT id, settings_json FROM frezen_key_providers WHERE service_id = ?1 AND active = 1 ORDER BY updated_at DESC LIMIT 1').bind(flow.service_id).first();
  const checkpointFlow = await env.DB.prepare('SELECT service_id, provider_id FROM getkey_checkpoint_flows WHERE id = ?1 LIMIT 1').bind(flowId).first().catch(() => null);
  if (checkpointFlow?.service_id) return env.DB.prepare('SELECT id, settings_json FROM frezen_key_providers WHERE service_id = ?1 AND active = 1 ORDER BY updated_at DESC LIMIT 1').bind(checkpointFlow.service_id).first();
  if (checkpointFlow?.provider_id) return env.DB.prepare('SELECT id, settings_json FROM frezen_key_providers WHERE id = ?1 AND active = 1 LIMIT 1').bind(checkpointFlow.provider_id).first();
  return null;
}

function blockedResponse(code, message) {
  return new Response(JSON.stringify({ error: code, message }), {
    status: 403,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function enforceProviderProtection(request, env, provider) {
  const policy = getPolicy(provider);
  if (!policy.visitor && !policy.vpn && !policy.adblock && !policy.incognito && !policy.blockedCountries.length && !policy.blockedBrowsers.length) return null;

  const ua = request.headers.get('user-agent') || '';
  const clientBrowser = request.headers.get('x-frezen-client-browser') || '';
  const browser = detectBrowser(ua, clientBrowser);
  const cf = request.cf || {};

  if (policy.visitor) {
    const score = Number(cf?.botManagement?.score);
    if (!ua.trim() || AUTOMATION_UA.test(ua) || (Number.isFinite(score) && score < 30 && !cf?.botManagement?.verifiedBot)) {
      return blockedResponse('VISITOR_PROTECTION_BLOCKED', 'Visitor protection blocked this request.');
    }
  }

  if (policy.vpn) {
    const org = String(cf?.asOrganization || '');
    if (DATACENTER_ORG.test(org)) return blockedResponse('VPN_DATACENTER_BLOCKED', 'VPN, proxy, or datacenter access is blocked for this provider.');
  }

  const country = String(cf?.country || '').toUpperCase();
  if (country && policy.blockedCountries.includes(country)) return blockedResponse('COUNTRY_BLOCKED', `Access from ${country} is blocked for this provider.`);

  if (policy.blockedBrowsers.includes(browser)) return blockedResponse('BROWSER_BLOCKED', `${browser} is blocked for this provider.`);

  if (policy.adblock && request.headers.get('x-frezen-adblock') === '1') return blockedResponse('ADBLOCK_BLOCKED', 'Ad blockers must be disabled to continue.');
  if (policy.incognito && request.headers.get('x-frezen-incognito') === '1') return blockedResponse('INCOGNITO_BLOCKED', 'Incognito/private browsing is blocked for this provider.');

  return null;
}

export async function enforceProviderProtectionBySlug(request, env, slug) {
  const provider = await providerForSlug(env, slug);
  if (!provider) return null;
  return enforceProviderProtection(request, env, provider);
}

export async function enforceProviderProtectionByFlow(request, env, flowId) {
  const provider = await providerForFlow(env, flowId);
  if (!provider) return null;
  return enforceProviderProtection(request, env, provider);
}

export { detectBrowser, getPolicy, COUNTRY_CODES };