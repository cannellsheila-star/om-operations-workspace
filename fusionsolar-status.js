(() => {
  const stateCache = { loading: false, loaded: false, payload: null, error: "" };

  function esc(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
  }

  function installStyles() {
    if (document.getElementById("fusion-status-style")) return;
    const style = document.createElement("style");
    style.id = "fusion-status-style";
    style.textContent = `
      .fusion-status{margin:0 0 16px;padding:14px 16px;display:grid;gap:10px}
      .fusion-status-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .fusion-status-title{display:flex;align-items:center;gap:9px}
      .fusion-dot{width:10px;height:10px;border-radius:50%;background:#9ca3af;box-shadow:0 0 0 3px rgba(156,163,175,.15)}
      .fusion-dot.ok{background:#16a34a;box-shadow:0 0 0 3px rgba(22,163,74,.15)}
      .fusion-dot.bad{background:#dc2626;box-shadow:0 0 0 3px rgba(220,38,38,.15)}
      .fusion-dot.loading{background:#d97706;box-shadow:0 0 0 3px rgba(217,119,6,.15)}
      .fusion-meta{font-size:12px;opacity:.72}
      .fusion-plants{display:flex;gap:8px;flex-wrap:wrap}
      .fusion-plant{font-size:12px;border:1px solid var(--line,#d8dee8);border-radius:999px;padding:5px 8px}
      .fusion-error{font-size:12px;padding:9px 10px;border:1px solid rgba(220,38,38,.35);border-radius:7px;background:rgba(220,38,38,.06)}
    `;
    document.head.appendChild(style);
  }

  function cardHtml() {
    let cls = "";
    let label = "Not tested";
    let detail = "SG5 FusionSolar Northbound API";
    let body = "";
    if (stateCache.loading) {
      cls = "loading";
      label = "Connecting…";
      detail = "Testing Northbound login against sg5.fusionsolar.huawei.com";
    } else if (stateCache.payload?.configured && Array.isArray(stateCache.payload.systems)) {
      cls = "ok";
      label = "Connected";
      const count = stateCache.payload.systems.length;
      detail = `${count} FusionSolar plant${count === 1 ? "" : "s"} returned from SG5`;
      if (count) body = `<div class="fusion-plants">${stateCache.payload.systems.slice(0, 20).map((s) => `<span class="fusion-plant">${esc(s.name || s.providerStationId)}</span>`).join("")}</div>`;
    } else if (stateCache.error || stateCache.payload?.message) {
      cls = "bad";
      label = "Connection failed";
      detail = "FusionSolar Northbound API did not connect";
      body = `<div class="fusion-error">${esc(stateCache.error || stateCache.payload?.message)}</div>`;
    }
    return `<section class="surface fusion-status" id="fusion-status-card"><div class="fusion-status-head"><div><div class="fusion-status-title"><span class="fusion-dot ${cls}"></span><strong>FusionSolar SG5 · ${esc(label)}</strong></div><div class="fusion-meta">${esc(detail)}</div></div><button type="button" class="button button-muted" data-fusion-test>${stateCache.loading ? "Testing…" : "Test connection"}</button></div>${body}</section>`;
  }

  function mount() {
    installStyles();
    if (typeof state === "undefined" || state.view !== "monitoring") return;
    const appView = document.getElementById("app-view");
    if (!appView) return;
    const existing = document.getElementById("fusion-status-card");
    if (existing) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = cardHtml();
      existing.replaceWith(wrapper.firstElementChild);
      return;
    }
    appView.insertAdjacentHTML("afterbegin", cardHtml());
    if (!stateCache.loaded && !stateCache.loading) testConnection();
  }

  async function testConnection() {
    if (stateCache.loading) return;
    stateCache.loading = true;
    stateCache.error = "";
    mount();
    try {
      const response = await fetch("/api/fusionsolar", { cache: "no-store", headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({}));
      stateCache.payload = payload;
      stateCache.loaded = true;
      if (!response.ok) stateCache.error = payload.message || `HTTP ${response.status}`;
    } catch (error) {
      stateCache.loaded = true;
      stateCache.error = error.message || "FusionSolar test failed.";
    } finally {
      stateCache.loading = false;
      mount();
    }
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-fusion-test]")) {
      testConnection();
      return;
    }
    if (event.target.closest?.('[data-nav="monitoring"]')) setTimeout(mount, 80);
  });

  setInterval(() => {
    if (typeof state !== "undefined" && state.view === "monitoring" && !document.getElementById("fusion-status-card")) mount();
  }, 1500);

  setTimeout(mount, 200);
})();