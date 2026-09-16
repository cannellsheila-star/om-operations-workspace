(() => {
  if (!document.querySelector('link[data-dev-ui]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'dev-ui.css?v=20260916-1';
    link.dataset.devUi = '1';
    document.head.appendChild(link);
  }

  const baseRenderMonitoring = window.renderMonitoring;

  const esc = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

  function sharedFusion() {
    return window.fusionSolarMonitoring || { status: "loading", data: null, message: "" };
  }

  function installStyles() {
    if (document.getElementById("fusion-status-style")) return;
    const style = document.createElement("style");
    style.id = "fusion-status-style";
    style.textContent = `
      .fusion-status{margin:0 0 16px;padding:11px 14px;display:flex;align-items:center;gap:9px;border:1px solid rgba(220,38,38,.30);border-radius:2px;background:rgba(220,38,38,.05)}
      .fusion-dot{width:9px;height:9px;border-radius:50%;background:#dc2626;box-shadow:0 0 0 3px rgba(220,38,38,.12);flex:0 0 auto}
      .fusion-status-copy{display:grid;gap:2px}.fusion-status-copy strong{font-size:13px}.fusion-status-copy span{font-size:11px;color:#6b7280}
    `;
    document.head.appendChild(style);
  }

  function injectPanel() {
    installStyles();
    if (typeof state === "undefined" || state.view !== "monitoring") return;
    const appView = document.getElementById("app-view");
    if (!appView) return;

    const fusion = sharedFusion();
    const existing = document.getElementById("fusion-status-card");

    if (fusion.status !== "error") {
      existing?.remove();
      return;
    }

    const checked = fusion.data?.fetchedAt
      ? new Date(fusion.data.fetchedAt).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })
      : "Not available";
    const html = `<section class="fusion-status" id="fusion-status-card">
      <span class="fusion-dot"></span>
      <div class="fusion-status-copy">
        <strong>FusionSolar connection issue</strong>
        <span>${esc(fusion.message || "FusionSolar SG5 could not be reached.")} | Last checked: ${esc(checked)}</span>
      </div>
    </section>`;

    if (existing) {
      if (existing.outerHTML !== html) existing.outerHTML = html;
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

(() => {
  function loadPortfolioMonitoringUi() {
    if (document.querySelector('script[data-portfolio-monitoring-ui]')) return;
    const script = document.createElement('script');
    script.src = 'portfolio-monitoring-ui.js?v=20260916-4';
    script.dataset.portfolioMonitoringUi = '1';
    script.async = false;
    document.body.appendChild(script);
  }

  function loadFusionLiveOverview() {
    if (document.querySelector('script[data-fusion-live-overview]')) return;
    const script = document.createElement('script');
    script.src = 'fusion-live-overview.js?v=20260916-1';
    script.dataset.fusionLiveOverview = '1';
    script.async = false;
    document.body.appendChild(script);
  }

  function loadSiteTicketManager() {
    if (document.querySelector('script[data-site-monitoring-tickets]')) return;
    const script = document.createElement('script');
    script.src = 'monitoring-site-ticketing.js?v=20260916-1';
    script.dataset.siteMonitoringTickets = '1';
    script.async = false;
    document.body.appendChild(script);
  }

  function startAutomaticMonitoringRefresh() {
    if (window.__automaticMonitoringRefreshStarted) return;
    window.__automaticMonitoringRefreshStarted = true;
    setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (typeof refreshMonitoring !== 'function') return;
      Promise.resolve(refreshMonitoring()).catch(() => {});
    }, 5 * 60 * 1000);
  }

  function loadMonitoringExtensions() {
    loadPortfolioMonitoringUi();
    loadFusionLiveOverview();
    loadSiteTicketManager();
    startAutomaticMonitoringRefresh();
  }

  if (document.readyState === 'complete') loadMonitoringExtensions();
  else window.addEventListener('load', loadMonitoringExtensions, { once: true });
})();