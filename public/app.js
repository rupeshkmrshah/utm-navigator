const campaigns = [];
let campaignPage = 1;
let campaignPageSize = 10;
let campaignDateRange = null;
const isUsableFinalUrlClient = value => {
  if (typeof value !== 'string' || !value.trim() || /^(about:blank|chrome-error:\/\/)/i.test(value.trim())) return false;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
};
const escapeHtmlClient = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

class FrontendLogger {
  constructor() {
    this.userId = null;
  }

  async getUserId() {
    if (this.userId) return this.userId;

    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'same-origin',
        cache: 'no-store'
      });
      const data = await response.json();
      this.userId = data.user?.id || null;
      return this.userId;
    } catch (error) {
      console.error('Failed to fetch user ID:', error);
      return null;
    }
  }

  async logActivity(action, details = {}) {
    const userId = await this.getUserId();
    if (!userId) return;

    try {
      const isString = typeof details === 'string';
      const isObject = typeof details === 'object' && details !== null;

      // Prepare log data based on type
      const logData = {
        userId,
        action,
        details: isString
          ? details // plain string, no extra fields
          : {
              ...details,
              timestamp: new Date().toISOString(),
              userAgent: navigator.userAgent,
              url: window.location.href
            }
      };

      await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify(logData)
      });
    } catch (error) {
      console.error('Failed to log activity:', error);
    }
  }

  async logCampaignAdd(campaignData) {
    await this.logActivity('CAMPAIGN_ADD', campaignData);
  }

  async logCampaignDelete(campaignId, campaignData) {
    await this.logActivity('CAMPAIGN_DELETE', { campaignId, ...campaignData });
  }

  async logCampaignCopy(campaignId, campaignData) {
    await this.logActivity('CAMPAIGN_COPY', { campaignId, ...campaignData });
  }

  async logCampaignRefresh(campaignId, campaignData) {
    await this.logActivity('CAMPAIGN_REFRESH', { campaignId, ...campaignData });
  }

  async logExport(format, campaignCount) {
    await this.logActivity('EXPORT', { format, campaignCount });
  }

  async logImport(format, fileName, campaignCount) {
    await this.logActivity('IMPORT', { format, fileName, campaignCount });
  }

  async logLocationDetection(country, method) {
    await this.logActivity('LOCATION_DETECTION', { country, method });
  }

  async logError(error, context) {
    await this.logActivity('ERROR', { error: error.message, context });
  }
}

// Create global logger instance
window.frontendLogger = new FrontendLogger();

// Auto-detect location on page load
async function detectLocation() {
  const statusIndicator = document.getElementById("country-status");
  const countrySelect = document.getElementById("url-country");
  const GEO_FETCH_API_KEY = '4d32f0da00224e50884faa071df764b9';

  statusIndicator.textContent = "🔍 Detecting...";
  statusIndicator.className = "status-indicator detecting";

  try {
    // Try multiple IP geolocation services for better reliability
    const services = [
      "https://ipapi.co/json/",
      `https://api.ipgeolocation.io/ipgeo?apiKey=${GEO_FETCH_API_KEY}`,
      "https://ipinfo.io/json",
    ];

    let locationData = null;

    for (const service of services) {
      try {
        const response = await fetch(service, { cache: 'no-store' });
        if (response.ok) {
          locationData = await response.json();
          break;
        }
      } catch (e) {
        console.log(`Service ${service} failed, trying next...`);
      }
    }

    if (locationData) {
      // Extract country code from different service formats
      const countryCode =
        locationData.country_code ||
        locationData.country_code2 ||
        locationData.country ||
        locationData.countryCode;

      if (countryCode) {
        // Set the country in the dropdown
        const option = Array.from(countrySelect.options).find(
          (opt) => opt.value.toUpperCase() === countryCode.toUpperCase()
        );

        if (option) {
          countrySelect.value = countryCode.toUpperCase();
          // Trigger Select2 to update
          $(countrySelect).trigger("change");

          statusIndicator.textContent = `✅ ${countryCode.toUpperCase()}`;
          statusIndicator.className = "status-indicator detected";

          // Show city/region if available
          const city = locationData.city || locationData.region_name || "";
          if (city) {
            statusIndicator.title = `Detected: ${city}, ${countryCode.toUpperCase()}`;
            await window.frontendLogger.logActivity('LOCATION_DETECTION', `User refreshed the location`);
          }
        } else {
          throw new Error(`Country ${countryCode} not found in dropdown`);
        }
      } else {
        throw new Error("No country code in response");
      }
    } else {
      throw new Error("All services failed");
    }
  } catch (error) {
    console.error("Location detection failed:", error);
    statusIndicator.textContent = "❌ Failed";
    statusIndicator.className = "status-indicator detect-failed";
    statusIndicator.title =
      "Location detection failed. Please select manually.";

    // Reset to default option
    countrySelect.value = "";
    $(countrySelect).trigger("change");
  }
}

function loadCampaigns() {
  const stored = localStorage.getItem("campaigns");
  if (stored) {
    const savedCampaigns = JSON.parse(stored).map(campaign => {
      if (campaign.finalUrl !== 'Loading...' && !isUsableFinalUrlClient(campaign.finalUrl)) return { ...campaign, finalUrl: 'Resolution failed: Invalid or browser error destination' };
      return campaign;
    });
    campaigns.push(...savedCampaigns);
    renderTable();
  }
}

