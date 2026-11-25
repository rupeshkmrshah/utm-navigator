let results = [];
let userRole = '';
let fp; // flatpickr instance
let hiddenResults = JSON.parse(localStorage.getItem('hiddenResults') || '[]');
let showAll = false; // Flag for showing all
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function isUsableResolvedUrl(value) {
  if (typeof value !== 'string' || !value.trim() || /^(about:blank|chrome-error:\/\/)/i.test(value.trim())) return false;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

// Function to convert UTC to IST
function toIST(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
}

function parseRedirectChain(value, fallbackUrl = '') {
  let chain = value;
  if (typeof chain === 'string') {
    try { chain = JSON.parse(chain); } catch { chain = []; }
  }
  if (!Array.isArray(chain)) chain = [];
  chain = chain.filter(url => typeof url === 'string' && /^https?:\/\//i.test(url));
  if (!chain.length && isUsableResolvedUrl(fallbackUrl)) chain.push(fallbackUrl);
  return chain;
}

function renderScheduledRedirectChain(value, finalUrl = '') {
  const chain = parseRedirectChain(value, finalUrl);
  if (!chain.length) return '<span class="muted">No chain captured</span>';
  const redirects = Math.max(0, chain.length - 1);
  return `<details class="redirect-chain"><summary>${redirects} redirect${redirects === 1 ? '' : 's'} · ${chain.length} URL${chain.length === 1 ? '' : 's'}</summary><ol>${chain.map(url => `<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a></li>`).join('')}</ol></details>`;
}

function getProxyCountryMatchState(result) {
  const value = result.region_match;
  if (value === 1 || value === true || value === '1' || result.verification_status === 'match') return 'matched';
  if (value === 0 || value === false || value === '0' || result.verification_status === 'mismatch') return 'mismatch';
  return 'unavailable';
}

function renderProxyCountryCheck(result) {
  const requested = escapeHtml(String(result.country || '').toUpperCase() || '—');
  const actual = escapeHtml(String(result.actual_country || '').toUpperCase());
  const state = getProxyCountryMatchState(result);
  const label = state === 'matched' ? '✓ MATCHED' : state === 'mismatch' ? '⚠ MISMATCH' : '? UNAVAILABLE';
  const actualLabel = actual ? `${actual}${result.actual_country_name ? ` · ${escapeHtml(result.actual_country_name)}` : ''}` : (result.actual_country_name ? escapeHtml(result.actual_country_name) : 'Unavailable');
  const detail = `Requested ${requested} · Actual ${actualLabel}${result.proxy_ip ? ` · IP ${escapeHtml(result.proxy_ip)}` : ''}`;
  const title = result.verification_error ? `${detail} · ${escapeHtml(result.verification_error)}` : detail;
  const reason = state === 'unavailable' && result.verification_error ? `<small class="proxy-country-check__reason">${escapeHtml(result.verification_error)}</small>` : '';
  return `<div class="proxy-country-check" title="${title}"><span class="proxy-country-check__badge proxy-country-check__badge--${state}">${label}</span><small>${detail}</small>${reason}</div>`;
}

// Pagination functionality
let currentPage = 1;
function getPageSize(){
  const el = document.getElementById('pageSizeInput');
  const val = el ? parseInt(el.value, 10) : NaN;
  return isNaN(val) || val <= 0 ? 25 : val;
}

async function loadResults() {
  try {
    const res = await fetch('/api/scheduled-results', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch results');
    results = (await res.json()).map(result => {
      if (result.status === 'resolved' && !isUsableResolvedUrl(result.final_url)) {
        return { ...result, final_url: null, status: 'failed', error_message: result.error_message || 'Browser returned an invalid final destination.' };
      }
      if (!isUsableResolvedUrl(result.final_url)) return { ...result, final_url: null };
      return result;
    });
    console.log('Results data:', results);
    renderTable();
  } catch (error) {
    console.error('Error loading results:', error);
    document.getElementById('tableBody').innerHTML = `<tr><td colspan="${userRole === 'Admin' ? '12' : '11'}">Error loading results.</td></tr>`;
  }
}

function renderTable() {
  const tableBody = document.getElementById('tableBody');
  let filteredResults = [...results];
  
  // Filter hidden if not showAll
  if (!showAll) {
    filteredResults = filteredResults.filter(r => !hiddenResults.includes(r.id));
  }
  
  // Apply other filters (search, date, sort)
  filteredResults = filterAndSortResults(filteredResults);

  if (!Array.isArray(filteredResults) || filteredResults.length === 0) {
    const colspan = (userRole === 'Admin') ? 12 : 11;
    tableBody.innerHTML = `<tr>
      <td colspan="${colspan}" style="text-align:center; padding:16px; color:#666;">
        No scheduled results to display.
      </td>
    </tr>`;
    return;
  }

  const pageSize = getPageSize();
  const totalPages = Math.max(1, Math.ceil(filteredResults.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const pageItems = filteredResults.slice(start, end);

  tableBody.innerHTML = pageItems.map(result => `
    <tr data-result-id="${result.id}">
      <td class="admin-only">${escapeHtml(result.username)}</td>
      <td>${toIST(result.resolved_at)}</td>
      <td>${escapeHtml(result.original_url)}</td>
      <td>${result.final_url === 'Loading...' ? '<span class="status-badge status-loading"><span class="loading-spinner"></span>Loading...</span>' : (isUsableResolvedUrl(result.final_url) ? escapeHtml(result.final_url) : '<span class="muted">Not resolved</span>')}</td>
      <td>${renderScheduledRedirectChain(result.redirect_chain, result.final_url)}</td>
      <td>${result.status === 'resolved' ? '—' : escapeHtml(result.error_message || 'Resolution failed')}</td>
      <td>
        <select class="country-input" data-result-id="${result.id}">
          <option value="US" ${result.country === 'US' ? 'selected' : ''}>🇺🇸 US</option>
          <option value="CA" ${result.country === 'CA' ? 'selected' : ''}>🇨🇦 CA</option>
          <option value="GB" ${result.country === 'GB' ? 'selected' : ''}>🇬🇧 GB</option>
          <option value="IN" ${result.country === 'IN' ? 'selected' : ''}>🇮🇳 IN</option>
          <option value="AU" ${result.country === 'AU' ? 'selected' : ''}>🇦🇺 AU</option>
          <option value="DE" ${result.country === 'DE' ? 'selected' : ''}>🇩🇪 DE</option>
          <option value="FR" ${result.country === 'FR' ? 'selected' : ''}>🇫🇷 FR</option>
          <option value="JP" ${result.country === 'JP' ? 'selected' : ''}>🇯🇵 JP</option>
          <option value="SG" ${result.country === 'SG' ? 'selected' : ''}>🇸🇬 SG</option>
          <option value="BR" ${result.country === 'BR' ? 'selected' : ''}>🇧🇷 BR</option>
          <option value="TW" ${result.country === 'TW' ? 'selected' : ''}>🇹🇼 TW</option>
          <option value="CZ" ${result.country === 'CZ' ? 'selected' : ''}>🇨🇿 CZ</option>
          <option value="UA" ${result.country === 'UA' ? 'selected' : ''}>🇺🇦 UA</option>
          <option value="AE" ${result.country === 'AE' ? 'selected' : ''}>🇦🇪 AE</option>
          <option value="PL" ${result.country === 'PL' ? 'selected' : ''}>🇵🇱 PL</option>
          <option value="ES" ${result.country === 'ES' ? 'selected' : ''}>🇪🇸 ES</option>
          <option value="ID" ${result.country === 'ID' ? 'selected' : ''}>🇮🇩 ID</option>
          <option value="ZA" ${result.country === 'ZA' ? 'selected' : ''}>🇿🇦 ZA</option>
          <option value="MX" ${result.country === 'MX' ? 'selected' : ''}>🇲🇽 MX</option>
          <option value="MY" ${result.country === 'MY' ? 'selected' : ''}>🇲🇾 MY</option>
          <option value="IT" ${result.country === 'IT' ? 'selected' : ''}>🇮🇹 IT</option>
          <option value="TH" ${result.country === 'TH' ? 'selected' : ''}>🇹🇭 TH</option>
          <option value="NL" ${result.country === 'NL' ? 'selected' : ''}>🇳🇱 NL</option>
          <option value="AR" ${result.country === 'AR' ? 'selected' : ''}>🇦🇷 AR</option>
          <option value="BY" ${result.country === 'BY' ? 'selected' : ''}>🇧🇾 BY</option>
          <option value="RU" ${result.country === 'RU' ? 'selected' : ''}>🇷🇺 RU</option>
          <option value="IE" ${result.country === 'IE' ? 'selected' : ''}>🇮🇪 IE</option>
          <option value="HK" ${result.country === 'HK' ? 'selected' : ''}>🇭🇰 HK</option>
          <option value="KZ" ${result.country === 'KZ' ? 'selected' : ''}>🇰🇿 KZ</option>
          <option value="NZ" ${result.country === 'NZ' ? 'selected' : ''}>🇳🇿 NZ</option>
          <option value="TR" ${result.country === 'TR' ? 'selected' : ''}>🇹🇷 TR</option>
          <option value="DK" ${result.country === 'DK' ? 'selected' : ''}>🇩🇰 DK</option>
          <option value="GR" ${result.country === 'GR' ? 'selected' : ''}>🇬🇷 GR</option>
          <option value="NO" ${result.country === 'NO' ? 'selected' : ''}>🇳🇴 NO</option>
          <option value="AT" ${result.country === 'AT' ? 'selected' : ''}>🇦🇹 AT</option>
          <option value="IS" ${result.country === 'IS' ? 'selected' : ''}>🇮🇸 IS</option>
          <option value="SE" ${result.country === 'SE' ? 'selected' : ''}>🇸🇪 SE</option>
          <option value="PT" ${result.country === 'PT' ? 'selected' : ''}>🇵🇹 PT</option>
          <option value="CH" ${result.country === 'CH' ? 'selected' : ''}>🇨🇭 CH</option>
          <option value="BE" ${result.country === 'BE' ? 'selected' : ''}>🇧🇪 BE</option>
          <option value="PH" ${result.country === 'PH' ? 'selected' : ''}>🇵🇭 PH</option>
          <option value="IL" ${result.country === 'IL' ? 'selected' : ''}>🇮🇱 IL</option>
          <option value="MD" ${result.country === 'MD' ? 'selected' : ''}>🇲🇩 MD</option>
          <option value="RO" ${result.country === 'RO' ? 'selected' : ''}>🇷🇴 RO</option>
          <option value="CL" ${result.country === 'CL' ? 'selected' : ''}>🇨🇱 CL</option>
          <option value="SA" ${result.country === 'SA' ? 'selected' : ''}>🇸🇦 SA</option>
          <option value="LI" ${result.country === 'LI' ? 'selected' : ''}>🇱🇮 LI</option>
          <option value="FI" ${result.country === 'FI' ? 'selected' : ''}>🇫🇮 FI</option>
          <option value="KW" ${result.country === 'KW' ? 'selected' : ''}>🇰🇼 KW</option>
          <option value="EE" ${result.country === 'EE' ? 'selected' : ''}>🇪🇪 EE</option>
          <option value="HU" ${result.country === 'HU' ? 'selected' : ''}>🇭🇺 HU</option>
          <option value="PE" ${result.country === 'PE' ? 'selected' : ''}>🇵🇪 PE</option>
          <option value="EG" ${result.country === 'EG' ? 'selected' : ''}>🇪🇬 EG</option>
          <option value="KR" ${result.country === 'KR' ? 'selected' : ''}>🇰🇷 KR</option>
          <option value="KH" ${result.country === 'KH' ? 'selected' : ''}>🇰🇭 KH</option>
          <option value="CO" ${result.country === 'CO' ? 'selected' : ''}>🇨🇴 CO</option>
          <option value="OM" ${result.country === 'OM' ? 'selected' : ''}>🇴🇲 OM</option>
          <option value="LK" ${result.country === 'LK' ? 'selected' : ''}>🇱🇰 LK</option>
          <option value="KE" ${result.country === 'KE' ? 'selected' : ''}>🇰🇪 KE</option>
          <option value="HR" ${result.country === 'HR' ? 'selected' : ''}>🇵🇦 HR</option>
          <option value="SK" ${result.country === 'SK' ? 'selected' : ''}>🇸🇰 SK</option>
          <option value="VN" ${result.country === 'VN' ? 'selected' : ''}>🇻🇳 VN</option>
          <!-- Add all other countries as needed -->
        </select>
      </td>
      <td>${renderProxyCountryCheck(result)}</td>
      <td class="editable-result-notes" contenteditable="${result.status !== 'cancelled'}" data-result-id="${result.id}" title="Click to edit notes">${escapeHtml(result.notes || '')}</td>
      <td>${escapeHtml(result.uaType || 'uAType Not Found')}</td>
      <td><span class="status status-${escapeHtml(result.status)}">${escapeHtml(result.status)}</span></td>
      <td>
        <button class="refresh-button" data-result-id="${result.id}">Refresh URL</button>
        <button class="copy-final-button" data-result-id="${result.id}" style="margin-top:6px;">Copy URL</button>
        <button class="delete-result-button" data-result-id="${result.id}" style="margin-top:6px;">Delete</button>
      </td>
    </tr>
  `).join('');

  // Update pager UI
  const pageInfo = document.getElementById('pageInfo');
  if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');
  if (prevBtn) prevBtn.disabled = currentPage === 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

function filterAndSortResults(filteredResults) {
  const searchInput = document.getElementById('searchInput');
  const sortSelect = document.getElementById('sortDate');

  let filtered = [...filteredResults]; // Use the passed filteredResults
  const selectedDates = fp.selectedDates;

  // Date range filter
  if (selectedDates.length === 2) {
    const [start, end] = selectedDates;
    end.setHours(23, 59, 59, 999); // Make sure the end date is inclusive
    filtered = filtered.filter(r => {
      const resolvedDate = new Date(r.resolved_at);
      return resolvedDate >= start && resolvedDate <= end;
    });
  }

  // Search filter
  const searchTerm = searchInput.value.toLowerCase();
  if (searchTerm) {
    filtered = filtered.filter(r => 
      Object.values(r).some(val => 
        String(val).toLowerCase().includes(searchTerm)
      )
    );
  }

  // Sort
  const sortOrder = sortSelect.value;
  filtered.sort((a, b) => {
    if (sortOrder === 'oldest') {
      return a.id - b.id;
    }
    const dateA = new Date(a.resolved_at);
    const dateB = new Date(b.resolved_at);
    return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
  });

  return filtered;
}

async function refreshResult(resultId) {
  const result = results.find(r => r.id === Number(resultId));
  if (!result) return;

  const originalFinalUrl = result.final_url;
  result.final_url = 'Loading...';
  renderTable();

  try {
    const resolution = await resolveFinalUrlDetails(result.original_url, result.country, result.uaType);
    const finalUrl = resolution.finalUrl;
    result.redirect_chain = resolution.redirectChain || [];
    result.actual_country = resolution.actualCountry || null;
    result.actual_country_name = resolution.actualCountryName || null;
    result.proxy_ip = resolution.ip || null;
    result.region_match = resolution.regionMatch;
    result.verification_status = resolution.verificationStatus;
    result.verification_error = resolution.verificationError;
    if (isUsableResolvedUrl(finalUrl) && !resolution.resolutionFailed) {
      result.final_url = finalUrl;
      result.resolved_at = new Date().toISOString();
      result.status = 'resolved';

      // Update result in the database
      await fetch(`/api/scheduled-results/${resultId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ finalUrl: result.final_url, redirectChain: result.redirect_chain, status: result.status, country: result.country, uaType: result.uaType, notes: result.notes, actualCountry: result.actual_country, actualCountryName: result.actual_country_name, proxyIp: result.proxy_ip, regionMatch: result.region_match, verificationStatus: result.verification_status, verificationError: result.verification_error })
      });

    } else {
      result.final_url = null;
      result.status = 'failed';
      result.error_message = resolution.verificationError || 'Country verification failed.';
      await fetch(`/api/scheduled-results/${resultId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finalUrl: null, redirectChain: result.redirect_chain, status: 'failed', errorMessage: result.error_message, country: result.country, uaType: result.uaType, notes: result.notes, actualCountry: result.actual_country, actualCountryName: result.actual_country_name, proxyIp: result.proxy_ip, regionMatch: result.region_match, verificationStatus: result.verification_status, verificationError: result.verification_error })
      });
    }
  } catch (error) {
    console.error('Refresh failed:', error);
    result.final_url = null;
    result.status = 'failed';
    result.error_message = error.message || 'URL refresh failed.';
    await fetch(`/api/scheduled-results/${resultId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ finalUrl: null, status: 'failed', errorMessage: result.error_message, country: result.country, uaType: result.uaType, notes: result.notes }) }).catch(() => {});
  }

  renderTable();
}

async function resolveFinalUrlDetails(inputUrl, region = "US", uaType = "random") {
    const fallback = "Resolution failed";
    try {
      const params = new URLSearchParams({
        url: inputUrl,
        region: region || 'US',
        uaType: uaType || 'random'
      });
      const requestUrl = `/resolve?${params.toString()}`;
      const response = await fetch(requestUrl, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const reason = payload.details || payload.error || `Server responded with ${response.status}`;
        return { finalUrl: isUsableResolvedUrl(payload.finalUrl) ? payload.finalUrl : `${fallback}: ${reason}`, redirectChain: payload.redirectChain || [], actualCountry: payload.actualRegion || payload.ipData?.country_code?.toUpperCase() || null, actualCountryName: payload.ipData?.country || null, ip: payload.ipData?.ip || null, regionMatch: payload.regionMatch ?? null, verificationStatus: payload.countryVerificationStatus || 'unavailable', verificationError: payload.countryVerificationError || reason, resolutionFailed: true };
      }
      const data = await response.json();
      return isUsableResolvedUrl(data.finalUrl) ? { finalUrl: data.finalUrl, redirectChain: data.redirectChain || [], actualCountry: data.actualRegion || data.ipData?.country_code?.toUpperCase() || null, actualCountryName: data.ipData?.country || null, ip: data.ipData?.ip || null, regionMatch: data.regionMatch ?? null, verificationStatus: data.countryVerificationStatus || 'unavailable', verificationError: data.countryVerificationError || null, resolutionFailed: false } : { finalUrl: fallback, redirectChain: [], resolutionFailed: true };
      
    } catch (err) {
      console.error("Error resolving URL:", err.message);
      return { finalUrl: `${fallback}: ${err.message}`, redirectChain: [], resolutionFailed: true, verificationError: err.message };
    }
}

function exportCSV() {
  const filteredResults = filterAndSortResults(showAll ? results : results.filter(r => !hiddenResults.includes(r.id))); // Use filtered and sorted data

  const headers = ["Resolved At (IST)", "Original URL", "Final URL", "Redirect Chain", "Failure Reason", "Country", "Actual Country", "Proxy IP", "Country Match", "Verification Status", "Verification Error", "Notes", "UA Type", "Status"];
  if (userRole === 'Admin') {
    headers.unshift("Scheduled Job by");
  }

  let csv = headers.join(',') + '\n';

  filteredResults.forEach((r) => {
    const row = [
      toIST(r.resolved_at),
      r.original_url,
      r.final_url || '',
      parseRedirectChain(r.redirect_chain, r.final_url).join(' -> '),
      r.error_message || '',
      r.country || '',
      r.actual_country || '',
      r.proxy_ip || '',
      getProxyCountryMatchState(r),
      r.verification_status || 'unavailable',
      r.verification_error || '',
      r.notes || '',
      r.uaType || '',
      r.status
    ];
    if (userRole === 'Admin') {
      row.unshift(r.username);
    }
    csv += row.map(val => `"${String(val ?? '').replace(/"/g, '""')}"`).join(',') + '\n';
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, "0");
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filename = `scheduled-results-${timestamp}.csv`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportXLSX() {
  const filteredResults = filterAndSortResults(showAll ? results : results.filter(r => !hiddenResults.includes(r.id))); // Use filtered and sorted data

  const dataForSheet = filteredResults.map(r => {
    const row = {};
    if (userRole === 'Admin') {
      row["Scheduled Job by"] = r.username;
    }
    row["Resolved At (IST)"] = toIST(r.resolved_at);
    row["Original URL"] = r.original_url;
    row["Final URL"] = r.final_url || '';
    row["Redirect Chain"] = parseRedirectChain(r.redirect_chain, r.final_url).join(' -> ');
    row["Failure Reason"] = r.error_message || '';
    row["Country"] = r.country || '';
    row["Actual Country"] = r.actual_country || '';
    row["Proxy IP"] = r.proxy_ip || '';
    row["Country Match"] = getProxyCountryMatchState(r);
    row["Verification Status"] = r.verification_status || 'unavailable';
    row["Verification Error"] = r.verification_error || '';
    row["Notes"] = r.notes || '';
    row["UA Type"] = r.uaType || '';
    row["Status"] = r.status;
    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(dataForSheet);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Scheduled Results");

  const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/octet-stream" });

  const now = new Date();
  const pad = (n) => n.toString().padStart(2, "0");
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filename = `scheduled-results-${timestamp}.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', async () => {
  const searchInput = document.getElementById('searchInput');
  const dateRangePicker = document.getElementById('dateRange');
  const sortSelect = document.getElementById('sortDate');
  const exportButton = document.getElementById('exportButton');
  const clearDateFilterButton = document.querySelector('.clear-date-btn');
  const tableBody = document.getElementById('tableBody');

  try {
    const res = await fetch('/api/auth/me');
    const { user } = await res.json();
    userRole = user.role;
    if (userRole === 'Admin') {
      document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = 'table-cell';
        console.log('scheduled-results.js: admin-only element style set to table-cell');
      });
    }
  } catch (e) {
    console.error('Could not fetch user role', e);
  }

  // Hide All Event Listener
  const hideAllButton = document.getElementById('hideAllButton');
  hideAllButton.addEventListener('click', hideAllResults);

  // Event Listeners
  searchInput.addEventListener('keyup', renderTable);
  sortSelect.addEventListener('change', renderTable);
  exportButton.addEventListener('click', handleExport);
  clearDateFilterButton.addEventListener('click', clearDateFilter);

  // Flatpickr for date range
  fp = flatpickr(dateRangePicker, {
    mode: "range",
    dateFormat: "Y-m-d",
    onChange: function(selectedDates) {
      currentPage = 1;
      renderTable();
    }
  });

  // Event delegation for dynamically added elements
  tableBody.addEventListener('click', (event) => {
    if (event.target.classList.contains('refresh-button')) {
      const resultId = event.target.dataset.resultId;
      refreshResult(resultId);
    }
  });

  // Event delegation to copy the final url 
  tableBody.addEventListener('click', async (event) => {
    if (event.target.classList.contains('copy-final-button')) {
      const resultId = event.target.dataset.resultId;
      copyFinalUrl(resultId);
    }
  });

  tableBody.addEventListener('click', async (event) => {
    const button = event.target.closest('.delete-result-button');
    if (!button) return;
    const resultId = Number(button.dataset.resultId);
    if (!await window.showConfirmModal({ title: 'Delete this resolution result?', message: 'This saved result will be permanently removed.', confirmText: 'Delete result' })) return;
    const response = await fetch(`/api/scheduled-results/${resultId}`, { method: 'DELETE' });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert(data.error || 'Could not delete result.');
      return;
    }
    results = results.filter(result => Number(result.id) !== resultId);
    renderTable();
  });

  tableBody.addEventListener('change', (event) => {
    if (event.target.classList.contains('country-input')) {
      const resultId = event.target.dataset.resultId;
      const newCountry = event.target.value;
      updateCountry(resultId, newCountry);
    }
  });

  tableBody.addEventListener('focusout', async (event) => {
    const cell = event.target.closest('.editable-result-notes');
    if (!cell) return;
    const result = results.find(item => Number(item.id) === Number(cell.dataset.resultId));
    if (!result) return;
    const notes = cell.textContent.trim();
    if (notes === String(result.notes || '').trim()) return;
    const response = await fetch(`/api/scheduled-results/${result.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ finalUrl: result.final_url, status: result.status, errorMessage: result.error_message, country: result.country, uaType: result.uaType, notes }) });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      alert(payload.error || 'Could not save notes.');
      cell.textContent = result.notes || '';
      return;
    }
    result.notes = notes;
  });

  async function hideAllResults() {
    const confirmed = await window.showConfirmModal({ title: 'Hide all visible results?', message: "These results will be hidden from this view. You can restore them later with 'Show All'.", confirmText: 'Hide results', tone: 'primary' });
    if (!confirmed) return;
  
    const visibleResults = showAll ? results : results.filter(r => !hiddenResults.includes(r.id));
    visibleResults.forEach(r => {
      if (!hiddenResults.includes(r.id)) hiddenResults.push(r.id);
    });
    localStorage.setItem('hiddenResults', JSON.stringify(hiddenResults));
    
    showAll = false; // Reset to hide mode after hiding
    renderTable();
  }  

  // Initial load
  loadResults();
});

