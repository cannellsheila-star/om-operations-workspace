(() => {
  const VERSION = "portfolio-live-v1-20260916";
  const baseRenderMonitoring = window.renderMonitoring;
  const filters = { search: "", provider: "all", status: "all", battery: "all" };

  const esc = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const num = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const norm = (value) => String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  const firstNum = (...values) => {
    for (const value of values) {
      const n = num(value);
      if (n !== null) return n;
    }
    return null;
  };
  const fmt = (value, unit = "", digits = 1) => {
    const n = num(value);
    return n === null ? "—" : `${n.toLocaleString("en-ZA", { maximumFractionDigits: digits })}${unit ? ` ${unit}` : ""}`;
  };

  function installStyles() {
    if (document.getElementById("portfolio-live-style")) return;
    const style = document.createElement("style");
    style.id = "portfolio-live-style";
    style.textContent = `
      .plive-toolbar{display:grid;grid-template-columns:minmax(220px,1.6fr) repeat(3,minmax(150px,.8fr));gap:10px;margin:0 0 12px;padding:14px;border:1px solid var(--line,#e1e5eb);border-radius:12px;background:linear-gradient(180deg,#fff,#fbfcfe)}
      .plive-field{display:grid;gap:5px}.plive-field label{font-size:10px;text-transform:uppercase;letter-spacing:.055em;font-weight:800;color:#697386}.plive-field input,.plive-field select{height:39px;width:100%;border:1px solid var(--line,#d8dde6);border-radius:8px;background:#fff;color:inherit;padding:0 10px;font:inherit;outline:none}.plive-field input:focus,.plive-field select:focus{border-color:#334155;box-shadow:0 0 0 2px rgba(51,65,85,.08)}
      .plive-wrap{border:1px solid var(--line,#e1e5eb);border-radius:12px;background:#fff;overflow:auto;box-shadow:0 6px 20px rgba(15,23,42,.035)}
      .plive-table{min-width:1180px}.plive-head,.plive-row{display:grid;grid-template-columns:minmax(215px,1.65fr) 155px 110px 140px 125px 145px 210px 78px;gap:12px;align-items:center;padding:11px 15px}
      .plive-head{position:sticky;top:0;z-index:2;background:#f6f8fb;border-bottom:1px solid var(--line,#dde2ea);font-size:10px;text-transform:uppercase;letter-spacing:.055em;font-weight:800;color:#667085}
      .plive-row{width:100%;min-height:72px;border:0;border-bottom:1px solid var(--line,#edf0f4);background:#fff;color:inherit;text-align:left;font:inherit;cursor:pointer;transition:background .14s ease,box-shadow .14s ease}.plive-row:last-child{border-bottom:0}.plive-row:hover{background:#f9fbfd;box-shadow:inset 3px 0 0 #334155}
      .plive-site{display:grid;gap:3px}.plive-site strong{font-size:14px}.plive-site small,.plive-muted{font-size:10px;color:#7b8493}.plive-source{display:inline-flex;width:max-content;max-width:100%;padding:4px 8px;border-radius:999px;background:#eef2f6;color:#3f4a5a;font-size:10px;font-weight:750}
      .plive-status{display:grid;gap:4px}.plive-status-main{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:750}.plive-dot{width:8px;height:8px;border-radius:50%;background:#98a2b3}.plive-dot.live{background:#12966f}.plive-dot.warn{background:#d28a18}.plive-dot.bad{background:#c94242}.plive-age{font-size:10px;color:#7b8493}
      .plive-metric{display:grid;gap:3px}.plive-metric strong{font-size:13px}.plive-metric small{font-size:10px;color:#7b8493}.plive-gridflow{font-weight:750;font-size:12px}.plive-gridflow.import{color:#7c3f18}.plive-gridflow.export{color:#08745a}.plive-gridflow.neutral{color:#667085}
      .plive-battery{display:grid;grid-template-columns:54px 1fr;gap:9px;align-items:center}.plive-soc{display:grid;gap:4px}.plive-soc strong{font-size:12px}.plive-socbar{height:6px;border-radius:999px;background:#edf0f4;overflow:hidden}.plive-socbar i{display:block;height:100%;border-radius:999px;background:#3d6f9c}.plive-battmeta{display:grid;gap:2px}.plive-battmeta strong{font-size:11px}.plive-battmeta small{font-size:10px;color:#7b8493}
      .plive-alarm{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;border-radius:9px;background:#f3f5f7;font-size:11px;font-weight:800}.plive-alarm.hot{background:#fff0ec;color:#b33b28}
      .plive-empty{padding:28px;text-align:center;color:#7b8493}
      .plive-summary-note{font-size:11px;color:#697386;margin-top:2px}
      @media(max-width:900px){.plive-toolbar{grid-template-columns:1fr 1fr}.plive-field:first-child{grid-column:1/-1}}
      @media(max-width:600px){.plive-toolbar{grid-template-columns:1fr}.plive-field:first-child{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }

  function exactTelemetry(system) {
    const feeds = typeof monitoringState !== "undefined" ? (monitoringState.data?.systems || []) : [];
    const exact = feeds.find((item) => String(item.systemId || "") === String(system.id));
    if (exact) return exact;
    const target = norm(system.name);
    return feeds.find((item) => !item._fusionSynthetic && norm(item.name) === target) || null;
  }

  function fusionDetail(system) {
    const cache = window.fusionSolarMonitoring?.detailCache;
    return cache instanceof Map ? cache.get(system.id) || null : null;
  }

  function providerLabel(system, telemetry) {
    if (Array.isArray(system.fusionSolarPlants) && system.fusionSolarPlants.length) return "FusionSolar";
    return telemetry?.provider || system.platform || "Not connected";
  }

  function statusClass(status) {
    const value = String(status || "").toLowerCase();
    if (value.includes("non") || value.includes("offline") || value.includes("fault")) return "bad";
    if (value.includes("attention") || value.includes("warning") || value.includes("degraded")) return "warn";
    if (value.includes("operational") || value.includes("online") || value.includes("normal")) return "live";
    return "";
  }

  function signalTime(telemetry, detail) {
    return telemetry?.lastSync || detail?.fetchedAt || window.fusionSolarMonitoring?.data?.fetchedAt || (typeof monitoringState !== "undefined" ? monitoringState.data?.fetchedAt : null) || null;
  }

  function ageLabel(value) {
    const d = value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) return "No timestamp";
    const seconds = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    return `${Math.round(hours / 24)} d ago`;
  }

  function metricsFor(system, telemetry) {
    const detail = fusionDetail(system);
    const agg = detail?.aggregate || {};
    const pv = firstNum(telemetry?.powerKw, telemetry?.pvPowerKw, agg.powerKw, agg.pvPowerKw);
    const load = firstNum(telemetry?.consumptionPowerKw, telemetry?.loadPowerKw, agg.consumptionPowerKw, agg.loadPowerKw);
    const gridNet = firstNum(telemetry?.gridPowerKw, agg.gridPowerKw);
    const gridImport = firstNum(telemetry?.purchasePowerKw, telemetry?.gridImportPowerKw, agg.purchasePowerKw, agg.gridImportPowerKw);
    const gridExport = firstNum(telemetry?.gridExportPowerKw, agg.gridExportPowerKw);
    const soc = firstNum(telemetry?.batterySoc, agg.batterySoc);
    const charge = firstNum(telemetry?.chargePowerKw, agg.chargePowerKw);
    const discharge = firstNum(telemetry?.dischargePowerKw, agg.dischargePowerKw);
    const batteryPower = firstNum(telemetry?.batteryPowerKw, agg.batteryPowerKw, charge !== null || discharge !== null ? (charge || 0) - (discharge || 0) : null);
    const alarmDirect = Array.isArray(telemetry?.activeAlerts) ? telemetry.activeAlerts.length : null;
    const alarms = firstNum(alarmDirect, agg.alarmCount, Array.isArray(detail?.alarms) ? detail.alarms.length : null);
    const hasBattery = soc !== null || charge !== null || discharge !== null || num(system.kwh) !== null;
    return { detail, pv, load, gridNet, gridImport, gridExport, soc, charge, discharge, batteryPower, alarms, hasBattery };
  }

  function gridDisplay(metrics) {
    if (metrics.gridImport !== null && metrics.gridImport > 0.01) return { text: `Import ${fmt(metrics.gridImport, "kW", 1)}`, cls: "import", sub: metrics.gridExport !== null ? `Export ${fmt(metrics.gridExport, "kW", 1)}` : "From grid" };
    if (metrics.gridExport !== null && metrics.gridExport > 0.01) return { text: `Export ${fmt(metrics.gridExport, "kW", 1)}`, cls: "export", sub: "To grid" };
    if (metrics.gridNet !== null) return { text: fmt(Math.abs(metrics.gridNet), "kW", 1), cls: "neutral", sub: "Net grid flow" };
    return { text: "—", cls: "neutral", sub: "No live grid value" };
  }

  function batteryDisplay(metrics) {
    if (!metrics.hasBattery) return `<span class="plive-muted">No BESS</span>`;
    const soc = metrics.soc;
    const width = soc === null ? 0 : Math.max(0, Math.min(100, soc));
    let direction = "Idle";
    let power = metrics.batteryPower;
    if (metrics.charge !== null && metrics.charge > 0.01) { direction = "Charging"; power = metrics.charge; }
    else if (metrics.discharge !== null && metrics.discharge > 0.01) { direction = "Discharging"; power = metrics.discharge; }
    else if (power !== null && Math.abs(power) > 0.01) direction = power > 0 ? "Charging" : "Discharging";
    return `<span class="plive-battery"><span class="plive-soc"><strong>${fmt(soc, "%", 0)}</strong><span class="plive-socbar"><i style="width:${width}%"></i></span></span><span class="plive-battmeta"><strong>${esc(direction)}</strong><small>${power === null ? "Power unavailable" : fmt(Math.abs(power), "kW", 1)}</small></span></span>`;
  }

  function filteredRows() {
    const rows = (window.systems || []).map((system) => {
      const telemetry = exactTelemetry(system);
      const metrics = metricsFor(system, telemetry);
      const provider = providerLabel(system, telemetry);
      const status = telemetry?.status || system.status || "Not confirmed";
      return { system, telemetry, metrics, provider, status };
    });
    return rows.filter((row) => {
      const search = norm(filters.search);
      if (search && !norm(`${row.system.name} ${row.system.id} ${row.provider}`).includes(search)) return false;
      if (filters.provider !== "all" && row.provider !== filters.provider) return false;
      if (filters.status !== "all" && statusClass(row.status) !== filters.status) return false;
      if (filters.battery === "yes" && !row.metrics.hasBattery) return false;
      if (filters.battery === "no" && row.metrics.hasBattery) return false;
      return true;
    });
  }

  function toolbarHtml(rows) {
    const providers = [...new Set(rows.map((row) => row.provider).filter(Boolean))].sort();
    return `<div class="plive-toolbar" data-plive-toolbar>
      <div class="plive-field"><label>Find site</label><input type="search" data-plive-filter="search" value="${esc(filters.search)}" placeholder="Search site or system ID"></div>
      <div class="plive-field"><label>Monitoring source</label><select data-plive-filter="provider"><option value="all">All sources</option>${providers.map((provider) => `<option value="${esc(provider)}" ${filters.provider === provider ? "selected" : ""}>${esc(provider)}</option>`).join("")}</select></div>
      <div class="plive-field"><label>Site status</label><select data-plive-filter="status"><option value="all">All statuses</option><option value="live" ${filters.status === "live" ? "selected" : ""}>Operational</option><option value="warn" ${filters.status === "warn" ? "selected" : ""}>Attention</option><option value="bad" ${filters.status === "bad" ? "selected" : ""}>Offline / fault</option></select></div>
      <div class="plive-field"><label>Battery</label><select data-plive-filter="battery"><option value="all">All sites</option><option value="yes" ${filters.battery === "yes" ? "selected" : ""}>BESS sites</option><option value="no" ${filters.battery === "no" ? "selected" : ""}>PV only</option></select></div>
    </div>`;
  }

  function tableHtml(rows) {
    if (!rows.length) return `<div class="plive-wrap"><div class="plive-empty">No sites match these filters.</div></div>`;
    return `<div class="plive-wrap"><div class="plive-table">
      <div class="plive-head"><span>Site</span><span>Status / last data</span><span>Source</span><span>PV output</span><span>Load</span><span>Grid flow</span><span>Battery</span><span>Alarms</span></div>
      ${rows.map(({ system, telemetry, metrics, provider, status }) => {
        const grid = gridDisplay(metrics);
        const age = ageLabel(signalTime(telemetry, metrics.detail));
        const pvPct = metrics.pv !== null && num(system.kwp) ? Math.max(0, (metrics.pv / Number(system.kwp)) * 100) : null;
        const alarmCount = metrics.alarms === null ? null : Math.max(0, Math.round(metrics.alarms));
        return `<button class="plive-row" type="button" data-smv2-open="${esc(system.id)}">
          <span class="plive-site"><strong>${esc(system.name)}</strong><small>${esc(system.id)} · ${fmt(system.kwp, "kWp", 1)}${num(system.kwh) ? ` · ${fmt(system.kwh, "kWh", 0)} BESS` : ""}</small></span>
          <span class="plive-status"><span class="plive-status-main"><i class="plive-dot ${statusClass(status)}"></i>${esc(status)}</span><span class="plive-age">${esc(age)}</span></span>
          <span><span class="plive-source">${esc(provider)}</span></span>
          <span class="plive-metric"><strong>${fmt(metrics.pv, "kW", 1)}</strong><small>${pvPct === null ? "Live PV" : `${pvPct.toLocaleString("en-ZA", { maximumFractionDigits: 1 })}% of installed`}</small></span>
          <span class="plive-metric"><strong>${fmt(metrics.load, "kW", 1)}</strong><small>Site demand</small></span>
          <span class="plive-metric"><strong class="plive-gridflow ${grid.cls}">${esc(grid.text)}</strong><small>${esc(grid.sub)}</small></span>
          ${batteryDisplay(metrics)}
          <span><span class="plive-alarm ${alarmCount > 0 ? "hot" : ""}">${alarmCount === null ? "—" : alarmCount}</span></span>
        </button>`;
      }).join("")}
    </div></div>`;
  }

  function renderPortfolioLive() {
    if (typeof state === "undefined" || state.view !== "monitoring") return;
    const root = document.getElementById("app-view");
    if (!root) return;
    installStyles();

    const all = (window.systems || []).map((system) => {
      const telemetry = exactTelemetry(system);
      return { system, telemetry, metrics: metricsFor(system, telemetry), provider: providerLabel(system, telemetry), status: telemetry?.status || system.status || "Not confirmed" };
    });
    const rows = filteredRows();

    const sectionHeader = [...root.querySelectorAll(".section-header")].find((node) => node.querySelector("h2")?.textContent?.trim() === "Site performance");
    if (sectionHeader) {
      const muted = sectionHeader.querySelector(".muted");
      if (muted) muted.textContent = "Live portfolio view · click a site for detailed kW, kWh, SOC and device analysis";
    }

    const existingToolbar = root.querySelector("[data-plive-toolbar]");
    const oldTable = root.querySelector(".smv2-table, .plive-wrap");
    if (!oldTable) return;
    if (existingToolbar) existingToolbar.remove();
    oldTable.insertAdjacentHTML("beforebegin", toolbarHtml(all));
    const holder = document.createElement("div");
    holder.innerHTML = tableHtml(rows);
    oldTable.replaceWith(holder.firstElementChild);

    const statGrid = root.querySelector(".monitoring-stat-grid");
    if (statGrid) {
      const liveCount = all.filter((row) => statusClass(row.status) === "live").length;
      const reporting = all.filter((row) => row.telemetry || row.metrics.detail).length;
      const alarmTotal = all.map((row) => row.metrics.alarms).filter((v) => v !== null).reduce((a, b) => a + b, 0);
      const bessCount = all.filter((row) => row.metrics.hasBattery).length;
      statGrid.innerHTML = `
        <article class="stat-card"><span>Reporting now</span><strong>${reporting}/${all.length}</strong><span class="plive-summary-note">Sites with live monitoring data</span></article>
        <article class="stat-card"><span>Operational</span><strong>${liveCount}</strong><span class="plive-summary-note">Current site status</span></article>
        <article class="stat-card"><span>BESS sites</span><strong>${bessCount}</strong><span class="plive-summary-note">Battery-enabled systems</span></article>
        <article class="stat-card"><span>Active alarms</span><strong>${alarmTotal}</strong><span class="plive-summary-note">Across connected monitoring sources</span></article>`;
    }
  }

  if (typeof baseRenderMonitoring === "function") {
    window.renderMonitoring = function renderMonitoringWithPortfolioLive(...args) {
      const result = baseRenderMonitoring.apply(this, args);
      renderPortfolioLive();
      return result;
    };
    try { renderMonitoring = window.renderMonitoring; } catch {}
  }

  document.addEventListener("input", (event) => {
    const field = event.target.closest?.("[data-plive-filter]");
    if (!field) return;
    filters[field.dataset.pliveFilter] = field.value;
    renderPortfolioLive();
  });
  document.addEventListener("change", (event) => {
    const field = event.target.closest?.("[data-plive-filter]");
    if (!field) return;
    filters[field.dataset.pliveFilter] = field.value;
    renderPortfolioLive();
  });

  setInterval(() => {
    if (typeof state !== "undefined" && state.view === "monitoring" && document.querySelector(".plive-wrap")) renderPortfolioLive();
  }, 30000);

  if (typeof state !== "undefined" && state.view === "monitoring") renderPortfolioLive();
})();
