const ISO_COUNTRY_CODES = 'AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW'.split(' ');
const BROWSERS = [
  'Chrome','Firefox','Safari','Edge','Opera','Brave','Vivaldi','Samsung Internet','UC Browser','QQ Browser','Yandex Browser','DuckDuckGo','Arc','Chromium','Tor Browser','Android Browser','Firefox Focus','Internet Explorer','Facebook In-App Browser','Instagram In-App Browser','TikTok In-App Browser','LinkedIn In-App Browser','Pinterest In-App Browser','Snapchat In-App Browser','Google Search App','WebView','Other/Unknown'
];
const readNames = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; } })();
const countryName = (code) => readNames?.of(code) || code;

function injectStyles() {
  if (document.getElementById('frezen-provider-protection-enhancer-style')) return;
  const style = document.createElement('style');
  style.id = 'frezen-provider-protection-enhancer-style';
  style.textContent = `
    .provider-option{position:relative;transition:border-color .18s,background .18s,box-shadow .18s}
    .provider-option[data-state="on"]{border-color:rgba(166,92,231,.78);background:linear-gradient(180deg,rgba(74,38,93,.34),rgba(23,18,26,.96));box-shadow:0 0 0 1px rgba(166,92,231,.12),0 8px 24px rgba(166,92,231,.08)}
    .provider-option[data-state="off"]{border-color:#332a38}
    .provider-option input[type="checkbox"]{width:50px!important;height:29px!important;background:#251d2d!important;border:1px solid #4b3a52!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.02)!important}
    .provider-option input[type="checkbox"]:after{width:21px!important;height:21px!important;left:3px!important;top:3px!important;background:#eee!important;box-shadow:0 2px 8px rgba(0,0,0,.45)!important}
    .provider-option input[type="checkbox"]:checked{background:#a65ce7!important;border-color:#c17cf0!important;box-shadow:0 0 0 3px rgba(166,92,231,.12),0 0 16px rgba(166,92,231,.24)!important}
    .provider-option input[type="checkbox"]:checked:after{transform:translateX(21px)!important;background:#fff!important}
    .provider-toggle-state{min-width:38px;text-align:center;font-size:10px;font-weight:900;letter-spacing:.08em;color:#8f8794;padding:4px 7px;border-radius:999px;border:1px solid #413548;background:#17121a}
    .provider-toggle-state.on{color:#f8edff;border-color:#b56cff;background:#6d2da0;box-shadow:0 0 14px rgba(181,108,255,.24)}
    .provider-option>input[type="checkbox"]{margin-right:6px}
    .provider-protection-source{opacity:.65}
    .provider-protection-picker{margin-top:10px;border:1px solid #332a3d;border-radius:12px;background:#151018;overflow:hidden}
    .provider-protection-picker>summary{list-style:none;cursor:pointer;padding:12px 13px;display:flex;align-items:center;justify-content:space-between;gap:10px;color:#eee7f2;font-size:12px;font-weight:700}
    .provider-protection-picker>summary::-webkit-details-marker{display:none}
    .provider-protection-picker>summary:after{content:'⌄';color:#b56cff;transition:transform .18s}
    .provider-protection-picker[open]>summary:after{transform:rotate(180deg)}
    .provider-protection-picker .count{font-size:10px;color:#b56cff;font-weight:800;margin-left:auto}
    .provider-protection-picker .body{padding:10px;border-top:1px solid #302638;background:#110d15}
    .provider-protection-picker .search{width:100%;padding:10px 11px;border-radius:9px;border:1px solid #3a3042;background:#0e0a11;color:#fff;outline:none;font:inherit;font-size:12px}
    .provider-protection-picker .search:focus{border-color:#a65ce7;box-shadow:0 0 0 3px rgba(166,92,231,.1)}
    .provider-protection-picker .list{display:grid;gap:5px;max-height:260px;overflow:auto;margin-top:9px}
    .provider-protection-picker label{display:flex;align-items:center;gap:9px;padding:8px 9px;border-radius:8px;color:#ded6e3;font-size:11px;cursor:pointer}
    .provider-protection-picker label:hover{background:#1d1521}
    .provider-protection-picker label input{accent-color:#a65ce7}
    .provider-protection-picker label span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .provider-protection-hint{margin:7px 0 0;color:#7f7685;font-size:10px;line-height:1.4}
  `;
  document.head.appendChild(style);
}

