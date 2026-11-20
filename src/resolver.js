import 'dotenv/config';
import puppeteer from 'puppeteer-core';

export function getRegionZoneMap() {
  return {
    US: process.env.BRIGHTDATA_US_PROXY,
    CA: process.env.BRIGHTDATA_CA_PROXY,
    GB: process.env.BRIGHTDATA_GB_PROXY,
    IN: process.env.BRIGHTDATA_IN_PROXY,
    AU: process.env.BRIGHTDATA_AU_PROXY,
    DE: process.env.BRIGHTDATA_DE_PROXY,
    FR: process.env.BRIGHTDATA_FR_PROXY,
    JP: process.env.BRIGHTDATA_JP_PROXY,
    SG: process.env.BRIGHTDATA_SG_PROXY,
    BR: process.env.BRIGHTDATA_BR_PROXY,
    TW: process.env.BRIGHTDATA_TW_PROXY,
    CZ: process.env.BRIGHTDATA_CZ_PROXY,
    UA: process.env.BRIGHTDATA_UA_PROXY,
    AE: process.env.BRIGHTDATA_AE_PROXY,
    PL: process.env.BRIGHTDATA_PL_PROXY,
    ES: process.env.BRIGHTDATA_ES_PROXY,
    ID: process.env.BRIGHTDATA_ID_PROXY,
    ZA: process.env.BRIGHTDATA_ZA_PROXY,
    MX: process.env.BRIGHTDATA_MX_PROXY,
    MY: process.env.BRIGHTDATA_MY_PROXY,
    IT: process.env.BRIGHTDATA_IT_PROXY,
    TH: process.env.BRIGHTDATA_TH_PROXY,
    NL: process.env.BRIGHTDATA_NL_PROXY,
    AR: process.env.BRIGHTDATA_AR_PROXY,
    BY: process.env.BRIGHTDATA_BY_PROXY,
    RU: process.env.BRIGHTDATA_RU_PROXY,
    IE: process.env.BRIGHTDATA_IE_PROXY,
    HK: process.env.BRIGHTDATA_HK_PROXY,
    KZ: process.env.BRIGHTDATA_KZ_PROXY,
    NZ: process.env.BRIGHTDATA_NZ_PROXY,
    TR: process.env.BRIGHTDATA_TR_PROXY,
    DK: process.env.BRIGHTDATA_DK_PROXY,
    GR: process.env.BRIGHTDATA_GR_PROXY,
    NO: process.env.BRIGHTDATA_NO_PROXY,
    AT: process.env.BRIGHTDATA_AT_PROXY,
    IS: process.env.BRIGHTDATA_IS_PROXY,
    SE: process.env.BRIGHTDATA_SE_PROXY,
    PT: process.env.BRIGHTDATA_PT_PROXY,
    CH: process.env.BRIGHTDATA_CH_PROXY,
    BE: process.env.BRIGHTDATA_BE_PROXY,
    PH: process.env.BRIGHTDATA_PH_PROXY,
    IL: process.env.BRIGHTDATA_IL_PROXY,
    MD: process.env.BRIGHTDATA_MD_PROXY,
    RO: process.env.BRIGHTDATA_RO_PROXY,
    CL: process.env.BRIGHTDATA_CL_PROXY,
    SA: process.env.BRIGHTDATA_SA_PROXY,
    FI: process.env.BRIGHTDATA_FI_PROXY,
    LI: process.env.BRIGHTDATA_LI_PROXY,
    KW: process.env.BRIGHTDATA_KW_PROXY,
    EE: process.env.BRIGHTDATA_EE_PROXY,
    HU: process.env.BRIGHTDATA_HU_PROXY,
    PE: process.env.BRIGHTDATA_PE_PROXY,
    KR: process.env.BRIGHTDATA_KR_PROXY,
    KH: process.env.BRIGHTDATA_KH_PROXY,
    CO: process.env.BRIGHTDATA_CO_PROXY,
    OM: process.env.BRIGHTDATA_OM_PROXY,
    LK: process.env.BRIGHTDATA_LK_PROXY,
    KE: process.env.BRIGHTDATA_KE_PROXY,
    PA: process.env.BRIGHTDATA_PA_PROXY,
    HR: process.env.BRIGHTDATA_HR_PROXY,
    SK: process.env.BRIGHTDATA_SK_PROXY,
    VN: process.env.BRIGHTDATA_VN_PROXY
  };
}

const userAgents = {
  desktop: [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:139.0) Gecko/20100101 Firefox/139.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.61",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
  ],
  mobile: [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; SM-S926B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/123.0 Mobile/15E148 Safari/605.1.15",
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; moto g power (2023)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 15; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/124.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/126.0 Mobile/15E148 Safari/605.1.15",
    "Mozilla/5.0 (Linux; Android 14; OnePlus 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"
  ]
};

