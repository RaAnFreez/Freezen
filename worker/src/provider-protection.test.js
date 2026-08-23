import { describe, expect, it } from 'vitest';
import { enforceProviderProtection, getPolicy, detectBrowser, detectVpnDatacenter, COUNTRY_CODES } from './provider-protection.js';

describe('provider protection', () => {
  it('normalizes protection settings and validates ISO country codes', () => {
    const policy = getPolicy({ settings_json: JSON.stringify({ protection: { visitor: true, blocked_countries: ['ID', 'NOT-A-COUNTRY'], blocked_browsers: ['Chrome'] } }) });
    expect(policy.visitor).toBe(true);
    expect(policy.blockedCountries).toEqual(['ID']);
    expect(COUNTRY_CODES.has('ID')).toBe(true);
  });

  it('detects common browsers from user agents', () => {
    expect(detectBrowser('Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36')).toBe('Chrome');
    expect(detectBrowser('Mozilla/5.0 Edg/120.0.0.0')).toBe('Edge');
    expect(detectBrowser('Mozilla/5.0 SamsungBrowser/25.0 Chrome/120.0.0.0 Mobile')).toBe('Samsung Internet');
  });

  it('blocks a configured country', async () => {
    const provider = { settings_json: JSON.stringify({ protection: { blocked_countries: ['ID'] } }) };
    const request = new Request('https://frezen.test/get-key/test', { headers: { 'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0', accept: 'text/html' } });
    Object.defineProperty(request, 'cf', { value: { country: 'ID' } });
    const response = await enforceProviderProtection(request, {}, provider);
    expect(response?.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'COUNTRY_BLOCKED' });
  });

  it('blocks the configured browser', async () => {
    const provider = { settings_json: JSON.stringify({ protection: { blocked_browsers: ['Chrome'] } }) };
    const request = new Request('https://frezen.test/get-key/test', { headers: { 'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0', accept: 'text/html' } });
    const response = await enforceProviderProtection(request, {}, provider);
    expect(response?.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'BROWSER_BLOCKED' });
  });

  it('blocks client-reported adblock and incognito signals when enabled', async () => {
    const provider = { settings_json: JSON.stringify({ protection: { adblock: true, incognito: true } }) };
    const request = new Request('https://frezen.test/get-key/test', { headers: { 'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0', 'x-frezen-adblock': '1' } });
    const response = await enforceProviderProtection(request, {}, provider);
    expect(response?.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'ADBLOCK_BLOCKED' });
  });

  it('blocks a Cloudflare corporate proxy when VPN protection is enabled', async () => {
    const provider = { settings_json: JSON.stringify({ protection: { vpn: true } }) };
    const request = new Request('https://frezen.test/get-key/test', { headers: { 'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0' } });
    Object.defineProperty(request, 'cf', { value: { botManagement: { corporateProxy: true } } });
    const response = await enforceProviderProtection(request, {}, provider);
    expect(response?.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'VPN_DATACENTER_BLOCKED' });
  });

  it('blocks a configured ASN deny-list entry', async () => {
    const provider = { settings_json: JSON.stringify({ protection: { vpn: true } }) };
    const request = new Request('https://frezen.test/get-key/test', { headers: { 'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0' } });
    Object.defineProperty(request, 'cf', { value: { asn: 64500 } });
    const response = await enforceProviderProtection(request, { FREZEN_BLOCKED_VPN_ASNS: 'AS64500, 64501' }, provider);
    expect(response?.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'VPN_DATACENTER_BLOCKED' });
  });

  it('blocks low bot scores when visitor protection is enabled', async () => {
    const provider = { settings_json: JSON.stringify({ protection: { visitor: true } }) };
    const request = new Request('https://frezen.test/get-key/test', { headers: { 'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0' } });
    Object.defineProperty(request, 'cf', { value: { botManagement: { score: 12, verifiedBot: false } } });
    const response = await enforceProviderProtection(request, {}, provider);
    expect(response?.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'VISITOR_PROTECTION_BLOCKED' });
  });

  it('does not block a verified bot because of the bot score alone', async () => {
    const provider = { settings_json: JSON.stringify({ protection: { visitor: true } }) };
    const request = new Request('https://frezen.test/get-key/test', { headers: { 'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0' } });
    Object.defineProperty(request, 'cf', { value: { botManagement: { score: 5, verifiedBot: true } } });
    const response = await enforceProviderProtection(request, {}, provider);
    expect(response).toBeNull();
  });

  it('detects a configured VPN/datacenter organization', () => {
    const result = detectVpnDatacenter({ asn: 14061, asOrganization: 'DigitalOcean' }, {});
    expect(result.suspiciousOrganization).toBe(true);
    expect(result.asn).toBe('14061');
  });
});