//detect location as soon as window load
window.onload = function () {
  loadCampaigns();

  // Set default sorting to newest first
  document.getElementById("sortDate").value = "newest";
  sortTableByDate();

  fetch('/api/regions', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(data => {
    if (!data?.regions) return;
    const available = new Set(data.regions);
    const selector = document.getElementById('url-country');
    for (const option of selector.options) {
      if (!option.value) continue;
      option.disabled = !available.has(option.value.toUpperCase());
      if (option.disabled && !option.textContent.includes('not configured')) option.textContent += ' · proxy not configured';
    }
    if (!available.has(selector.value)) selector.value = available.has('US') ? 'US' : (data.regions[0] || '');
    if (window.jQuery) $(selector).trigger('change');
  }).catch(error => console.warn('Could not load configured proxy regions:', error.message));

  // Detect location after a short delay to ensure Select2 is initialized
  //setTimeout(detectLocation, 1000);
};

function saveCampaigns() {
  localStorage.setItem("campaigns", JSON.stringify(campaigns));
}

function formatDate(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(date)).map(part => [part.type, part.value]));
  return `${parts.day}/${parts.month}/${parts.year}, ${parts.hour}:${parts.minute}:${parts.second}`;
}

function isValidURL(str) {
  try {
    new URL(str);
    return true;
  } catch (_) {
    return false;
  }
}

async function resolveFinalUrlDetails(inputUrl, region = "US", uaType = "random") {
    const fallback = "Resolution failed";
  
    try {
      if (!inputUrl || typeof inputUrl !== "string") {
        console.error("❌ Invalid URL input");
        return { finalUrl: fallback };
      }
  
      // Trim and sanitize input
      const trimmedUrl = inputUrl.trim();
      try {
        new URL(trimmedUrl); // validate format
      } catch {
        console.error("❌ Malformed URL:", trimmedUrl);
        return { finalUrl: fallback };
      }
  
      // ✅ Use region and uaType passed as argument (not from dropdown)
      const selectedRegion = region.toUpperCase() || "US";
      const selectedUaType = uaType || "random";
  
      // Safely build query string
      const params = new URLSearchParams({
        url: trimmedUrl,
        region: selectedRegion,
        uaType: selectedUaType
      });
  
      const requestUrl = `/resolve?${params.toString()}`;
      console.log(`🌐 Fetching with region [${selectedRegion}]:`, requestUrl);
      // const requestUrl = `/resolve?${params.toString()}&ts=${Date.now()}`; // cache-bust
      // console.log(`🌐 Fetching with region [${selectedRegion}] and uaType [${selectedUaType}]:`, requestUrl);
  
      const response = await fetch(requestUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store'
      });
      if (!response.ok) {
        const errorData = await response.json();
        if (isUsableFinalUrlClient(errorData.finalUrl)) {
          return {
            finalUrl: errorData.finalUrl,
            requestedRegion: errorData.requestedRegion || selectedRegion,
            actualRegion: errorData.actualRegion || null,
            regionMatch: errorData.regionMatch ?? null,
            verificationStatus: errorData.countryVerificationStatus || 'unavailable',
            verificationError: errorData.countryVerificationError || errorData.details || null,
            ip: errorData.ipData?.ip || null,
            actualCountry: errorData.ipData?.country || null,
            verificationSource: errorData.ipData?.source || null,
            resolutionFailed: true
          };
        }
        throw new Error(errorData.details || errorData.error || `Server responded with ${response.status}`);
      }
  
      const data = await response.json();
  
      if (data?.finalUrl && isUsableFinalUrlClient(data.finalUrl)) {
        // console.log(`✅ Final URL for [${selectedRegion}]:`, data.finalUrl);
        console.log(`✅ Final URL for [${selectedRegion}] [${selectedUaType}]:`, data.finalUrl);
        if (data.regionMatch !== undefined) {
          console.log(`🔍 Region verification: Requested [${data.requestedRegion}] vs Actual [${data.actualRegion}] - ${data.regionMatch ? '✅ REGION MATCHED' : '❌ REGION MISMATCH'}`);
        }
        return { finalUrl: data.finalUrl, requestedRegion: data.requestedRegion || selectedRegion, actualRegion: data.actualRegion || null, regionMatch: data.regionMatch ?? null, verificationStatus: data.countryVerificationStatus || 'unavailable', verificationError: data.countryVerificationError || null, ip: data.ipData?.ip || null, actualCountry: data.ipData?.country || null, verificationSource: data.ipData?.source || null };
      } else {
        console.warn("⚠️ No finalUrl in response");
        return { finalUrl: fallback };
      }
    } catch (err) {
      console.error("❌ Error resolving URL:", err.message);
      return { finalUrl: `${fallback}: ${err.message}` };
    }
}

async function resolveFinalUrl(inputUrl, region = "US", uaType = "random") {
  return (await resolveFinalUrlDetails(inputUrl, region, uaType)).finalUrl;
}

//Function to handle add campaign after adding a new campaign and click on add campaign button
async function addCampaign() {
  const url = document.getElementById("campaign-url").value;
  const tags = document.getElementById("campaign-tags").value;
  const loadingRow = document.getElementById("loadingRow");
  const country = document.getElementById("url-country").value;
  const uaType = document.getElementById("ua-type") ? document.getElementById("ua-type").value : "random";

  //Validate inputs
  if (!url) return showNotification("Campaign URL is required", "error" );
  if (!tags) return showNotification("Campaign tags are required", "error" );
  if (!isValidURL(url)) return showNotification("Please enter a valid URL", "error" );
  if (!country) return showNotification("Please select a country", "error" );

  loadingRow.style.display = "table-row";

  // 👉 Show loader toast BEFORE resolving
  showLoadingToast("Please wait, While we're fetching the URL...");

  const now = new Date();
  const resolution = await resolveFinalUrlDetails(url, country, uaType);
  const finalUrl = resolution.finalUrl;
  console.log(`🌍 Added campaign for ${country} (${uaType}):`, finalUrl);
  // 👉 Remove loader toast AFTER resolving
  removeLoadingToast();

  const campaign = {
    id: Date.now(),
    url,
    finalUrl,
    tags,
    date: formatDate(now),
    country: country,
    actualCountry: resolution.actualRegion,
    actualCountryName: resolution.actualCountry,
    proxyIp: resolution.ip,
    regionMatch: resolution.regionMatch,
    verificationStatus: resolution.verificationStatus,
    verificationError: resolution.verificationError,
    verificationSource: resolution.verificationSource,
    uaType: uaType,
  };

  campaigns.push(campaign);

  // Apply current sorting after adding new campaign
  sortTableByDate();
  saveCampaigns();

  loadingRow.style.display = "none";

  document.getElementById("campaign-url").value = "";
  document.getElementById("campaign-tags").value = "";
  //document.getElementById("url-country").value = "";
  $("#url-country").val("").trigger("change"); // Reset Select2 dropdown properly
  if (document.getElementById("ua-type")) document.getElementById("ua-type").value = "random";

  // ✅ Show success notification
  showNotification(`Resolution for ${country} (${uaType}) added successfully!`, "success");
}