const browserReuseEnabled = String(process.env.BROWSER_REUSE_ENABLED || 'false').toLowerCase() === 'true';
const reusedBrowsers = new Map();
const maxActiveResolutions = Number.isInteger(Number(process.env.MAX_ACTIVE_RESOLUTIONS)) ? Math.max(1, Number(process.env.MAX_ACTIVE_RESOLUTIONS)) : 12;
const maxActivePerRegion = Number.isInteger(Number(process.env.MAX_ACTIVE_PER_REGION)) ? Math.max(1, Number(process.env.MAX_ACTIVE_PER_REGION)) : 3;
const activeByRegion = new Map();
let activeResolutions = 0;
const resolutionWaiters = [];

async function acquireResolutionSlot(region) {
  const queuedAt = Date.now();
  while (activeResolutions >= maxActiveResolutions || (activeByRegion.get(region) || 0) >= maxActivePerRegion) {
    await new Promise(resolve => resolutionWaiters.push(resolve));
  }
  activeResolutions++;
  activeByRegion.set(region, (activeByRegion.get(region) || 0) + 1);
  return { queueWaitMs: Date.now() - queuedAt, release() {
    activeResolutions--;
    const nextRegionCount = (activeByRegion.get(region) || 1) - 1;
    if (nextRegionCount <= 0) activeByRegion.delete(region); else activeByRegion.set(region, nextRegionCount);
    resolutionWaiters.splice(0).forEach(wake => wake());
  } };
}

function isResolutionUrl(value) {
  if (typeof value !== 'string' || !value.trim() || /^(about:blank|chrome-error:\/\/)/i.test(value.trim())) return false;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

function redactSecrets(value) {
  return String(value || '').replace(/(wss?:\/\/)[^/@\s]+@/gi, '$1[credentials-redacted]@');
}

export function getBrowserWss(regionCode) {
  const regionZoneMap = getRegionZoneMap();
  const zone = regionZoneMap[regionCode?.toUpperCase()];
  const password = process.env.BRIGHTDATA_PASSWORD;

  if (!zone || !password) {
    throw new Error(`Missing proxy configuration for region: ${regionCode}`);
  }

  return `wss://${zone}:${password}@brd.superproxy.io:9222`;
}

function getRandomUserAgent(type) {
  let uaType = type;
  if (!uaType || uaType === 'random' || (uaType !== 'desktop' && uaType !== 'mobile')) {
    uaType = Math.random() < 0.5 ? 'desktop' : 'mobile';
  }
  const uaList = userAgents[uaType];
  const userAgent = uaList[Math.floor(Math.random() * uaList.length)];
  return { userAgent, isMobile: uaType === 'mobile', uaType };
}

/**
* MAIN FUNCTION
*/
export async function resolveWithBrowserAPI(inputUrl, region = "US", uaType) {
  const startedAt = Date.now();
  const normalizedRegion = String(region || 'US').toUpperCase();
  const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let browser;
  let page;
  let slot;
  const ownsBrowser = !browserReuseEnabled;
  try {
    if (!isResolutionUrl(inputUrl)) throw new Error('Invalid URL: only absolute HTTP and HTTPS URLs can be resolved.');
    slot = await acquireResolutionSlot(normalizedRegion);
    browser = browserReuseEnabled ? await getReusedBrowser(normalizedRegion) : await connectBrowser(normalizedRegion);
    page = await setupPage(browser, uaType);
    const timeout = getNavigationTimeout();
    await navigateToPage(page, inputUrl, timeout);
    await waitForRedirectsToSettle(page);
    const finalUrl = page.url();
    if (!isResolutionUrl(finalUrl)) throw new Error(`Invalid final destination: ${finalUrl || 'empty URL'}`);
    let ipData = { error: 'IP lookup unavailable' };
    try {
      ipData = await fetchIPData(page);
      if (ipData.error) ipData = await fetchCountryFromIsolatedSession(normalizedRegion, ipData.error);
    } catch (error) {
      ipData = await fetchCountryFromIsolatedSession(normalizedRegion, error.message);
    }
    const actualCountry = String(ipData?.country_code || '').toUpperCase() || null;
    const countryMatch = actualCountry ? actualCountry === normalizedRegion : null;
    const verificationError = countryMatch === true ? null : countryMatch === false
      ? `Country mismatch: requested ${normalizedRegion}, observed ${actualCountry}.`
      : `Country verification unavailable for requested ${normalizedRegion}: ${ipData?.error || 'no IP country data returned'}.`;
    console.info(JSON.stringify({ event: 'url_resolution', requestId, timestamp: new Date().toISOString(), requestedCountry: normalizedRegion, actualCountry, countryMatch, ip: ipData?.ip || null, ipVerificationSource: ipData?.source || null, ipLookupError: ipData?.error || null, host: new URL(inputUrl).host, stage: verificationError ? 'country_verification_failed' : 'completed', queueWaitMs: slot.queueWaitMs, durationMs: Date.now() - startedAt, finalHost: new URL(finalUrl).host }));
    return { finalUrl, ipData, requestId, durationMs: Date.now() - startedAt, countryMatch, verificationError, error: verificationError };
  } catch (error) {
    let host = null;
    try { host = new URL(inputUrl).host; } catch {}
    console.error(JSON.stringify({ event: 'url_resolution', requestId, timestamp: new Date().toISOString(), region: normalizedRegion, host, stage: 'failed', queueWaitMs: slot?.queueWaitMs || 0, durationMs: Date.now() - startedAt, error: redactSecrets(error.message), stack: redactSecrets(error.stack) }));
    return { error: error.message, requestId, durationMs: Date.now() - startedAt };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser && ownsBrowser) await safeCloseBrowser(browser);
    slot?.release();
  }
}

