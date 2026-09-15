(() => {
  const baseRenderMonitoring = window.renderMonitoring;

  const esc = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

  function mappedSites() {
    if (!Array.isArray(window.systems)) return [];
    return window.systems.filter((system) => Array.isArray(system.fusionSolarPlants) && system.fusionSolarPlants.length);
  }

  function sharedFusion() {
    return window.fusionSolarMonitoring || { status: "loading", data: null, message: "" };
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
      .fusion-meta{font-size:12px;opacity:.72;margin-top:4px}
      .fusion-plants{display:flex;gap:8px;flex-wrap:wrap}
      .fusion-plant{font-size:12px;border:1px solid var(--line,#d8dee8);border-radius:999px;padding:5px 8px;background:#fff}
      .fusion-error{font-size:12px;padding:9px 10px;border:1px solid rgba(220,38,38,.35);border-radius:7px;background:rgba(220,38,38,.06)}
    `;
    document.head.appendChild(style);
  }

  function cardHtml() {
    const fusion = sharedFusion();
    const plants = Array.isArray(fusion.data?.systems) ? fusion.data.systems : [];
    const sites = mappedSites();
    const checked = fusion.data?.fetchedAt
      ? new Date(fusion.data.fetchedAt).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })
      : "Checking now";

    let dot = "loading";
    let label = "Connecting…";
    let detail = "FusionSolar SG5 is being checked automatically as Monitoring loads.";
    let body = "";

    if (fusion.status === "ready") {
      dot = "ok";
      label = "Connected";
      detail = `${plants.length} FusionSolar plant${plants.length === 1 ? "" : "s"} connected and mapped into ${sites.length} workspace site${sites.length === 1 ? "" : "s"}.`;
      if (sites.length) {
        body = `<div class="fusion-plants">${sites.map((site) => `<span class="fusion-plant">${esc(site.name)} · ${site.fusionSolarPlants.length} plant${site.fusionSolarPlants.length === 1 ? "" : "s"}</span>`).join("")}</div>`;
      }
    } else if (fusion.status === "error") {
      dot = "bad";
      label = "Connection failed";
      detail = "The automatic FusionSolar request failed.";
      body = `<div class="fusion-error">${esc(fusion.message || "FusionSolar connection failed.")}</div>`;
    }

    return `<section class="surface fusion-status" id="fusion-status-card">
      <div class="fusion-status-head">
        <div>
          <div class="fusion-status-title"><span class="fusion-dot ${dot}"></span><strong>FusionSolar SG5 · ${esc(label)}</strong></div>
          <div class="fusion-meta">${esc(detail)} · Last checked: ${esc(checked)}</div>
        </div>
      </div>
      ${body}
    </section>`;
  }

  function injectPanel() {
    installStyles();
    if (typeof state === "undefined" || state.view !== "monitoring") return;
    const appView = document.getElementById("app-view");
    if (!appView) return;
    const html = cardHtml();
    const existing = document.getElementById("fusion-status-card");
    if (existing) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;
      const next = wrapper.firstElementChild;
      if (next && existing.outerHTML !== next.outerHTML) existing.replaceWith(next);
      return;
    }
    appView.insertAdjacentHTML("afterbegin", html);
  }

  if (typeof baseRenderMonitoring === "function") {
    window.renderMonitoring = function renderMonitoringWithFusionSolarStatus(...args) {
      const result = baseRenderMonitoring.apply(this, args);
      injectPanel();
      return result;
    };
  }

  setInterval(() => {
    if (typeof state !== "undefined" && state.view === "monitoring") injectPanel();
  }, 1500);
})();