// Replace your existing refreshAllUrls function with this improved version
async function refreshAllUrls() {
  const refreshBtn = document.getElementById("refreshAllBtn");
  const originalText = refreshBtn.innerHTML;

  // Prevent multiple simultaneous refresh operations
  if (refreshBtn.disabled) {
    showNotification("⚠️ Refresh already in progress", "warning");
    return;
  }

  // Disable button and show loading state
  refreshBtn.disabled = true;
  refreshBtn.innerHTML = '<span class="loading-spinner"></span>Refreshing...';

  // Store original final URLs as backup
  const originalFinalUrls = campaigns.map((c) => ({
    id: c.id,
    finalUrl: c.finalUrl,
    refreshCount: 0,
  }));

  // Set all campaigns to loading state
  campaigns.forEach((campaign) => {
    campaign.finalUrl = "Loading...";
  });
  renderTable();

  let successCount = 0;
  let errorCount = 0;

  try {
    // Process campaigns in smaller batches to reduce server load
    const batchSize = 2; // Reduced from 3 to 2 for better stability
    const totalCampaigns = campaigns.length;

    for (let i = 0; i < campaigns.length; i += batchSize) {
      const batch = campaigns.slice(i, i + batchSize);
      const currentBatchStart = i + 1;
      const currentBatchEnd = Math.min(i + batchSize, totalCampaigns);

      // Update button with progress
      refreshBtn.innerHTML = `<span class="loading-spinner"></span>Processing ${currentBatchStart}-${currentBatchEnd} of ${totalCampaigns}...`;

      // Process batch with individual error handling
      const batchPromises = batch.map(async (campaign, index) => {
        const campaignNumber = i + index + 1;

        try {
          // Use campaign's stored country/region for refresh
          const campaignRegion = campaign.country || "US";
          console.log(`🔄 Refreshing campaign ${campaignNumber} with region [${campaignRegion}]`);
          const finalUrl = await resolveFinalUrl(campaign.url, campaignRegion, campaign.uaType || 'random');

          // Validate the resolved URL
          if (
            !isUsableFinalUrlClient(finalUrl) ||
            finalUrl === "Loading..." ||
            finalUrl.startsWith("chrome-error://") ||
            finalUrl.includes("chromewebdata")
          ) {
            throw new Error("Invalid resolution result");
          }

          campaign.finalUrl = finalUrl;
          campaign.date = formatDate(new Date()); // Update the date
          successCount++;

          console.log(
            `✅ Campaign ${campaignNumber}/${totalCampaigns} resolved successfully with [${campaignRegion}]`
          );
        } catch (error) {
          console.error(
            `❌ Campaign ${campaignNumber}/${totalCampaigns} failed:`,
            error.message
          );

          // Restore original URL if available, otherwise set descriptive error
          const originalData = originalFinalUrls.find(
            (orig) => orig.id === campaign.id
          );

          if (
            originalData &&
            originalData.finalUrl !== "Loading..." &&
            !String(originalData.finalUrl).startsWith("Resolution failed")
          ) {
            campaign.finalUrl = originalData.finalUrl; // Restore previous working URL
            console.log(
              `🔄 Restored previous URL for campaign ${campaignNumber}`
            );
          } else {
            // Set descriptive error message
            if (
              error.message.includes("timeout") ||
              error.message.includes("Timeout")
            ) {
              campaign.finalUrl = "Timeout - Please try again";
            } else if (
              error.message.includes("Network") ||
              error.message.includes("fetch")
            ) {
              campaign.finalUrl = "Network error";
            } else {
              campaign.finalUrl = "Resolution failed";
            }
          }

          errorCount++;
        }

        // Update table after each URL to show progress
        renderTable();
      });

      // Wait for the current batch to complete
      await Promise.allSettled(batchPromises);

      // Save progress after each batch
      saveCampaigns();

      // Longer delay between batches to be more respectful to servers
      if (i + batchSize < campaigns.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
      }
    }

    // Final update and save
    renderTable();
    saveCampaigns();

    // Show completion notification
    if (errorCount === 0) {
      showNotification(
        `✅ All ${successCount} URLs refreshed successfully!`,
        "success"
      );
    } else if (successCount > 0) {
      showNotification(
        `⚠️ Refresh completed: ${successCount} successful, ${errorCount} failed`,
        "warning"
      );
    } else {
      showNotification(
        `❌ Refresh failed: All ${errorCount} URLs could not be resolved`,
        "error"
      );
    }
  } catch (error) {
    console.error("Critical error during bulk refresh:", error);

    // Attempt to restore original URLs on critical failure
    try {
      originalFinalUrls.forEach((original) => {
        const campaign = campaigns.find((c) => c.id === original.id);
        if (campaign && original.finalUrl !== "Loading...") {
          campaign.finalUrl = original.finalUrl;
        }
      });
      renderTable();
      saveCampaigns();

      showNotification("❌ Refresh failed - Previous URLs restored", "error");
    } catch (restoreError) {
      console.error("Failed to restore original URLs:", restoreError);
      showNotification("❌ Critical refresh failure", "error");
    }
  } finally {
    // Re-enable button with original text
    refreshBtn.disabled = false;
    refreshBtn.innerHTML = originalText;
  }
}