async function getReusedBrowser(region) {
  let pending = reusedBrowsers.get(region);
  if (pending) {
    const existing = await pending.catch(() => null);
    if (existing?.connected) return existing;
    reusedBrowsers.delete(region);
  }
  pending = connectBrowser(region);
  reusedBrowsers.set(region, pending);
  try {
    const browser = await pending;
    const cachedBrowser = Promise.resolve(browser);
    browser.once('disconnected', () => { if (reusedBrowsers.get(region) === cachedBrowser) reusedBrowsers.delete(region); });
    reusedBrowsers.set(region, cachedBrowser);
    return browser;
  } catch (error) {
    if (reusedBrowsers.get(region) === pending) reusedBrowsers.delete(region);
    throw error;
  }
}

/**
* CONNECT TO REMOTE BROWSER
*/
// async function connectBrowser(region) {
//   const browserWSEndpoint = getBrowserWss(region);

//   console.log(`[INFO] Connecting to browser (${region})...`);
//   console.log(`[DEBUG] Endpoint: ${browserWSEndpoint}`);

//   return puppeteer.connect({
//     browserWSEndpoint,
//     ignoreHTTPSErrors: true,

//   });
// }
/**
* CONNECT TO REMOTE BROWSER
*/
async function connectBrowser(region) {
  const browserWSEndpoint = getBrowserWss(region);

  console.log(`[INFO] Connecting to browser (${region})...`);
  console.log(`[DEBUG] Remote browser endpoint configured for region ${region} (credentials redacted)`);

  try {
    const browser = await puppeteer.connect({
      browserWSEndpoint,
      ignoreHTTPSErrors: true,
    });

    console.log(`[SUCCESS] Connected to browser (${region})`);
    return browser;
  } catch (error) {
    console.error(`[ERROR] Failed to connect to browser (${region})`);
    console.error(`Message: ${redactSecrets(error.message)}`);
    console.error(`Stack: ${redactSecrets(error.stack)}`);

    throw error; // rethrow if caller should handle it
  }
}

/**
* SETUP PAGE (UA + VIEWPORT + BLOCKING)
*/
async function setupPage(browser, uaType) {
  const page = await browser.newPage();
  try {
    await enableRequestBlocking(page);
    const { userAgent, isMobile } = getRandomUserAgent(uaType);
    await page.setUserAgent(userAgent);
    await setViewport(page, isMobile);
    return page;
  } catch (error) {
    await page.close().catch(() => {});
    throw error;
  }
}

/**
* BLOCK TRACKERS + HEAVY RESOURCES
*/
async function enableRequestBlocking(page) {
  await page.setRequestInterception(true);

  const blockedTrackingUrls = [
    "googletagmanager.com/gtm.js",
    "cdn.adapex.io/hb",
    "pagead2.googlesyndication.com/",
    "js.hotjar.io/",
    "analytics.google.com/",
  ];

  const blockedResources = ["image", "stylesheet", "font", "media"];

  page.on("request", (req) => {
    try {
      if (req.isInterceptResolutionHandled?.()) return;
      const shouldBlock =
        blockedResources.includes(req.resourceType()) ||
        blockedTrackingUrls.some((url) => req.url().includes(url));

      const decision = shouldBlock ? req.abort() : req.continue();
      decision?.catch?.(() => {});
    } catch (err) {
      console.error(`[ERROR] Request handling failed: ${err.message}`);
    }
  });
}

