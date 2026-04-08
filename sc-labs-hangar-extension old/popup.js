// =============================================================================
// SC Labs Hangar Importer — Popup Controller
// =============================================================================

const $ = (sel) => document.querySelector(sel);

// DOM elements
const statusDot    = $("#statusDot");
const statusValue  = $("#statusValue");
const statusHint   = $("#statusHint");
const btnExport    = $("#btnExport");
const btnDownload  = $("#btnDownload");
const progressCtr  = $("#progressContainer");
const progressLabel = $("#progressLabel");
const progressPct  = $("#progressPct");
const progressFill = $("#progressFill");
const progressDetail = $("#progressDetail");
const statsGrid    = $("#statsGrid");
const statShips    = $("#statShips");
const statCCUs     = $("#statCCUs");
const statPaints   = $("#statPaints");
const statGear     = $("#statGear");
const statFlair    = $("#statFlair");
const statSubs     = $("#statSubs");
const statTotal    = $("#statTotal");
const logArea      = $("#logArea");
const optHangar    = $("#optHangar");
const optBuyback   = $("#optBuyback");

let exportData = null;

// ── Logging ──
function log(msg, level = "info") {
  logArea.classList.add("active");
  const line = document.createElement("div");
  line.className = `log-line ${level}`;
  const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  line.textContent = `[${time}] ${msg}`;
  logArea.appendChild(line);
  logArea.scrollTop = logArea.scrollHeight;
}

// ── Progress Update ──
function updateProgress(pct, label, detail) {
  progressCtr.classList.add("active");
  progressFill.style.width = `${pct}%`;
  progressPct.textContent = `${Math.round(pct)}%`;
  if (label) progressLabel.textContent = label;
  if (detail) progressDetail.textContent = detail;
}

// ── Check if user is on RSI and logged in ──
async function checkRSIStatus() {
  try {
    // Query for active tab on RSI
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url) {
      setStatus("offline", "Not on RSI", "Open robertsspaceindustries.com and log in to your account.");
      return false;
    }

    const isRSI = tab.url.includes("robertsspaceindustries.com");

    if (!isRSI) {
      setStatus("offline", "Not on RSI", "Navigate to robertsspaceindustries.com and log in to export your hangar.");
      return false;
    }

    // Check if user is logged in by asking the content script
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: "checkLogin" });
      if (response && response.loggedIn) {
        setStatus("online", "Logged In", `Ready to export. Welcome, ${response.handle || "Citizen"}!`);
        btnExport.disabled = false;
        return true;
      } else {
        setStatus("offline", "Not Logged In", "Please log in to your RSI account to export your hangar.");
        return false;
      }
    } catch (err) {
      // Content script not available — user might not be on the right page
      // Try injecting it
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        });
        // Retry
        const response = await chrome.tabs.sendMessage(tab.id, { action: "checkLogin" });
        if (response && response.loggedIn) {
          setStatus("online", "Logged In", `Ready to export. Welcome, ${response.handle || "Citizen"}!`);
          btnExport.disabled = false;
          return true;
        }
      } catch (injectErr) {
        // Can't inject — probably wrong page
      }

      setStatus("offline", "Navigate to RSI", "Go to your RSI account page (Account > My Hangar) to begin.");
      return false;
    }
  } catch (err) {
    setStatus("offline", "Error", "Could not detect RSI status. Try refreshing the page.");
    log(`Status check error: ${err.message}`, "error");
    return false;
  }
}

function setStatus(state, value, hint) {
  statusDot.className = `status-dot ${state}`;
  statusValue.textContent = value;
  statusHint.textContent = hint;
}

// ── Export Handler ──
btnExport.addEventListener("click", async () => {
  const doHangar = optHangar.checked;
  const doBuyback = optBuyback.checked;

  if (!doHangar && !doBuyback) {
    log("Select at least one section to export.", "warn");
    return;
  }

  btnExport.disabled = true;
  btnExport.textContent = "Exporting...";
  exportData = null;
  btnDownload.style.display = "none";
  statsGrid.classList.remove("active");

  log("Starting hangar export...", "info");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send export command to content script
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "exportHangar",
      options: { hangar: doHangar, buyback: doBuyback },
    });

    // The content script will send progress updates via messages
    // Wait for completion
  } catch (err) {
    log(`Export failed: ${err.message}`, "error");
    btnExport.disabled = false;
    btnExport.textContent = "Export Hangar";
  }
});

// ── Download Handler ──
btnDownload.addEventListener("click", () => {
  if (!exportData) return;

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().split("T")[0];
  a.href = url;
  a.download = `sclabs-hangar_${date}.json`;
  a.click();
  URL.revokeObjectURL(url);

  log("File downloaded!", "success");
});

// ── Listen for messages from content script ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "export-progress") {
    updateProgress(msg.percent, msg.label, msg.detail);
    if (msg.log) log(msg.log, msg.logLevel || "info");
  }

  if (msg.type === "export-complete") {
    exportData = msg.data;

    // Update stats — count all item types
    const allItems = [...(exportData.myHangar || []), ...(exportData.myBuyBack || [])];
    const ships = allItems.filter((i) => i.category === "standalone_ship" || i.category === "game_package").length;
    const ccus = allItems.filter((i) => i.category === "upgrade").length;
    const paints = allItems.filter((i) => i.category === "paint").length;
    const gear = allItems.filter((i) => i.category === "gear").length;
    const flair = allItems.filter((i) => i.category === "flair").length;
    const subs = allItems.filter((i) => i.category === "subscriber").length;
    const other = allItems.filter((i) => i.category === "other").length;
    const total = allItems.length;

    statShips.textContent = ships;
    statCCUs.textContent = ccus;
    statPaints.textContent = paints;
    statGear.textContent = gear;
    statFlair.textContent = flair;
    statSubs.textContent = subs;
    statTotal.textContent = total;

    // Log breakdown
    log(`Ships: ${ships}, CCUs: ${ccus}, Paints: ${paints}, Gear: ${gear}, Flair: ${flair}, Sub: ${subs}, Other: ${other}`, "info");

    statsGrid.classList.add("active");
    updateProgress(100, "Export complete!", `${total} items exported`);
    log(`Export complete: ${total} items total`, "success");

    btnExport.style.display = "none";
    btnDownload.style.display = "flex";
    statusDot.className = "status-dot online";
  }

  if (msg.type === "export-error") {
    log(`Error: ${msg.error}`, "error");
    btnExport.disabled = false;
    btnExport.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Retry Export
    `;
    updateProgress(0, "Export failed", msg.error);
  }
});

// ── Initialize ──
checkRSIStatus();