// Add a function to refresh individual URLs
async function refreshSingleUrl(campaignId) {
  const campaign = campaigns.find((c) => c.id === campaignId);
  if (!campaign) return;

  // ✅ Get latest country directly from input field
  const row = document.querySelector(`tr[data-campaign-id="${campaignId}"]`);
  const countryInput = row?.querySelector('.country-input');
  if (countryInput) {
    campaign.country = countryInput.value.toUpperCase(); // force update
  }

  const campaignRegion = (campaign.country || "US").toUpperCase();
  const campaignUaType = campaign.uaType || "random";
  console.log(`🔄 Refreshing with region: [${campaignRegion}], uaType: [${campaignUaType}]`); 

  const originalFinalUrl = campaign.finalUrl;

  // ✅ Increment refresh count
  campaign.refreshCount = (campaign.refreshCount || 0) + 1;

  campaign.finalUrl = "Loading...";
  renderTable();

  try {
    const resolution = await resolveFinalUrlDetails(campaign.url, campaignRegion, campaignUaType);
    const finalUrl = resolution.finalUrl;

    if (
      finalUrl &&
      finalUrl !== "Loading..." &&
      !finalUrl.startsWith("chrome-error://") &&
      !finalUrl.includes("chromewebdata") &&
      !finalUrl.startsWith("about:")
    ) {
      campaign.finalUrl = finalUrl;
      campaign.actualCountry = resolution.actualRegion;
      campaign.actualCountryName = resolution.actualCountry;
      campaign.proxyIp = resolution.ip;
      campaign.regionMatch = resolution.regionMatch;
      campaign.verificationStatus = resolution.verificationStatus;
      campaign.verificationError = resolution.verificationError;
      campaign.verificationSource = resolution.verificationSource;
      campaign.date = formatDate(new Date());
      await window.frontendLogger.logActivity('URL_REFRESHED', `URL has been refreshed`);
      showNotification(`✅ URL refreshed successfully! with region [${campaignRegion}] and uaType [${campaignUaType}]!`, "success");
    } else {
      throw new Error("Invalid resolution result");
    }
  } catch (error) {
    console.error("Single URL refresh failed:", error);
    campaign.finalUrl = originalFinalUrl; // Restore original
    await window.frontendLogger.logActivity('FAILED', `URL Refresh has been failed`);
    showNotification("❌ Failed to refresh URL", "error");
  }

  renderTable();
  saveCampaigns();
}