/**
* SET VIEWPORT (RANDOMIZED)
*/
async function setViewport(page, isMobile) {
  const randomOffset = () => Math.floor(Math.random() * 20) - 10;

  const viewport = isMobile
    ? {
        width: 375 + randomOffset(),
        height: 667 + randomOffset(),
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      }
    : {
        width: 1024 + randomOffset(),
        height: 768 + randomOffset(),
        isMobile: false,
      };

  await page.setViewport(viewport);
}

/**
* NAVIGATION HANDLER
*/
async function navigateToPage(page, url, timeout) {
  await page.goto(url, { waitUntil: 'load', timeout });
  // Wait for late script redirects and the page's remaining network activity.
  // Some ad/analytics sites never become idle, so the idle wait is bounded.
  await page.waitForNetworkIdle({ idleTime: 1000, timeout: Math.min(timeout, 8000) }).catch(() => {});
}

// Many campaign links redirect from client-side scripts after DOMContentLoaded.
// Wait for the main frame URL to stop changing before recording the destination.
async function waitForRedirectsToSettle(page, { stableForMs = 4000, maxWaitMs = 12000 } = {}) {
  const startedAt = Date.now();
  let previousUrl = page.url();
  let stableSince = Date.now();
  while (Date.now() - startedAt < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, 250));
    let currentUrl;
    try { currentUrl = page.url(); } catch { continue; }
    if (currentUrl !== previousUrl) {
      previousUrl = currentUrl;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= stableForMs) {
      return;
    }
  }
}

/**
* TIMEOUT CONFIG
*/
function getNavigationTimeout() {
  const envTimeout = Number(process.env.NAVIGATION_TIMEOUT);
  const timeout = Number.isInteger(envTimeout) && envTimeout > 0 ? Math.min(envTimeout, 180000) : 60000;

  console.log(`[INFO] Navigation timeout: ${timeout} ms`);

  return timeout;
}

/**
* FETCH IP GEO DATA
*/
async function fetchIPData(page) {
  // This is a same-session subresource request. Do not navigate this page (or
  // another tab in this session) to a second domain: Bright Data Browser API
  // sessions are limited to one top-level navigation domain.
  return page.evaluate(async () => {
    const lookupErrors = [];
    const providers = [
      { url: 'https://ipapi.co/json/', parse: data => data },
      { url: 'https://ipwho.is/', parse: data => data }
    ];
    for (const provider of providers) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(provider.url, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = provider.parse(await response.json());
        if (data.success === false) throw new Error(data.message || 'Provider rejected lookup');
        const countryCode = String(data.country_code || data.countryCode || '').toUpperCase();
        if (data.ip && /^[A-Z]{2}$/.test(countryCode)) {
          return { ip: data.ip, country: data.country_name || data.country || null, country_code: countryCode, region: data.region || data.region_name || null, source: 'resolution_session' };
        }
        throw new Error('Provider returned no IP or valid ISO country code');
      } catch (error) {
        lookupErrors.push(`${new URL(provider.url).hostname}: ${error.message || 'lookup failed'}`);
      } finally {
        clearTimeout(timer);
      }
    }
    return { error: lookupErrors.join('; ') || 'All IP geolocation providers failed' };
  });
}

async function fetchCountryFromIsolatedSession(region, previousError = '') {
  let probeBrowser;
  let page;
  try {
    // Bright Data requires a fresh browser session for a different top-level
    // domain. This fallback still uses the requested country zone.
    probeBrowser = await connectBrowser(region);
    page = await setupPage(probeBrowser, 'desktop');
    const response = await page.goto('https://ipwho.is/', { waitUntil: 'load', timeout: 8000 });
    if (!response?.ok()) throw new Error(`IP country probe returned HTTP ${response?.status() ?? 'no response'}`);
    const data = await response.json();
    const countryCode = String(data.country_code || '').toUpperCase();
    if (data.success === false || !data.ip || !/^[A-Z]{2}$/.test(countryCode)) throw new Error(data.message || 'Probe returned no IP or valid ISO country code');
    return { ip: data.ip, country: data.country || null, country_code: countryCode, region: data.region || null, source: 'isolated_country_probe', warning: previousError || null };
  } catch (error) {
    return { error: [previousError, error.message].filter(Boolean).join('; ') };
  } finally {
    if (page) await page.close().catch(() => {});
    if (probeBrowser) await safeCloseBrowser(probeBrowser);
  }
}

/**
* VALIDATION
*/
function isValidUrl(url) {
  return isResolutionUrl(url);
}

/**
* SAFE BROWSER CLOSE
*/
async function safeCloseBrowser(browser) {
  try {
    await browser.close();
    console.log("[INFO] Browser closed");
  } catch (err) {
    console.error(`[ERROR] Failed to close browser: ${err.message}`);
  }
}