function setupToggle(input) {
  if (!input || input.dataset.protectionToggleReady === '1') return;
  input.dataset.protectionToggleReady = '1';
  const option = input.closest('.provider-option');
  const state = document.createElement('span');
  state.className = 'provider-toggle-state';
  input.insertAdjacentElement('afterend', state);
  const sync = () => {
    const on = Boolean(input.checked);
    state.textContent = on ? 'ON' : 'OFF';
    state.classList.toggle('on', on);
    option?.setAttribute('data-state', on ? 'on' : 'off');
  };
  input.addEventListener('change', sync);
  sync();
}

function parseSelected(source) {
  return new Set(String(source.value || '').split(',').map((v) => v.trim()).filter(Boolean));
}

function addPicker(source, type) {
  if (!source || source.dataset.protectionPickerReady === '1') return;
  source.dataset.protectionPickerReady = '1';
  source.classList.add('provider-protection-source');
  source.readOnly = true;
  const values = type === 'country' ? ISO_COUNTRY_CODES : BROWSERS;
  const initiallySelected = parseSelected(source);
  const picker = document.createElement('details');
  picker.className = 'provider-protection-picker';
  const summary = document.createElement('summary');
  const title = document.createElement('span');
  title.textContent = type === 'country' ? 'Choose blocked countries' : 'Choose blocked browsers';
  const count = document.createElement('span');
  count.className = 'count';
  summary.append(title, count);
  const body = document.createElement('div');
  body.className = 'body';
  const search = document.createElement('input');
  search.className = 'search';
  search.type = 'search';
  search.placeholder = type === 'country' ? 'Search country…' : 'Search browser…';
  const list = document.createElement('div');
  list.className = 'list';
  const hint = document.createElement('div');
  hint.className = 'provider-protection-hint';
  hint.textContent = type === 'country' ? 'Select ISO country codes to block. The full country list is available.' : 'Select every browser you want to block. Detection uses the visitor browser user-agent plus browser hints where available.';
  body.append(search, list, hint);
  picker.append(summary, body);
  source.insertAdjacentElement('afterend', picker);

  const selected = new Set(initiallySelected);
  const render = () => {
    const query = search.value.trim().toLowerCase();
    list.innerHTML = '';
    values.forEach((value) => {
      const labelText = type === 'country' ? `${countryName(value)} (${value})` : value;
      if (query && !labelText.toLowerCase().includes(query)) return;
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = value;
      checkbox.checked = selected.has(value);
      const span = document.createElement('span');
      span.textContent = labelText;
      label.append(checkbox, span);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selected.add(value); else selected.delete(value);
        source.value = [...selected].join(', ');
        source.dispatchEvent(new Event('input', { bubbles: true }));
        count.textContent = `${selected.size} selected`;
      });
      list.appendChild(label);
    });
    count.textContent = `${selected.size} selected`;
  };
  search.addEventListener('input', render);
  render();
}

function setupPicker(modal, id, type) {
  const input = modal.querySelector(id);
  if (!input) return;
  addPicker(input, type);
}

function enhanceModal(modal) {
  if (!modal || modal.dataset.protectionEnhanced === '1') return;
  modal.dataset.protectionEnhanced = '1';
  injectStyles();
  modal.querySelectorAll('.provider-option input[type="checkbox"]').forEach(setupToggle);
  setupPicker(modal, '#protect-countries', 'country');
  setupPicker(modal, '#protect-browsers', 'browser');
}

function scan() {
  document.querySelectorAll('.provider-config-modal').forEach(enhanceModal);
}

function safeScan() {
  try { scan(); } catch (error) { console.error('[Frezen] provider protection UI enhancer failed', error); }
}

injectStyles();
safeScan();
document.addEventListener('DOMContentLoaded', safeScan, { once: true });
setTimeout(safeScan, 0);
new MutationObserver(safeScan).observe(document.body, { childList: true, subtree: true });