// Enhanced renderTable function with individual refresh buttons
function renderTable() {
  const tbody = document.getElementById("tableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const query = (document.getElementById("searchInput")?.value || "").trim().toLowerCase();
  const filteredCampaigns = campaigns.filter(campaign => {
    const searchable = [campaign.url, campaign.finalUrl, campaign.tags, campaign.country, campaign.actualCountry, campaign.uaType].join(" ").toLowerCase();
    if (query && !searchable.includes(query)) return false;
    if (campaignDateRange?.[0] && campaignDateRange?.[1]) {
      if (typeof campaign.date !== "string") return false;
      const date = parseDateString(campaign.date);
      const start = new Date(campaignDateRange[0]); start.setHours(0, 0, 0, 0);
      const end = new Date(campaignDateRange[1]); end.setHours(23, 59, 59, 999);
      if (Number.isNaN(date.getTime()) || date < start || date > end) return false;
    }
    return true;
  });
  const pageCount = Math.max(1, Math.ceil(filteredCampaigns.length / campaignPageSize));
  campaignPage = Math.min(campaignPage, pageCount);
  const pageCampaigns = filteredCampaigns.slice((campaignPage - 1) * campaignPageSize, campaignPage * campaignPageSize);
  const pageInfo = document.getElementById("campaignPageInfo");
  const previous = document.getElementById("campaignPrevPage");
  const next = document.getElementById("campaignNextPage");
  if (pageInfo) pageInfo.textContent = `Page ${campaignPage} of ${pageCount} · ${filteredCampaigns.length} campaigns`;
  if (previous) previous.disabled = campaignPage <= 1;
  if (next) next.disabled = campaignPage >= pageCount;

  if (filteredCampaigns.length === 0) {
    const noDatarow = document.createElement("tr");
    noDatarow.innerHTML = `<td colspan="7" class="campaign-empty-state">☹️ No matching campaigns. <a href="#campaign-url">Add a campaign</a></td>`;
    tbody.appendChild(noDatarow);
    return;
  }

  pageCampaigns.forEach((c) => {
    const row = document.createElement("tr");
    row.setAttribute("data-campaign-id", c.id); // 🔑 for tracking rows
    const isLoading = c.finalUrl === "Loading...";
    const isError = c.finalUrl !== 'Loading...' && (!isUsableFinalUrlClient(c.finalUrl) || String(c.finalUrl || '').includes("Timeout") || String(c.finalUrl || '').includes("Network error"));

    let finalUrlContent = "";
    if (isLoading) {
      finalUrlContent = `<span class="status-badge status-loading"><span class="loading-spinner"></span>Loading...</span>`;
    } else if (isError) {
      finalUrlContent = `
            <div class="url-cell">
              <span class="status-badge status-error">❌ ${escapeHtmlClient(c.finalUrl || 'Resolution failed')}</span>
              <button class="copy-btn refresh-single-btn" onclick="refreshSingleUrl(${c.id})" title="Retry this URL">
                🔄 Retry (${c.refreshCount || 0})
              </button>
            </div>
          `;
    } else {
      finalUrlContent = `
            <div class="url-cell">
              <span class="url-text">${escapeHtmlClient(c.finalUrl)}</span>
              <div class="url-actions">
                <button class="copy-btn refresh-single-btn" onclick="refreshSingleUrl(${c.id})" title="Refresh this URL">
                  🔄 Refresh URL (${c.refreshCount || 0})
                </button>
              </div>
            </div>
          `;
    }

    const countryVerification = c.actualCountry
      ? `<small class="proxy-verification" title="Proxy IP: ${escapeHtmlClient(c.proxyIp || 'not available')}">${c.regionMatch ? '✓ Match' : '⚠ Mismatch'} · Requested ${escapeHtmlClient(c.country || 'US')} · Actual ${escapeHtmlClient(c.actualCountry)}${c.proxyIp ? ` · ${escapeHtmlClient(c.proxyIp)}` : ''}${c.verificationSource === 'isolated_country_probe' ? ' · separate country probe' : ''}</small>`
      : `<small class="proxy-verification" title="${escapeHtmlClient(c.verificationError || 'Country lookup did not return an IP and country code')}">? Country check unavailable · Requested ${escapeHtmlClient(c.country || 'US')}${c.verificationError ? ` · ${escapeHtmlClient(c.verificationError)}` : ''}</small>`;
    row.innerHTML = `
          <td>${c.date}</td>
          <td contenteditable="true" onblur="updateCampaignURL(${c.id}, this.innerText)">${escapeHtmlClient(c.url)}</td>
          <td>${finalUrlContent}</td>
          <td>
            <input type="text"
               class="country-input"
               value="${c.country || 'US'}"
               onchange="updateCountry(${c.id}, this.value)"
               style="width:100px; text-transform:uppercase;" 
            />
            ${countryVerification}
          </td>
          <td contenteditable="true" onblur="updateTags(${c.id}, this.innerText)">${escapeHtmlClient(c.tags)}</td>
          <td>${c.uaType === 'mobile' ? '📱 Mobile' : (c.uaType === 'desktop' ? '🖥️ Desktop' : '🔄 Rotating')}</td>
          <td>
            <button class="btn-danger" onclick="confirmDelete(${c.id})">🗑️ Delete</button>
            ${isUsableFinalUrlClient(c.finalUrl) ? `<button class="copy-btn" onclick="copyCampaignFinal(${Number(c.id)})">📋 Copy</button>` : ''}
          </td>
        `;
    tbody.appendChild(row);
  });
}

function copyCampaignFinal(campaignId) {
  const campaign = campaigns.find(item => Number(item.id) === Number(campaignId));
  if (campaign && isUsableFinalUrlClient(campaign.finalUrl)) copyToClipboard(campaign.finalUrl);
}

function updateCampaignURL(id, newUrl) {
  const campaign = campaigns.find((c) => c.id === id);
  if (campaign) {
    campaign.url = newUrl;
    campaign.finalUrl = "Loading...";
    campaign.actualCountry = null;
    campaign.actualCountryName = null;
    campaign.proxyIp = null;
    campaign.regionMatch = null;
    campaign.verificationStatus = null;
    campaign.verificationError = null;
    renderTable();

    // Use campaign's country for URL update
    const campaignRegion = campaign.country || "US";
    resolveFinalUrlDetails(newUrl, campaignRegion).then((resolution) => {
      campaign.finalUrl = resolution.finalUrl;
      campaign.actualCountry = resolution.actualRegion;
      campaign.actualCountryName = resolution.actualCountry;
      campaign.proxyIp = resolution.ip;
      campaign.regionMatch = resolution.regionMatch;
      campaign.verificationStatus = resolution.verificationStatus;
      campaign.verificationError = resolution.verificationError;
      campaign.verificationSource = resolution.verificationSource;
      campaign.date = formatDate(new Date());
      renderTable();
      saveCampaigns();
    });
  }
}

function updateTags(id, newTags) {
  const campaign = campaigns.find((c) => c.id === id);
  if (campaign) {
    campaign.tags = newTags;
    saveCampaigns();
  }
}

// Add updateCountry function
function updateCountry(id, newCountry) {
  const campaign = campaigns.find((c) => c.id === id);
  if (campaign) {
    campaign.country = newCountry.toUpperCase();
    campaign.actualCountry = null;
    campaign.actualCountryName = null;
    campaign.proxyIp = null;
    campaign.regionMatch = null;
    campaign.verificationStatus = null;
    campaign.verificationError = null;
    console.log(`Country updated:`, campaign.country); // ✅ Check this shows in console
    saveCampaigns();
  }
}

function confirmDelete(id) {
  if (
    confirm(
      "Are you sure you want to delete this campaign? This action cannot be undone."
    )
  ) {
    deleteCampaign(id);
  }
}
function deleteCampaign(id) {
  const index = campaigns.findIndex((c) => c.id === id);
  if (index !== -1) {
    campaigns.splice(index, 1);
    renderTable();
    saveCampaigns();
  }
}

// Show modal on delete click
function deleteTableRows() {
  document.getElementById("confirmModal").classList.add("show");
}

// Hide modal helper
function hideModal() {
  document.getElementById("confirmModal").classList.remove("show");
}

// Event listeners
document.getElementById("cancelBtn").addEventListener("click", hideModal);
document.getElementById("exitBtn").addEventListener("click", hideModal);
document.getElementById("deleteBtn").addEventListener("click", () => {
  //campaigns.splice(0, campaigns.length);  // Clear campaigns
  campaigns.length = 0;
  localStorage.removeItem("campaigns"); // Clear localStorage as well
  renderTable();
  saveCampaigns();
  hideModal();

  showNotification("🗑️ All campaigns deleted successfully.", "info");
});

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
      // Create a beautiful notification
      const notification = document.createElement("div");
      notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 40%;
            --background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            background:rgba(99, 102, 241, 0.25);
            color: white;
            padding: 15px 25px;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(16, 185, 129, 0.3);
            z-index: 1000;
            font-weight: 600;
            max-width: 300px;
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            animation: fadeInUp 0.3s ease-out;
          `;
      notification.textContent = "✅ Copied to clipboard!";
      document.body.appendChild(notification);
  
      setTimeout(() => {
        notification.remove();
      }, 3000);
    });
  } else {
  // Fallback for insecure origins
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";  // Prevent scrolling to bottom
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    document.execCommand('copy');
    console.log('Fallback: Copying successful');
    alert('Url Copied');
  } catch (err) {
    console.error('Fallback: Copy failed', err);
  }
    document.body.removeChild(textarea);
  }
}

function exportCSV() {
  let csv = "Date,Campaign URL,Final URL,Resolution Status,Failure Reason,Country,Tags,UA Type\n";
  campaigns.forEach((c) => {
    const resolved = isUsableFinalUrlClient(c.finalUrl);
    const fields = [c.date, c.url, resolved ? c.finalUrl : '', resolved ? 'resolved' : 'failed', resolved ? '' : (c.finalUrl || 'Resolution failed'), c.country || 'US', c.tags, c.uaType || 'random'];
    csv += `${fields.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')}\n`;
  });

  // Set UTF-8 encoding
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

  // Generate timestamp in YYYYMMDD-HHMMSS format
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, "0");
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  // Filename with timestamp
  const filename = `resolved-urls-${timestamp}.csv`;

  // Create and trigger download link
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Cleanup
  URL.revokeObjectURL(url);
}

