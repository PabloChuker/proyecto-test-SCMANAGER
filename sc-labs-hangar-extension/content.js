// =============================================================================
// SC Labs Hangar Importer — Content Script
// Runs on robertsspaceindustries.com/account/* pages
//
// Scrapes hangar and buyback data by fetching paginated RSI pages,
// parsing the HTML, and extracting pledge/ship/CCU information.
//
// RSI HTML structures (as of 2026):
//   MY HANGAR  (/account/pledges):
//     ul.list-items > li  (each pledge)
//       h3                       → pledge name
//       input.js-pledge-id       → RSI pledge ID
//       input.js-pledge-value    → "$55.00 USD"
//       .date-col                → "Created: March 25, 2026"
//       .items-col               → "Contains: Aurora Mk II and 5 items"
//       .image                   → background-image: url(...)
//       .with-images .item       → each contained item
//         .title                 → item name
//         .kind                  → "Ship", "Component", "Insurance", "Skin"
//       .also-contains .item     → "Self-Land Hangar", etc.
//       .js-gift                 → present if giftable
//       .js-reclaim              → present if exchangeable
//     Pagination: a[href*="page="]  with max page number
//
//   BUYBACK  (/account/buy-back-pledges):
//     article.pledge  (each pledge)
//       h1                       → pledge name
//       figure > img             → image
//       dl > dt/dd               → "Last Modified" / date, "Contained" / items
//       .unavailable .caption    → "Not available"
//     Pagination: a[href*="page="]
// =============================================================================

