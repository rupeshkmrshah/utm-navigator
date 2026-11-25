document.addEventListener("DOMContentLoaded", async () => {
  function notify(message, type = "info") {
    const notice = document.getElementById("schedule-notice");
    notice.textContent = message;
    notice.className = `schedule-notice ${type}`;
    notice.hidden = false;
    clearTimeout(notice.hideTimer);
    notice.hideTimer = setTimeout(() => {
      notice.hidden = true;
    }, 6500);
  }
  const scheduleForm = document.getElementById("schedule-form");
  const fileInput = document.getElementById("file-input");
  const datetimeInput = document.getElementById("datetime-input");
  const fileCountDisplay = document.getElementById("file-count");
  const jobsTableBody = document.getElementById("jobs-table-body");

  let userRole = "";
  try {
    const res = await fetch("/api/auth/me");
    const { user } = await res.json();
    userRole = user.role;
    if (userRole === "Admin") {
      document
        .querySelectorAll(".admin-only")
        .forEach((el) => (el.style.display = "table-cell"));
    }
  } catch (e) {
    console.error("Could not fetch user role", e);
  }

  // Function to convert UTC to IST
  function toIST(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    });
  }
  function istDateTimeToIso(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
    if (!match) throw new Error("Enter time as YYYY-MM-DDTHH:mm.");
    const [, year, month, day, hour, minute] = match.map(Number);
    return new Date(
      Date.UTC(year, month - 1, day, hour, minute) - 330 * 60 * 1000,
    ).toISOString();
  }
  const escapeHtml = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );

  // Helper function to validate URL
  function isValidURL(str) {
    try {
      new URL(str);
      return true;
    } catch (_) {
      return false;
    }
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
    values.push(current.trim().replace(/^"|"$/g, ""));
    return values;
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
            .map((h) => h.trim().replace(/\"/g, ""));

          const urlIndex = headers.findIndex(
            (h) =>
              h.toLowerCase().includes("url") ||
              h.toLowerCase().includes("link") ||
              h.toLowerCase().includes("campaign"),
          );

          if (urlIndex === -1) {
            throw new Error(
              'No URL column found. Please ensure your CSV has a column with "URL", "Link", or "Campaign" in the header.',
            );
          }

          let urlCount = 0;
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const values = parseCSVLine(line);
            if (
              values.length > urlIndex &&
              values[urlIndex] &&
              isValidURL(values[urlIndex].trim())
            ) {
              urlCount++;
            }
          }
          resolve(urlCount);
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
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          if (jsonData.length === 0) {
            throw new Error("The Excel file appears to be empty.");
          }

          const headers = jsonData[0].map((h) =>
            String(h || "")
              .trim()
              .toLowerCase(),
          );

          const urlIndex = headers.findIndex(
            (h) =>
              h.includes("url") || h.includes("link") || h.includes("campaign"),
          );

          if (urlIndex === -1) {
            throw new Error(
              'No URL column found. Please ensure your Excel file has a column with "URL", "Link", or "Campaign" in the header.',
            );
          }

          let urlCount = 0;
          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || row.length === 0) continue;
            const url = String(row[urlIndex] || "").trim();
            if (url && isValidURL(url)) {
              urlCount++;
            }
          }
          resolve(urlCount);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read Excel file"));
      reader.readAsArrayBuffer(file);
    });
  }

  // Event listener for file input change
  fileInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) {
      fileCountDisplay.textContent = "";
      return;
    }

    const fileExtension = file.name.split(".").pop().toLowerCase();
    try {
      let urlCount = 0;
      if (fileExtension === "csv") {
        urlCount = await parseCSVFile(file);
      } else if (fileExtension === "xlsx") {
        // You'll need to include the XLSX library for this to work
        // For testing, you can manually load it in schedule.html:
        // <script src="https://unpkg.com/xlsx/dist/xlsx.full.min.js"></script>
        urlCount = await parseXLSXFile(file);
      } else {
        fileCountDisplay.textContent = "Unsupported file type.";
        return;
      }
      fileCountDisplay.textContent = `Total URLs detected: ${urlCount}`;
    } catch (error) {
      console.error("Error parsing file:", error);
      fileCountDisplay.textContent = `Error: ${error.message}`;
    }
  });

  // Fetch and display scheduled jobs
  async function loadJobs() {
    try {
      const res = await fetch("/api/schedules", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch jobs");
      const jobs = await res.json();
      console.log("Jobs data:", jobs);

      if (!Array.isArray(jobs) || jobs.length === 0) {
        jobsTableBody.innerHTML = `<tr>
          <td colspan="${userRole === "Admin" ? "9" : "8"}" style="text-align:center; padding:32px; color:#667085;">
            No scheduled jobs yet.
          </td>
        </tr>`;
        return;
      }

      jobsTableBody.innerHTML = jobs
        .map((job) => {
          const total = Number(job.total_urls || 0);
          const done = Number(job.processed_urls || 0);
          const progress = total
            ? Math.min(100, Math.round((done * 100) / total))
            : 0;
          const state =
            job.control_requested === "pause"
              ? "pause requested"
              : job.control_requested === "cancel"
                ? "cancel requested"
                : job.status;
          const canPause =
            ["pending", "processing"].includes(job.status) &&
            !job.control_requested;
          const canResume =
            job.status === "paused" ||
            (job.status === "processing" && job.control_requested === "pause");
          const canCancel =
            ["pending", "paused", "processing"].includes(job.status) &&
            job.control_requested !== "cancel";
          const canEdit = ["pending", "paused"].includes(job.status);
          return `
        <tr>
          <td>${job.id}</td>
          <td class="admin-only">${escapeHtml(job.username)}</td>
          <td>${escapeHtml(job.file_name)}</td>
          <td>${total || "N/A"}</td>
          <td><div class="job-progress"><span>${done}/${total}</span><div><i style="width:${progress}%"></i></div><small>✓ ${job.resolved_urls || 0} · ✕ ${job.failed_urls || 0} · ⊘ ${job.cancelled_urls || 0}</small></div></td>
          <td><span class="status status-${escapeHtml(job.status)}">${escapeHtml(state)}</span></td>
          <td>${toIST(job.scheduled_at)}</td>
          <td>${toIST(job.created_at)}</td>
          <td class="job-actions">
            ${canPause ? `<button class="job-action" data-action="pause" data-job-id="${job.id}">Pause</button>` : ""}
            ${canResume ? `<button class="job-action" data-action="resume" data-job-id="${job.id}">Resume</button>` : ""}
            ${canCancel ? `<button class="job-action danger" data-action="cancel" data-job-id="${job.id}">Cancel</button>` : ""}
            ${canEdit ? `<button class="job-action" data-action="reschedule" data-job-id="${job.id}" data-scheduled-at="${job.scheduled_at}">Reschedule</button>` : ""}
            ${job.status !== "processing" ? `<button class="job-action danger" data-action="delete" data-job-id="${job.id}">Delete</button>` : ""}
          </td>
        </tr>`;
        })
        .join("");
    } catch (error) {
      console.error("Error loading jobs:", error);
      jobsTableBody.innerHTML = `<tr><td colspan="${userRole === "Admin" ? "9" : "8"}">Error loading jobs.</td></tr>`;
    }
  }

  // Handle form submission
  scheduleForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = fileInput.files[0];
    const scheduledAt = datetimeInput.value;

    if (!file || !scheduledAt) {
      alert("Please select a file and a schedule time.");
      return;
    }

    const scheduledAtIso = istDateTimeToIso(scheduledAt);
    if (new Date(scheduledAtIso) <= new Date()) {
      document.getElementById("pastDateModal").style.display = "flex";
      return;
    }

    let totalUrls = 0;
    const fileExtension = file.name.split(".").pop().toLowerCase();
    try {
      if (fileExtension === "csv") {
        totalUrls = await parseCSVFile(file);
      } else if (fileExtension === "xlsx") {
        totalUrls = await parseXLSXFile(file);
      }
    } catch (error) {
      alert(`Error parsing file: ${error.message}`);
      return;
    }

    const formData = new FormData();
    formData.append("scheduleFile", file);
    formData.append("scheduledAt", scheduledAtIso);
    formData.append("totalUrls", totalUrls); // Add totalUrls to formData

    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        cache: "no-store",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to schedule job");
      }

      notify("Job scheduled successfully.", "success");
      await loadJobs();
      scheduleForm.reset();
    } catch (error) {
      console.error("Error scheduling job:", error);
      notify(error.message, "error");
    }
  });

  document.getElementById("closeModalBtn").addEventListener("click", () => {
    document.getElementById("pastDateModal").style.display = "none";
    window.location.reload();
  });

  jobsTableBody.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, jobId } = button.dataset;
    try {
      if (action === "delete") {
        if (
          !(await window.showConfirmModal({
            title: "Delete this scheduled job?",
            message: "The job and all of its saved results will be removed.",
            confirmText: "Delete job",
          }))
        )
          return;
        await deleteJob(jobId);
      } else if (action === "reschedule") {
        const value = prompt("Enter the new schedule time (YYYY-MM-DDTHH:mm):");
        if (!value) return;
        const response = await fetch(`/api/schedules/${jobId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduledAt: istDateTimeToIso(value) }),
        });
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error || "Unable to reschedule job");
        await loadJobs();
      } else {
        if (
          action === "cancel" &&
          !(await window.showConfirmModal({
            title: "Cancel this scheduled job?",
            message:
              "Any URL already resolving will finish before the worker stops.",
            confirmText: "Cancel job",
          }))
        )
          return;
        if (
          action === "pause" &&
          !(await window.showConfirmModal({
            title: "Pause this scheduled job?",
            message:
              "The worker will stop after its current URL and can be resumed later.",
            confirmText: "Pause job",
            tone: "primary",
          }))
        )
          return;
        const response = await fetch(`/api/schedules/${jobId}/control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error || "Unable to update job");
        await loadJobs();
      }
    } catch (error) {
      notify(error.message, "error");
    }
  });

  async function deleteJob(jobId) {
    try {
      const res = await fetch(`/api/schedules/${jobId}`, {
        method: "DELETE",
        cache: "no-store",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete job");
      }
      notify("Job deleted successfully.", "success");
      loadJobs();
    } catch (error) {
      console.error("Error deleting job:", error);
      notify(error.message, "error");
    }
  }

  loadJobs();
  setInterval(loadJobs, 12000);
});