function filterTable() {
  campaignPage = 1;
  renderTable();
}

//Country Dropdown jquery
$(document).ready(function () {
  // Initialize Select2 on the country select element
  $("#url-country").select2({
    placeholder: "Search for a country",
    allowClear: true,
  });
});

// Flatpickr for date range
flatpickr("#dateRange", {
  mode: "range",
  dateFormat: "d/m/Y",
  onChange: filterByDateRange,
  enableTime: false,
  time_24hr: false,
});

// Sort Table by date
function sortTableByDate() {
  const sortOrder = document.getElementById("sortDate").value;

  campaigns.sort((a, b) => {
    // Handle import order sorting
    if (sortOrder === "import") {
      // If both have original index, sort by that
      if (a.originalIndex !== undefined && b.originalIndex !== undefined) {
        return a.originalIndex - b.originalIndex;
      }
      // If only one has original index, prioritize it
      if (a.originalIndex !== undefined && b.originalIndex === undefined) {
        return -1; // a comes first
      }
      if (a.originalIndex === undefined && b.originalIndex !== undefined) {
        return 1; // b comes first
      }
      // If neither has original index, sort by date (newest first as fallback)
      const dateA = parseDateString(a.date);
      const dateB = parseDateString(b.date);
      return dateB - dateA;
    }

    // Handle date-based sorting
    const dateA = parseDateString(a.date);
    const dateB = parseDateString(b.date);

    // If dates are very close (within same import batch), maintain original order
    const timeDiff = Math.abs(dateA - dateB);
    if (
      timeDiff < 1000 &&
      a.originalIndex !== undefined &&
      b.originalIndex !== undefined
    ) {
      return a.originalIndex - b.originalIndex;
    }

    return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
  });

  renderTable();
  saveCampaigns();
}

// Add this new helper function to parse your date format
function parseDateString(dateStr) {
  // Parse format: "DD/MM/YYYY, HH:MM:SS"
  if (typeof dateStr !== "string") return new Date(NaN);
  const [datePart, timePart] = dateStr.split(", ");
  if (!datePart || !timePart) return new Date(NaN);
  const [day, month, year] = datePart.split("/");
  const [hours, minutes, seconds] = timePart.split(":");

  return new Date(year, month - 1, day, hours, minutes, seconds);
}

//Function for filter by date range
function filterByDateRange(selectedDates) {
  campaignDateRange = selectedDates?.length === 2 ? selectedDates : null;
  campaignPage = 1;
  renderTable();
}

function clearDateFilter() {
  // Clear the date range input
  const datePicker = document.querySelector("#dateRange");
  datePicker?._flatpickr?.clear();
  campaignDateRange = null;
  campaignPage = 1;
  renderTable();
}

document.getElementById("campaignPrevPage")?.addEventListener("click", () => { campaignPage = Math.max(1, campaignPage - 1); renderTable(); });
document.getElementById("campaignNextPage")?.addEventListener("click", () => { campaignPage += 1; renderTable(); });
document.getElementById("campaignPageSize")?.addEventListener("change", event => { campaignPageSize = Math.max(1, Number(event.target.value) || 10); campaignPage = 1; renderTable(); });

// Add this function to your existing JavaScript code for file upload
async function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const fileExtension = file.name.split(".").pop().toLowerCase();

  // Show loading notification
  showNotification("📄 Processing file...", "info");

  try {
    let data = [];

    if (fileExtension === "csv") {
      data = await parseCSVFile(file);
    } else if (fileExtension === "xlsx") {
      data = await parseXLSXFile(file);
    } else {
      throw new Error("Unsupported file format. Please use CSV or XLSX files.");
    }

    // Process the imported data
    await processImportedData(data);

    // Clear the file input
    event.target.value = "";

    showNotification(
      `✅ Successfully imported ${data.length} campaigns!`,
      "success"
    );
  } catch (error) {
    console.error("File import error:", error);
    showNotification(`❌ Import failed: ${error.message}`, "error");

    // Clear the file input on error
    event.target.value = "";
  }
}

