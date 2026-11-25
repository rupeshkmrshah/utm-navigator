fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" })
  .then((r) => r.json())
  .then((d) => {
    if (!d?.user) location.replace("/login");
  })
  .catch(() => location.replace("/login"));
(() => {
  const rows = document.getElementById("importHistoryRows");
  const errorBox = document.getElementById("importHistoryError");
  const pageSize = 25;
  let offset = 0;
  let knownCount = 0;
  let refreshTimer = null;
  let loading = false;
  const active = ["queued", "processing", "paused"];
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const date = (value) =>
    value
      ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
      : "—";
  function removeImportedCampaignCache(batchId) {
    try {
      const saved = JSON.parse(localStorage.getItem("campaigns") || "[]");
      if (!Array.isArray(saved)) return;
      localStorage.setItem(
        "campaigns",
        JSON.stringify(
          saved.filter((c) => Number(c.importBatchId) !== Number(batchId)),
        ),
      );
    } catch (e) {
      console.warn(
        "Could not synchronize deleted import with Campaigns cache:",
        e.message,
      );
    }
  }
  async function request(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, {
        credentials: "same-origin",
        cache: "no-store",
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error || `Request failed (${response.status})`);
      return data;
    } catch (e) {
      if (e.name === "AbortError")
        throw new Error(
          "The history request timed out. Check that the server and database are running, then retry.",
        );
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }
  async function load(showIndicator = false) {
    if (loading) return;
    loading = true;
    const indicator = document.getElementById("importRefreshIndicator");
    if (showIndicator && indicator) indicator.hidden = false;
    errorBox.hidden = true;
    try {
      let batches = await request(
        `/api/campaign-imports?limit=${pageSize}&offset=${offset}`,
      );
      knownCount = batches.length;
      if (!batches.length && offset > 0) {
        offset = Math.max(0, offset - pageSize);
        batches = await request(
          `/api/campaign-imports?limit=${pageSize}&offset=${offset}`,
        );
        knownCount = batches.length;
      }
      rows.innerHTML = batches.length
        ? batches
            .map((b) => {
              const count = Number(b.processed_urls || 0),
                total = Number(b.total_urls || 0),
                status = String(b.status || "").replaceAll("_", " ");
              let actions = "";
              if (["queued", "processing"].includes(b.status))
                actions += `<button data-action="pause" data-id="${b.id}">Pause</button>`;
              if (b.status === "paused")
                actions += `<button data-action="resume" data-id="${b.id}">Resume</button>`;
              if (active.includes(b.status))
                actions += `<button class="danger" data-action="cancel" data-id="${b.id}">Cancel</button>`;
              actions += `<button data-action="details" data-id="${b.id}">Details / export</button>`;
              if (!active.includes(b.status))
                actions += `<button class="danger" data-action="delete" data-id="${b.id}">Delete</button>`;
              return `<tr data-import-row><td>${esc(b.file_name)}</td><td>${esc(status)}</td><td>${count} / ${total} · ${Number(b.resolved_urls || 0)} resolved · ${Number(b.failed_urls || 0)} failed</td><td>${date(b.started_at || b.created_at)}</td><td>${date(b.completed_at)}</td><td><div class="import-history__actions">${actions}</div></td></tr><tr id="details-${b.id}" hidden><td colspan="6"><div class="import-details"></div></td></tr>`;
            })
            .join("")
        : '<tr><td colspan="6" class="import-history__empty">No campaign imports yet.</td></tr>';
      document.getElementById("importHistoryPage").textContent =
        `Page ${Math.floor(offset / pageSize) + 1}`;
      document.getElementById("importPrevious").disabled = offset === 0;
      document.getElementById("importNext").disabled = knownCount < pageSize;
    } catch (e) {
      if (!rows.querySelector("tr[data-import-row]"))
        rows.innerHTML =
          '<tr><td colspan="6" class="import-history__empty">Import history could not be loaded.</td></tr>';
      errorBox.textContent = e.message;
      errorBox.hidden = false;
    } finally {
      loading = false;
      if (indicator) indicator.hidden = true;
    }
  }
  rows.addEventListener("click", async (e) => {
    const button = e.target.closest("button[data-action]");
    if (!button) return;
    const id = button.dataset.id,
      action = button.dataset.action;
    try {
      if (action === "details") {
        const row = document.getElementById(`details-${id}`);
        if (!row.hidden) {
          row.hidden = true;
          return;
        }
        const batch = await request(`/api/campaign-imports/${id}`);
        const holder = row.querySelector(".import-details");
        holder.innerHTML = `<table><thead><tr><th>Input URL</th><th>Final URL</th><th>Status / reason</th><th>Redirect chain</th></tr></thead><tbody>${(batch.items || []).map((i) => `<tr><td>${esc(i.original_url)}</td><td>${esc(i.final_url || "—")}</td><td>${esc(i.status)}${i.failure_reason ? ` · ${esc(i.failure_reason)}` : ""}</td><td>${(Array.isArray(i.redirect_chain) ? i.redirect_chain : []).map(esc).join(" → ") || "—"}</td></tr>`).join("")}</tbody></table><button type="button" data-export="${id}">Export CSV</button>`;
        row.hidden = false;
        return;
      }
      const confirmations = {
        pause: {
          title: "Pause this import?",
          message:
            "Any URL already resolving may finish; remaining URLs will wait until you resume.",
          confirmText: "Pause import",
          tone: "primary",
        },
        cancel: {
          title: "Cancel this import?",
          message:
            "Unfinished URLs will be marked cancelled and will not be resolved.",
          confirmText: "Cancel import",
        },
        delete: {
          title: "Delete this import history?",
          message:
            "This removes the import record, its URL details, and its imported rows from Campaigns.",
          confirmText: "Delete history",
        },
      };
      if (
        confirmations[action] &&
        !(await window.showConfirmModal(confirmations[action]))
      )
        return;
      if (["pause", "resume", "cancel"].includes(action))
        await request(`/api/campaign-imports/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ action }),
        });
      if (action === "delete") {
        await request(`/api/campaign-imports/${id}`, { method: "DELETE" });
        removeImportedCampaignCache(id);
      }
      await load();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
    }
  });
  rows.addEventListener("click", async (e) => {
    const button = e.target.closest("[data-export]");
    if (!button) return;
    try {
      const b = await request(`/api/campaign-imports/${button.dataset.export}`);
      const lines = [
        [
          "Input URL",
          "Final URL",
          "Status",
          "Failure Reason",
          "Requested Country",
          "Actual Country",
          "IP",
          "Redirect Chain",
        ],
        ...(b.items || []).map((i) => [
          i.original_url,
          i.final_url,
          i.status,
          i.failure_reason,
          i.country,
          i.actual_country,
          i.proxy_ip,
          (i.redirect_chain || []).join(" -> "),
        ]),
      ];
      const csv = lines
        .map((row) =>
          row
            .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`)
            .join(","),
        )
        .join("\r\n");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      link.download = `${b.file_name || "campaign-import"}-history.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
    }
  });
  document.getElementById("importPrevious").onclick = () => {
    offset = Math.max(0, offset - pageSize);
    load();
  };
  document.getElementById("importNext").onclick = () => {
    if (knownCount === pageSize) {
      offset += pageSize;
      load();
    }
  };
  const intervalSelect = document.getElementById("importRefreshInterval");
  intervalSelect.value =
    localStorage.getItem("campaignImportHistoryRefreshSeconds") || "10";
  function scheduleRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    const seconds = Number(intervalSelect.value);
    localStorage.setItem(
      "campaignImportHistoryRefreshSeconds",
      String(seconds),
    );
    if (seconds > 0)
      refreshTimer = setInterval(() => {
        if (document.visibilityState === "visible") load(true);
      }, seconds * 1000);
  }
  intervalSelect.addEventListener("change", scheduleRefresh);
  document.getElementById("importRefreshNow").onclick = () => load(true);
  load();
  scheduleRefresh();
})();