(function () {
  "use strict";

  // Prevent double-injection
  if (window.__scLabsHangarInjected) return;
  window.__scLabsHangarInjected = true;

  // ── Configuration ──
  const RSI_BASE = "https://robertsspaceindustries.com";
  const HANGAR_URL = `${RSI_BASE}/account/pledges`;
  const BUYBACK_URL = `${RSI_BASE}/account/buy-back-pledges`;
  const PAGE_SIZE = 10; // RSI default page size
  const REQUEST_DELAY_MS = 500; // Polite delay between requests

  // ── Utilities ──
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function sendProgress(percent, label, detail, logMsg, logLevel) {
    chrome.runtime.sendMessage({
      type: "export-progress",
      percent,
      label,
      detail,
      log: logMsg,
      logLevel,
    });
  }

  function sendComplete(data) {
    chrome.runtime.sendMessage({ type: "export-complete", data });
  }

  function sendError(error) {
    chrome.runtime.sendMessage({ type: "export-error", error });
  }

  // ── Check if user is logged in ──
  function isLoggedIn() {
    // If we're on an /account/ page and it loaded, user is logged in
    const isAccountPage = window.location.pathname.includes("/account/");
    if (isAccountPage) {
      return { loggedIn: true, handle: "" };
    }

    // Check for account-related elements
    const hasAccountContent =
      document.querySelector(".account-section") ||
      document.querySelector('[class*="account"]') ||
      document.querySelector(".pledge");

    return { loggedIn: !!hasAccountContent, handle: "" };
  }

  // ── Fetch a single page ──
  async function fetchPage(baseUrl, page) {
    const url = `${baseUrl}?page=${page}&pagesize=${PAGE_SIZE}`;
    const resp = await fetch(url, {
      credentials: "include",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} on page ${page}`);
    return await resp.text();
  }

  // ── Detect max page from pagination links ──
  function detectMaxPage(doc) {
    const links = doc.querySelectorAll('a[href*="page="]');
    let max = 1;
    links.forEach((a) => {
      const m = a.getAttribute("href").match(/page=(\d+)/);
      if (m) {
        const p = parseInt(m[1]);
        if (p > max) max = p;
      }
    });
    return max;
  }

  // ── Simple ID hash ──
  function generateId(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) & 0xffffffff;
    }
    return `sclabs-${Math.abs(h).toString(16).padStart(8, "0")}-${Date.now().toString(36)}`;
  }

  // ── Detect category from pledge name ──
  function detectCategory(name) {
    const n = name.toLowerCase();

    // CCU / Upgrades — "Upgrade -", "Ship Upgrades -"
    if (n.startsWith("upgrade -") || n.startsWith("upgrade –") || n.startsWith("ship upgrades -") || n.startsWith("ship upgrade")) return "upgrade";

    // Ships (standalone)
    if (n.startsWith("standalone ship")) return "standalone_ship";

    // Game packages
    if (n.startsWith("package -") || n.startsWith("package –") || n.includes("starter pack") || n.includes("game package") || n.includes("squadron 42")) return "game_package";

    // Paints / Skins / Liveries (including BIS reward paints for ships)
    if (n.startsWith("paints -") || n.startsWith("paint -") || n.includes(" paint") ||
        n.includes("skin -") || n.includes("livery") || n.includes("coloration")) return "paint";
    // BIS (Best in Show) ship rewards are typically paints — but NOT pennants, trophies, charms
    if ((n.includes("bis ") || n.includes("best in show")) && n.includes("reward") &&
        !n.includes("pennant") && !n.includes("trophy") && !n.includes("charm") &&
        !n.includes("plushie") && !n.includes("figurine") && !n.includes("poster") &&
        !n.includes("coin") && !n.includes("badge") && !n.includes("helmet") &&
        !n.includes("armor") && !n.includes("gear")) return "paint";

    // Gear / Armor / Weapons / Tools / Suits / Packs
    if (n.startsWith("gear -") || n.startsWith("add-ons -") ||
        n.includes("armor") || n.includes("helmet") || n.includes("undersuit") ||
        n.includes("backpack") || n.includes("jacket") || n.includes("weapons pack") || n.includes("weapon pack") ||
        n.includes("multi-tool") || n.includes("knife") || n.includes("combat knife") ||
        n.includes("pistol") || n.includes("rifle") || n.includes("shotgun") || n.includes("smg") || n.includes("lmg") ||
        n.includes("grenade launcher") || n.includes("tractor beam") || n.includes("mining gadget") ||
        n.includes("repeater") || n.includes("cannon") || n.includes("laser cannon") ||
        n.includes("hazard suit") || n.includes("refinery suit") || n.includes("service uniform") ||
        n.includes("medical device") || n.includes("mask") || n.includes("flight blades") ||
        n.includes("bomb rack") || n.includes("weapon kit") || n.includes("upgrade kit") ||
        n.includes("quikflare") || n.includes("medivac") || n.includes("purifier") ||
        n.includes("gear pack") || n.includes("hydration pack")) return "gear";

    // Subscriber items
    if (n.startsWith("subscribers ") || n.startsWith("subscriber ") || n.includes("subscribers exclusive") ||
        n.includes("imperator reward") || n.includes("centurion reward") ||
        n.includes("vip grand admiral") || n.includes("vip high admiral")) return "subscriber";

    // Flair — decorations, trophies, rewards, coins, collectibles, event items
    if (n.includes("flair") || n.includes("trophy") || n.includes("pennant") ||
        n.includes("charm") || n.includes("plushie") || n.includes("figurine") || n.includes("poster") ||
        n.includes("calendar") || n.includes("statue") || n.includes("diorama") ||
        n.includes("bis ") || n.includes("best in show") ||
        n.includes("festival") || n.includes("citizencon") ||
        n.includes("holiday") || n.includes("hangar decoration") || n.includes("flower") ||
        n.includes("pet") || n.includes("stuffed") || n.includes("bobblehead") ||
        n.includes("space globe") || n.includes("display case") || n.includes("lamp") ||
        n.includes("rug") || n.includes("towel") || n.includes("mug") || n.includes("cup") ||
        n.includes("action figure") || n.includes("badge") || n.includes("pin") ||
        n.includes("challenge coin") || n.includes("coin") || n.includes("envelope") ||
        n.includes("year of the") || n.includes("coramor") ||
        n.includes("reward") || n.includes("goodies") || n.includes("t-shirt") ||
        n.includes("luminalia") || n.includes("invictus") ||
        n.includes("advent") || n.includes("referral bonus") ||
        n.includes("chair") || n.includes("couch") || n.includes("lounge") || n.includes("throne") ||
        n.includes("nightstand") || n.includes("loveseat") || n.includes("cushion") ||
        n.includes("vase") || n.includes("plant pot") || n.includes("bust") ||
        n.includes("banner") || n.includes("specimen tank") || n.includes("cargo collection") ||
        n.includes("display") || n.includes("die ship") || n.includes("toy pistol") ||
        n.includes("resource drive") || n.includes("salvaged") ||
        n.includes("pirate week") || n.includes("xenothreat") ||
        n.includes("birthday goodies") || n.includes("digital goodies") ||
        n.includes("killer creature") || n.includes("brands of the") ||
        n.includes("cold front") || n.includes("cuddly cargo") || n.includes("decorative cargo") ||
        n.includes("explorer") || n.includes("adventurer") ||
        n.includes("big winner") || n.includes("completion package") ||
        n.includes("patch collection") || n.includes("resupply") ||
        n.includes("academy") || n.includes("grx prototype") ||
        n.includes("coupon") || n.includes("gourd") || n.includes("ornate")) return "flair";

    // Packs / Bundles
    if (n.includes("packs -") || n.includes("bundle") || n.includes("combo") ||
        n.includes("master set")) return "gear";

    // UEC / Credits
    if (n.includes("uec") || n.includes("credits") || n.includes("starting money")) return "other";

    return "other";
  }

  // ── Parse CCU from name: "Upgrade - ShipA to ShipB [- Edition]" ──
  function cleanCCUShipName(raw) {
    return raw
      .replace(/\s*[-–]?\s*(Standard|Warbond)\s*(Edition)?.*$/i, "")
      .replace(/\s*[-–]\s*(LTI|IAE|Invictus|BIS|Best in Show|Anniversary|Citizencon).*$/i, "")
      .trim();
  }

  function parseCCUFromName(name, price) {
    const m = name.match(/Upgrade\s*[-–]\s*(.+?)\s+to\s+(.+?)$/i);
    if (!m) return null;
    return {
      toSkuId: "",
      fromShipData: { id: 0, name: cleanCCUShipName(m[1]) },
      toShipData: { id: 0, name: cleanCCUShipName(m[2]) },
      price,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MY HANGAR parser — ul.list-items > li
  // ═══════════════════════════════════════════════════════════════════════════
  function parseHangarPage(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const maxPage = detectMaxPage(doc);
    const containers = doc.querySelectorAll("ul.list-items > li");
    const items = [];

    containers.forEach((li) => {
      try {
        // ── Name ──
        const h3 = li.querySelector("h3");
        const name = h3 ? h3.textContent.trim() : "";
        if (!name) return;

        // ── Price ──
        const priceInput = li.querySelector(".js-pledge-value");
        const priceStr = priceInput ? priceInput.value : "$0";
        const price = parseFloat(priceStr.replace(/[^0-9.]/g, "")) || 0;

        // ── Pledge ID ──
        const idInput = li.querySelector(".js-pledge-id");
        const pledgeId = idInput ? idInput.value : "";

        // ── Date ──
        const dateCol = li.querySelector(".date-col");
        let lastModification = "";
        if (dateCol) {
          lastModification = dateCol.textContent.replace("Created:", "").trim();
        }

        // ── Image (from CSS background-image) ──
        const imageDiv = li.querySelector(".image");
        let image = "";
        if (imageDiv) {
          const bg = imageDiv.getAttribute("style") || "";
          const bgMatch = bg.match(/url\(['"]?(.*?)['"]?\)/);
          if (bgMatch) {
            let url = bgMatch[1];
            if (url.startsWith("//")) url = "https:" + url;
            else if (url.startsWith("/")) url = RSI_BASE + url;
            image = url;
          }
        }

        // ── Contains text ──
        const itemsCol = li.querySelector(".items-col");
        const contained = itemsCol
          ? itemsCol.textContent.replace("Contains:", "").trim()
          : name;

        // ── Category ──
        const category = detectCategory(name);

        // ── Contained items (ships, components, skins, etc.) ──
        const shipInThisPackData = [];
        const allContainedItems = [];
        li.querySelectorAll(".with-images .item").forEach((el) => {
          const itemTitle = el.querySelector(".title");
          const itemKind = el.querySelector(".kind");
          const itemName = itemTitle ? itemTitle.textContent.trim() : "";
          const kind = itemKind ? itemKind.textContent.trim() : "";
          if (itemName) {
            // Try to get the item's image
            let itemImg = "";
            const itemImgEl = el.querySelector("img");
            if (itemImgEl) {
              itemImg = itemImgEl.getAttribute("src") || "";
              if (itemImg.startsWith("//")) itemImg = "https:" + itemImg;
              else if (itemImg.startsWith("/")) itemImg = RSI_BASE + itemImg;
            }
            allContainedItems.push({ name: itemName, kind, image: itemImg });
            if (kind === "Ship") {
              shipInThisPackData.push({ name: itemName, image: itemImg });
            }
          }
        });
        // Also try without .with-images in case RSI uses a different structure
        if (allContainedItems.length === 0) {
          li.querySelectorAll(".item .title").forEach((el) => {
            const itemName = el.textContent.trim();
            if (itemName) {
              const kindEl = el.parentElement ? el.parentElement.querySelector(".kind") : null;
              const kind = kindEl ? kindEl.textContent.trim() : "";
              allContainedItems.push({ name: itemName, kind });
              if (kind === "Ship") {
                shipInThisPackData.push({ name: itemName, image: "" });
              }
            }
          });
        }

        // ── Also contains ──
        const alsoContainData = [];
        li.querySelectorAll(".without-images .item, .also-contains .item").forEach((el) => {
          const text = el.textContent.trim();
          if (text && text !== "Also Contains") alsoContainData.push(text);
        });

        // Also pick up insurance from contained items
        allContainedItems.forEach((ci) => {
          if (ci.kind === "Insurance") alsoContainData.push(ci.name);
        });

        // ── Giftable / Exchangeable ──
        const isGiftable = !!li.querySelector(".js-gift");
        const isExchangeable = !!li.querySelector(".js-reclaim");

        // ── Build item ──
        const item = {
          id: generateId(pledgeId + name),
          name,
          image,
          lastModification,
          contained,
          category,
          link: `${RSI_BASE}/account/pledges?page=1&pledgeId=${pledgeId}`,
          available: true,
          isGiftable,
          isExchangeable,
        };

        if (category === "upgrade") {
          item.ccuInfo = parseCCUFromName(name, price);
        } else {
          item.elementData = {
            price,
            shipInThisPackData,
            alsoContainData,
          };
        }

        items.push(item);
      } catch (err) {
        console.warn("[SC Labs] Failed to parse hangar item:", err);
      }
    });

    return { items, maxPage };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BUYBACK parser — article.pledge
  // ═══════════════════════════════════════════════════════════════════════════
  function parseBuybackPage(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const maxPage = detectMaxPage(doc);
    const articles = doc.querySelectorAll("article.pledge");
    const items = [];

    articles.forEach((art) => {
      try {
        // ── Name ──
        const h1 = art.querySelector("h1");
        const name = h1 ? h1.textContent.trim() : "";
        if (!name) return;

        // ── Image ──
        const img = art.querySelector("figure img, img");
        let image = img ? img.getAttribute("src") || "" : "";
        if (image.startsWith("//")) image = "https:" + image;
        else if (image.startsWith("/")) image = RSI_BASE + image;

        // ── Metadata from dl/dt/dd ──
        let lastModification = "";
        let contained = "";
        const dts = art.querySelectorAll("dt");
        const dds = art.querySelectorAll("dd");
        dts.forEach((dt, idx) => {
          const key = dt.textContent.trim().toLowerCase();
          const val = dds[idx] ? dds[idx].textContent.trim() : "";
          if (key.includes("modified") || key.includes("date")) lastModification = val;
          if (key.includes("contain")) contained = val;
        });

        // ── Availability ──
        const unavailableEl = art.querySelector(".unavailable .caption");
        const available = !unavailableEl;

        // ── Category ──
        const category = detectCategory(name);

        // ── Price (buyback pages — try multiple selectors & dd elements) ──
        let price = 0;
        const priceEl = art.querySelector(".js-pledge-value, .price, .amount, .final-amount, .credit-amount, .store-price");
        if (priceEl) {
          const pVal = priceEl.value || priceEl.textContent || "";
          price = parseFloat(pVal.replace(/[^0-9.]/g, "")) || 0;
        }
        // Fallback: look for price in dt/dd pairs ("Cost", "Price", "Value", "Pledge")
        if (price === 0) {
          dts.forEach((dt, idx) => {
            const key = dt.textContent.trim().toLowerCase();
            if (key.includes("cost") || key.includes("price") || key.includes("value") || key.includes("pledge") || key.includes("amount")) {
              const val = dds[idx] ? dds[idx].textContent.trim() : "";
              const p = parseFloat(val.replace(/[^0-9.]/g, "")) || 0;
              if (p > 0) price = p;
            }
          });
        }
        // Fallback: scan all text content for USD pattern
        if (price === 0) {
          const allText = art.textContent || "";
          const usdMatch = allText.match(/\$\s*(\d+(?:\.\d{2})?)\s*USD/);
          if (usdMatch) price = parseFloat(usdMatch[1]) || 0;
        }

        // ── Build item ──
        const item = {
          id: generateId(name + lastModification),
          name,
          image,
          lastModification,
          contained: contained || name,
          category,
          link: `${RSI_BASE}/account/buy-back-pledges`,
          available,
        };

        if (category === "upgrade") {
          item.ccuInfo = parseCCUFromName(name, price);
        } else {
          item.elementData = {
            price,
            shipInThisPackData: [],
            alsoContainData: [],
          };
        }

        items.push(item);
      } catch (err) {
        console.warn("[SC Labs] Failed to parse buyback item:", err);
      }
    });

    return { items, maxPage };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Main Export Flow
  // ═══════════════════════════════════════════════════════════════════════════
  async function exportHangar(options) {
    const result = {
      version: "1.0",
      exportedBy: "SC Labs Hangar Importer",
      exportDate: new Date().toISOString(),
      myHangar: [],
      myBuyBack: [],
    };

    try {
      let totalSteps = 0;
      let currentStep = 0;

      sendProgress(0, "Discovering pages...", "Checking hangar size...");

      let hangarPages = 0;
      let buybackPages = 0;

      // ── Phase 1: Fetch first pages and discover total ──
      if (options.hangar) {
        sendProgress(2, "Scanning...", "Checking My Hangar...", "Fetching hangar page 1...", "info");
        try {
          const html = await fetchPage(HANGAR_URL, 1);
          const { items, maxPage } = parseHangarPage(html);
          hangarPages = maxPage;
          result.myHangar.push(...items);
          sendProgress(5, "Scanning...", `My Hangar: ${hangarPages} pages`, `Found ${hangarPages} hangar pages, ${items.length} items on page 1`, "info");
        } catch (err) {
          sendProgress(5, "Warning", "Could not access My Hangar", `Hangar error: ${err.message}`, "warn");
        }
        await sleep(REQUEST_DELAY_MS);
      }

      if (options.buyback) {
        sendProgress(8, "Scanning...", "Checking Buyback...", "Fetching buyback page 1...", "info");
        try {
          const html = await fetchPage(BUYBACK_URL, 1);
          const { items, maxPage } = parseBuybackPage(html);
          buybackPages = maxPage;
          result.myBuyBack.push(...items);
          sendProgress(10, "Scanning...", `Buyback: ${buybackPages} pages`, `Found ${buybackPages} buyback pages, ${items.length} items on page 1`, "info");
        } catch (err) {
          sendProgress(10, "Warning", "Could not access Buyback", `Buyback error: ${err.message}`, "warn");
        }
        await sleep(REQUEST_DELAY_MS);
      }

      totalSteps = Math.max(0, hangarPages - 1) + Math.max(0, buybackPages - 1);

      if (totalSteps === 0 && result.myHangar.length === 0 && result.myBuyBack.length === 0) {
        sendError("No items found. Make sure you're logged in and on an RSI account page.");
        return;
      }

      // ── Phase 2: Remaining hangar pages ──
      if (options.hangar && hangarPages > 1) {
        for (let page = 2; page <= hangarPages; page++) {
          currentStep++;
          const pct = 10 + (currentStep / Math.max(totalSteps, 1)) * 80;
          sendProgress(pct, "Downloading Hangar...", `Page ${page} of ${hangarPages}`, `Hangar page ${page}/${hangarPages}`, "info");

          try {
            const html = await fetchPage(HANGAR_URL, page);
            const { items } = parseHangarPage(html);
            result.myHangar.push(...items);
          } catch (err) {
            sendProgress(pct, "Warning", `Hangar page ${page} failed`, `Error: ${err.message}`, "warn");
          }
          await sleep(REQUEST_DELAY_MS);
        }
      }

      // ── Phase 3: Remaining buyback pages ──
      if (options.buyback && buybackPages > 1) {
        for (let page = 2; page <= buybackPages; page++) {
          currentStep++;
          const pct = 10 + (currentStep / Math.max(totalSteps, 1)) * 80;
          sendProgress(pct, "Downloading Buyback...", `Page ${page} of ${buybackPages}`, `Buyback page ${page}/${buybackPages}`, "info");

          try {
            const html = await fetchPage(BUYBACK_URL, page);
            const { items } = parseBuybackPage(html);
            result.myBuyBack.push(...items);
          } catch (err) {
            sendProgress(pct, "Warning", `Buyback page ${page} failed`, `Error: ${err.message}`, "warn");
          }
          await sleep(REQUEST_DELAY_MS);
        }
      }

      // ── Done ──
      const totalItems = result.myHangar.length + result.myBuyBack.length;
      sendProgress(100, "Export complete!", `${totalItems} items exported`, `Done! Hangar: ${result.myHangar.length}, Buyback: ${result.myBuyBack.length}`, "success");
      sendComplete(result);
    } catch (err) {
      sendError(`Export failed: ${err.message}`);
    }
  }

  // ── Message Listener ──
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "checkLogin") {
      sendResponse(isLoggedIn());
      return true;
    }
    if (msg.action === "exportHangar") {
      exportHangar(msg.options);
      sendResponse({ started: true });
      return true;
    }
  });

  console.log("[SC Labs] Hangar Importer content script loaded.");
})();