// Parse CSV file
function parseCSVFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = function (e) {
      try {
        const text = e.target.result;
        const lines = text.split("\n");
        const headers = lines[0]
          .split(",")
          .map((h) => h.trim().replace(/"/g, ""));

        // Find column indices (case-insensitive)
        const urlIndex = headers.findIndex(
          (h) =>
            h.toLowerCase().includes("url") ||
            h.toLowerCase().includes("link") ||
            h.toLowerCase().includes("campaign")
        );

        const tagsIndex = headers.findIndex(
          (h) =>
            h.toLowerCase().includes("tag") ||
            h.toLowerCase().includes("note") ||
            h.toLowerCase().includes("description")
        );

        const countryIndex = headers.findIndex(
          (h) =>
            h.toLowerCase().includes("country") ||
            h.toLowerCase().includes("location") ||
            h.toLowerCase().includes("region") ||
            h.toLowerCase().includes("geo")
        );

        const uaTypeIndex = headers.findIndex(
          (h) =>
            h.toLowerCase().includes("ua-type") ||
            h.toLowerCase().includes("user-agent") ||
            h.toLowerCase().includes("ua")
        );

        if (urlIndex === -1) {
          throw new Error(
            'No URL column found. Please ensure your CSV has a column with "URL", "Link", or "Campaign" in the header.'
          );
        }

        const data = [];

        // Process data rows (skip header)
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue; // Skip empty lines

          // Simple CSV parsing (handles quoted values)
          const values = parseCSVLine(line);

          if (values.length > urlIndex && values[urlIndex]) {
            const url = values[urlIndex].trim();
            const tags =
              tagsIndex !== -1 && values[tagsIndex]
                ? values[tagsIndex].trim()
                : "";
            const country = 
              countryIndex !== -1 && values[countryIndex]
              ? values[countryIndex].trim()
              : "US";
            const uaType =
              uaTypeIndex !== -1 && values[uaTypeIndex]
                ? values[uaTypeIndex].trim()
                : "random";

            if (isValidURL(url)) {
              data.push({ url, tags, country, uaType });
            }
          }
        }

        resolve(data);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error("Failed to read CSV file"));
    reader.readAsText(file);
  });
}

// Parse XLSX file
function parseXLSXFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = function (e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });

        // Get the first worksheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length === 0) {
          throw new Error("The Excel file appears to be empty.");
        }

        const headers = jsonData[0].map((h) =>
          String(h || "")
            .trim()
            .toLowerCase()
        );

        // Find column indices
        const urlIndex = headers.findIndex(
          (h) =>
            h.includes("url") || h.includes("link") || h.includes("campaign")
        );

        const tagsIndex = headers.findIndex(
          (h) =>
            h.includes("tag") || h.includes("note") || h.includes("description")
        );

        const countryIndex = headers.findIndex(
          (h) =>
            h.includes("country") || h.includes("location") || h.includes("region") || h.includes("geo")
        );
        const uaTypeIndex = headers.findIndex(
          (h) =>
            h.includes("ua-type") || h.includes("user-agent") || h.includes("uaType")
        );

        if (urlIndex === -1) {
          throw new Error(
            'No URL column found. Please ensure your Excel file has a column with "URL", "Link", or "Campaign" in the header.'
          );
        }

        const processedData = [];

        // Process data rows (skip header)
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0) continue; // Skip empty rows

          const url = String(row[urlIndex] || "").trim();
          const tags =
            tagsIndex !== -1 && row[tagsIndex]
              ? String(row[tagsIndex]).trim()
              : "";

          const country = 
            countryIndex !== -1 && row[countryIndex]
            ? String(row[countryIndex]).trim()
            : "US";

          const uaType =
            uaTypeIndex !== -1 && row[uaTypeIndex]
              ? String(row[uaTypeIndex]).trim()
              : "random";

          if (url && isValidURL(url)) {
            processedData.push({ url, tags, country, uaType });
          }
        }

        resolve(processedData);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error("Failed to read Excel file"));
    reader.readAsArrayBuffer(file);
  });
}

// Simple CSV line parser that handles quoted values
function parseCSVLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current.trim().replace(/^"|"$/g, ""));
      current = "";
    } else {
      current += char;
    }
  }

  // Add the last value
  values.push(current.trim().replace(/^"|"$/g, ""));

  return values;
}