function updateCountry(resultId, newCountry) {
  const result = results.find(r => r.id === resultId);
  if (result) {
    result.country = newCountry;
    refreshResult(resultId);
  }
}

function handleExport() {
  const exportFormat = document.getElementById('exportFormat').value;
  if (exportFormat === 'csv') {
    exportCSV();
  } else if (exportFormat === 'xlsx') {
    exportXLSX();
  }
}

function clearDateFilter() {
  fp.clear();
  renderTable();
}

// Copy final url button function
function copyFinalUrl(resultId) {
  const r = results.find(x => x.id === Number(resultId));
  const value = r?.final_url?.toString().trim();

  if (!value || value === 'Loading...' || value === 'Error resolving') {
    alert('No valid final URL to copy.');
    return;
  }

  // Use Clipboard API with simple fallback
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(value)
      .then(() => alert('Final URL copied!'))
      .catch(() => fallbackCopy(value));
  } else {
    fallbackCopy(value);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); alert('Final URL copied!'); }
  catch { alert('Failed to copy.'); }
  finally { document.body.removeChild(ta); }
}

// Pagination functionality
const prevBtn = document.getElementById('prevPage');
if (prevBtn) prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderTable(); } });
const nextBtn = document.getElementById('nextPage');
if (nextBtn) nextBtn.addEventListener('click', () => { currentPage++; renderTable(); });
const psi = document.getElementById('pageSizeInput');
if (psi) psi.addEventListener('change', () => { currentPage = 1; renderTable(); });

// Show All Button Listener (outside DOMContentLoaded for global scope)
const showAllButton = document.getElementById('showAllButton');
if (showAllButton) {
  showAllButton.addEventListener('click', () => {
    showAll = true;
    renderTable();
  });
}