(() => {
  const baseRenderMonitoring = window.renderMonitoring;
  const fusionState = { status: "idle", data: null, message: "", checkedAt: null, promise: null };

  const esc = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

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
      .fusion-meta{font-size:12px;opacity:.72;margin-top:4px}
      .fusion-plants{display:flex;gap:8px;flex-wrap:wrap}
      .fusion-plant{font-size:12px;border:1px solid var(--line,#d8dee8);border-radius:999px;padding:5px 8px}
      .fusion-error{font-size:12px;padding:9px 10px;border:1px solid rgba(220,38,38,.35);border-radius:7px;background:rgba(220,38,38,.06)}
    `;
    document.head.appendChild(style);
  }

  function cardHtml() {
    const systems = Array.isArray(fusionState.data?.systems) ? fusionState.data.systems : [];
    const checked = fusionState.checkedAt
      ? new Date(fusionState.checkedAt).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })
      : "Not checked yet";

    let dot = "";
    let label = "Not checked";
    let detail = "Northbound credentials are stored server-side. Test them directly against FusionSolar SG5.";
    let body = "";

    if (fusionState.status === "loading") {
      dot = "loading";
      label = "Connecting…";
      detail = "Calling sg5.fusionsolar.huawei.com using the Northbound credentials stored in Vercel.";
    } else if (fusionState.status === "ready") {
      dot = "ok";
      label = "Connected";
      detail = `${systems.length} FusionSolar plant${systems.length === 1 ? "" : "s"} returned from SG5.`;
      if (systems.length) {
        body = `<div class="fusion-plants">${systems.slice(0, 20).map((system) => `<span class="fusion-plant">${esc(system.name || system.providerStationId)}</span>`).join("")}${systems.length > 20 ? `<span class="fusion-plant">+${systems.length - 20} more</span>` : ""}</div>`;
      }
    } else if (fusionState.status === "error") {
      dot = "bad";
      label = "Connection failed";
      detail = "Huawei returned an error. The exact response is shown below.";
      body = `<div class="fusion-error">${esc(fusionState.message || "FusionSolar connection failed.")}</div>`;
    }

    return `<section class="surface fusion-status" id="fusion-status-card">
      <div class="fusion-status-head">
        <div>
          <div class="fusion-status-title"><span class="fusion-dot ${dot}"></span><strong>FusionSolar SG5 · ${esc(label)}</strong></div>
          <div class="fusion-meta">${esc(detail)} · Last checked: ${esc(checked)}</div>
        </div>
        <button type="button" class="button button-muted" id="fusionsolar-test-button" ${fusionState.status === "loading" ? "disabled" : ""}>${fusionState.status === "loading" ? "Testing…" : "Test connection"}</button>
      </div>
      ${body}
    </section>`;
  }

  function injectPanel() {
    installStyles();
    if (typeof state === "undefined" || state.view !== "monitoring") return;
    const appView = document.getElementById("app-view");
    if (!appView) return;
    document.getElementById("fusion-status-card")?.remove();
    appView.insertAdjacentHTML("afterbegin", cardHtml());
  }

  async function testConnection(force = false) {
    if (fusionState.promise && !force) return fusionState.promise;
    fusionState.status = "loading";
    fusionState.message = "";
    injectPanel();

    fusionState.promise = (async () => {
      try {
        const response = await fetch("/api/fusionsolar-sg5", {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.configured === false || payload.connected === false) {
          throw new Error(payload.message || `FusionSolar returned HTTP ${response.status}.`);
        }
        fusionState.data = payload;
        fusionState.status = "ready";
        fusionState.message = payload.message || "FusionSolar connected.";
      } catch (error) {
        fusionState.data = null;
        fusionState.status = "error";
        fusionState.message = error?.message || "FusionSolar connection failed.";
      } finally {
        fusionState.checkedAt = new Date().toISOString();
        fusionState.promise = null;
        injectPanel();
      }
      return fusionState.data;
    })();

    return fusionState.promise;
  }

  if (typeof baseRenderMonitoring === "function") {
    window.renderMonitoring = function renderMonitoringWithFusionSolar(...args) {
      const result = baseRenderMonitoring.apply(this, args);
      injectPanel();
      if (fusionState.status === "idle") testConnection();
      return result;
    };
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest?.("#fusionsolar-test-button")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    testConnection(true);
  }, true);
})();