// Process imported data and resolve URLs while maintaining order and showing batches
async function processImportedData(importedData) {
  if (importedData.length === 0) {
    throw new Error("No valid URLs found in the file.");
  }

  // Show progress
  const progressNotification = document.createElement("div");
  progressNotification.style.cssText = `
        position: fixed;
        top: 70px;
        right: 40%;
        --background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
        background:rgba(99, 102, 241, 0.25);
        color: white;
        padding: 15px 25px;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(59, 130, 246, 0.3);
        z-index: 1000;
        font-weight: 600;
        min-width: 200px;
        backdrop-filter: blur(12px); /* glassmorphism effect */
        -webkit-backdrop-filter: blur(12px); /* Safari support */
        border: 1px solid rgba(255, 255, 255, 0.2);
    `;
  document.body.appendChild(progressNotification);

  try {
    // Create a map to store campaigns by their original index
    const campaignMap = new Map();
    const batchSize = 3;
    let totalProcessed = 0;

    // Process in batches but maintain order
    for (let i = 0; i < importedData.length; i += batchSize) {
      const batch = importedData.slice(i, i + batchSize);
      const batchStartIndex = i;

      // Update progress
      progressNotification.innerHTML = `📊 Processing batch ${
        Math.floor(i / batchSize) + 1
      }... (${totalProcessed}/${importedData.length} completed)`;

      // Process current batch
      const batchPromises = batch.map(async (item, batchIndex) => {
        const originalIndex = batchStartIndex + batchIndex;

        try {
          const finalUrl = await resolveFinalUrl(item.url, item.country || "US", item.uaType || "random");
          const now = new Date();

          const campaign = {
            id: Date.now() + originalIndex, // Sequential IDs
            url: item.url,
            finalUrl: finalUrl,
            tags: item.tags,
            country: item.country || "US",
            date: formatDate(now),
            originalIndex: originalIndex, // Track original position
            importBatch: Math.floor(i / batchSize), // Track which batch this belongs to
            uaType: item.uaType || "random", // Store uaType
          };

          // Store in map with original index as key
          campaignMap.set(originalIndex, campaign);
          return { success: true, originalIndex, campaign };
        } catch (error) {
          console.error(`Error processing URL ${item.url}:`, error);

          const campaign = {
            id: Date.now() + originalIndex,
            url: item.url,
            finalUrl: "Error resolving",
            tags: item.tags,
            country: item.country || "US",
            date: formatDate(new Date()),
            originalIndex: originalIndex,
            importBatch: Math.floor(i / batchSize),
            uaType: item.uaType || "random", // Store uaType
          };

          campaignMap.set(originalIndex, campaign);
          return { success: false, originalIndex, campaign };
        }
      });

      // Wait for current batch to complete
      await Promise.all(batchPromises);
      totalProcessed += batch.length;

      // Add completed campaigns to main array in original order
      const orderedCampaigns = [];
      for (let idx = 0; idx < importedData.length; idx++) {
        if (campaignMap.has(idx)) {
          orderedCampaigns.push(campaignMap.get(idx));
        }
      }

      // Add the ordered campaigns to the main campaigns array
      // Remove any previously added import campaigns and add the updated ordered list
      const existingCampaigns = campaigns.filter(
        (c) => c.originalIndex === undefined
      );
      campaigns.length = 0; // Clear array
      campaigns.push(...existingCampaigns, ...orderedCampaigns);

      // Update table and save after each batch
      renderTable();
      saveCampaigns();

      // Update progress with completed count
      progressNotification.innerHTML = `✅ Batch ${
        Math.floor(i / batchSize) + 1
      } completed! (${totalProcessed}/${importedData.length} total)`;

      // Small delay between batches
      if (i + batchSize < importedData.length) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }

    // Final update
    progressNotification.innerHTML = `🎉 All ${totalProcessed} campaigns processed successfully!`;

    // Clean up originalIndex property after import is complete
    setTimeout(() => {
      campaigns.forEach((campaign) => {
        if (campaign.importBatch !== undefined) {
          delete campaign.importBatch; // Remove only importBatch, keep originalIndex
        }
      });
      saveCampaigns();
    }, 2000);
  } finally {
    // Remove progress notification after a delay
    setTimeout(() => {
      if (progressNotification.parentNode) {
        progressNotification.remove();
      }
    }, 3000);
  }
}

// Add this function to ensure imported data maintains order even after sorting
function preserveImportOrder() {
  // Get the current sort order
  const sortOrder = document.getElementById("sortDate").value;

  // If sorting by newest, imported items should appear at top
  // If sorting by oldest, imported items should appear at bottom
  if (sortOrder === "newest") {
    campaigns.sort((a, b) => {
      const dateA = parseDateString(a.date);
      const dateB = parseDateString(b.date);

      // If dates are very close (within same import batch), maintain original order
      const timeDiff = Math.abs(dateA - dateB);
      if (
        timeDiff < 1000 &&
        a.originalIndex !== undefined &&
        b.originalIndex !== undefined
      ) {
        return a.originalIndex - b.originalIndex;
      }

      return dateB - dateA;
    });
  } else {
    campaigns.sort((a, b) => {
      const dateA = parseDateString(a.date);
      const dateB = parseDateString(b.date);

      // If dates are very close (within same import batch), maintain original order
      const timeDiff = Math.abs(dateA - dateB);
      if (
        timeDiff < 1000 &&
        a.originalIndex !== undefined &&
        b.originalIndex !== undefined
      ) {
        return a.originalIndex - b.originalIndex;
      }

      return dateA - dateB;
    });
  }
}

// Update the showNotification function to handle 'info' type
function showNotification(message, type = "success") {
  const notification = document.createElement("div");

  let bgColor;
  switch (type) {
    case "success":
      bgColor = "linear-gradient(135deg, #10b981 0%, #059669 100%)";
      break;
    case "error":
      bgColor = "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)";
      break;
    case "info":
      bgColor = "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)";
      break;
    default:
      bgColor = "linear-gradient(135deg, #6b7280 0%, #4b5563 100%)";
  }

  notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 40%;
        background: ${bgColor};
        color: white;
        padding: 15px 25px;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        z-index: 1000;
        font-weight: 600;
        animation: fadeInUp 0.3s ease-out;
        max-width: 300px;
      `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 4000);
}

//Network Connectio toast js
function showNetworkToast(message, type) {
  const toast = document.getElementById('network-toast');
  toast.textContent = message;
  toast.className = `network-toast ${type}`;
  toast.classList.remove('hidden');

  // Auto-hide for online state
  if (type === 'online') {
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 3000);
  }
}

// Initial check
if (!navigator.onLine) {
  showNetworkToast("You're offline. Check your connection.", 'offline');
}

// Listen for changes
window.addEventListener('offline', () => {
  showNetworkToast("You're offline. Check your connection.", 'offline');
});

window.addEventListener('online', () => {
  showNetworkToast("You're back online 🎉", 'online');
});

// Show this toast message just after adding a single campaign
let activeLoadingToast = null;

function showLoadingToast(toastMessage = "Loading...") {
  if (activeLoadingToast) activeLoadingToast.remove();

  const toast = document.createElement("div");
  toast.className = 'operation-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  const spinner = document.createElement('span');
  spinner.className = 'operation-toast__spinner';
  spinner.setAttribute('aria-hidden', 'true');

  const message = document.createElement('span');
  message.textContent = toastMessage;
  toast.append(spinner, message);
  document.body.appendChild(toast);
  activeLoadingToast = toast;
}

// Remove it manually when done
function removeLoadingToast() {
  if (activeLoadingToast) {
    activeLoadingToast.remove();
    activeLoadingToast = null;
  }
}