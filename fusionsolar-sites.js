(() => {
  const baseRefreshMonitoring = refreshMonitoring;
  const baseRenderMonitoring = renderMonitoring;
  const baseOnAction = onAction;

  const fusion = {
    status: "idle",
    data: null,
    message: "",
    promise: null,
    detailCache: new Map(),
    pending: new Map(),
    selectedPlant: new Map(),
  };

  const esc = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const num = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const fmt = (value, unit = "", digits = 2) => {
    const n = num(value);
    return n === null ? "-" : `${n.toLocaleString("en-ZA", { maximumFractionDigits: digits })}${unit ? ` ${unit}` : ""}`;
  };
  const norm = (value) => String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

  function installStyles() {
    if (document.getElementById("fusion-sites-style")) return;
    const style = document.createElement("style");
    style.id = "fusion-sites-style";
    style.textContent = `
      .fs-site-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px;flex-wrap:wrap}
      .fs-site-head h2{margin:2px 0 5px}
      .fs-controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      .fs-select{min-width:260px;padding:10px 12px;border:1px solid #d9dce6;border-radius:4px;background:#fff;font:inherit;color:inherit}
      .fs-kpis{display:grid;grid-template-columns:repeat(6,minmax(130px,1fr));gap:10px;margin-bottom:16px}
      .fs-kpi{padding:14px;background:#fff;border:1px solid #e3e5eb;border-radius:4px;display:grid;gap:5px}
      .fs-kpi span,.fs-kpi small{font-size:11px;color:#6b7280}.fs-kpi strong{font-size:20px}
      .fs-plant-grid{display:grid;gap:8px}
      .fs-plant-row{display:grid;grid-template-columns:minmax(180px,1.3fr) minmax(180px,2fr) 110px 110px 105px;gap:12px;align-items:center;padding:11px 12px;border:1px solid #e5e7eb;border-radius:4px;background:#fff}
      .fs-plant-name{display:flex;align-items:center;gap:9px;min-width:0}.fs-swatch{width:10px;height:10px;border-radius:50%;flex:0 0 auto}
      .fs-bar-track{height:8px;background:#eef0f4;border-radius:999px;overflow:hidden}.fs-bar{height:100%;border-radius:999px;min-width:2px}
      .fs-device-list{display:grid;gap:7px}.fs-device-row{display:grid;grid-template-columns:minmax(180px,1.5fr) 150px 130px 1fr;gap:12px;padding:10px 0;border-bottom:1px solid #eceef2;font-size:12px}
      .fs-bess-grid{display:grid;gap:8px}.fs-bess-row{display:grid;grid-template-columns:minmax(210px,1.5fr) repeat(5,minmax(105px,1fr));gap:12px;align-items:center;padding:12px;border:1px solid #e5e7eb;border-radius:4px;background:#fff;font-size:12px}.fs-bess-row strong{font-size:13px}.fs-bess-flow{font-weight:700}
      .fs-badge{display:inline-flex;padding:4px 8px;border-radius:999px;background:#f3f4f6;font-size:11px}.fs-badge.ok{background:#ecfdf3;color:#166534}.fs-badge.warn{background:#fff7ed;color:#9a3412}.fs-badge.bad{background:#fef2f2;color:#991b1b}
      .fs-empty{padding:18px;border:1px dashed #d8dbe3;border-radius:4px;color:#6b7280;background:#fafafa}
      .fs-api-note{margin:0 0 12px;color:#6b7280;font-size:12px}
      @media(max-width:1000px){.fs-kpis{grid-template-columns:repeat(3,minmax(120px,1fr))}.fs-plant-row{grid-template-columns:1fr 1.4fr 90px 90px}.fs-plant-row>:last-child{display:none}.fs-bess-row{grid-template-columns:1fr 1fr 1fr}.fs-bess-row>:nth-child(n+4){display:none}}
    `;
    document.head.appendChild(style);
  }

  function mappedNames(system) {
    return Array.isArray(system?.fusionSolarPlants) ? system.fusionSolarPlants : [];
  }

  function mappedPlants(system) {
    const wanted = new Set(mappedNames(system).map(norm));
    return (fusion.data?.systems || []).filter((plant) => wanted.has(norm(plant.name)));
  }

  function worstStatus(plants) {
    const statuses = plants.map((plant) => plant.status);
    if (statuses.includes("Non-operational")) return "Non-operational";
    if (statuses.includes("Attention required")) return "Attention required";
    if (statuses.includes("Operational")) return "Operational";
    return "Unknown";
  }

  function sum(plants, key) {
    const values = plants.map((plant) => num(plant[key])).filter((value) => value !== null);
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
  }

  function syntheticTelemetry(system) {
    const plants = mappedPlants(system);
    if (!plants.length) return null;
    return {
      _fusionSynthetic: true,
      systemId: system.id,
      provider: "FusionSolar",
      providerStationId: plants[0].providerStationId,
      providerStationIds: plants.map((plant) => plant.providerStationId),
      name: system.name,
      status: worstStatus(plants),
      powerKw: sum(plants, "powerKw"),
      energyTodayKwh: sum(plants, "energyTodayKwh"),
      energyMonthKwh: sum(plants, "energyMonthKwh"),
      energyTotalKwh: sum(plants, "energyTotalKwh"),
      lastSync: fusion.data?.fetchedAt || null,
      deviceSummary: { total: 0, online: 0, offline: 0, alert: 0 },
      activeAlerts: [],
      fusionPlantCount: plants.length,
    };
  }

  function updateWorkspaceCapacities() {
    let changed = false;
    systems.forEach((system) => {
      if (!mappedNames(system).length) return;
      const plants = mappedPlants(system);
      if (!plants.length) return;
      const capacity = sum(plants, "installedCapacityKw");
      if ((system.kwp === null || system.kwp === undefined || system.kwp === "") && capacity !== null) {
        system.kwp = capacity;
        changed = true;
      }
      if (!String(system.monitoring || "").includes("FusionSolar")) {
        system.monitoring = `${plants.length} FusionSolar plant${plants.length === 1 ? "" : "s"} linked through Northbound API`;
        changed = true;
      }
    });
    if (changed) saveWorkspace();
  }

  function mergeIntoMonitoringState() {
    if (!fusion.data?.systems) return;
    if (!monitoringState.data) {
      monitoringState.data = { configured: true, fetchedAt: fusion.data.fetchedAt, systems: [], provider: "Monitoring" };
      monitoringState.status = "ready";
    }
    const existing = (monitoringState.data.systems || []).filter((item) => !item._fusionSynthetic);
    const mapped = systems.map((system) => syntheticTelemetry(system)).filter(Boolean);
    monitoringState.data.systems = [...existing, ...mapped];
    monitoringState.data.fusionSolar = { configured: true, fetchedAt: fusion.data.fetchedAt, plantCount: fusion.data.systems.length };
    monitoringState.data.configured = Boolean(monitoringState.data.configured || mapped.length);
    monitoringState.data.fetchedAt = fusion.data.fetchedAt || monitoringState.data.fetchedAt;
    updateWorkspaceCapacities();
  }

  async function refreshFusion(force = false) {
    if (fusion.promise && !force) return fusion.promise;
    fusion.status = "loading";
    fusion.promise = (async () => {
      try {
        const response = await fetch("/api/fusionsolar", { cache: "no-store", headers: { Accept: "application/json" } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.connected === false || payload.configured === false) throw new Error(payload.message || `FusionSolar HTTP ${response.status}`);
        fusion.data = payload;
        fusion.status = "ready";
        fusion.message = payload.message || "FusionSolar connected.";
        mergeIntoMonitoringState();
      } catch (error) {
        fusion.status = "error";
        fusion.message = error?.message || "FusionSolar could not be loaded.";
      } finally {
        fusion.promise = null;
      }
      return fusion.data;
    })();
    return fusion.promise;
  }

  refreshMonitoring = async function refreshAllMonitoring() {
    const deyeResult = await baseRefreshMonitoring();
    await refreshFusion();
    mergeIntoMonitoringState();
    if (state.view === "monitoring") renderMonitoring();
    return deyeResult;
  };

  function patchOverviewLabels() {
    if (state.view !== "monitoring") return;
    const subtitle = appView.querySelector(".subtitle");
    if (subtitle && fusion.status === "ready") {
      const deyeCount = (monitoringState.data?.systems || []).filter((item) => !item._fusionSynthetic).length;
      const fusionSites = systems.filter((system) => syntheticTelemetry(system)).length;
      subtitle.innerHTML = `<span class="status-dot is-live"></span>Live monitoring connected | ${deyeCount} Deye station${deyeCount === 1 ? "" : "s"} | ${fusion.data?.systems?.length || 0} FusionSolar plants mapped into ${fusionSites} workspace site${fusionSites === 1 ? "" : "s"}.`;
    }
    const firstStat = appView.querySelector(".monitoring-stat-grid .stat-card:first-child span:last-child");
    if (firstStat && fusion.status === "ready") firstStat.textContent = "Combined reporting across Deye and FusionSolar";
  }

  renderMonitoring = function renderMonitoringWithFusionSolar(...args) {
    const result = baseRenderMonitoring.apply(this, args);
    patchOverviewLabels();
    if (fusion.status === "idle") {
      refreshFusion().then(() => {
        mergeIntoMonitoringState();
        if (state.view === "monitoring") renderMonitoring();
      });
    }
    return result;
  };

  function statusBadge(status) {
    const tone = status === "Operational" ? "ok" : status === "Non-operational" ? "bad" : status === "Attention required" ? "warn" : "";
    return `<span class="fs-badge ${tone}">${esc(status || "Unknown")}</span>`;
  }

  function plantColour(index) {
    const hue = (index * 67 + 205) % 360;
    return `hsl(${hue} 62% 46%)`;
  }

  function selectedBessDevices(detail, selectedCode) {
    const devices = Array.isArray(detail?.bessDevices) ? detail.bessDevices : [];
    if (!selectedCode || selectedCode === "all") return devices;
    return devices.filter((device) => String(device.stationCode || "") === String(selectedCode));
  }

  function bessAggregate(devices) {
    const socs = devices.map((item) => num(item.soc)).filter((value) => value !== null);
    const sohs = devices.map((item) => num(item.soh)).filter((value) => value !== null);
    const signed = devices.map((item) => num(item.signedPowerKw)).filter((value) => value !== null);
    const charged = devices.map((item) => num(item.chargeTodayKwh)).filter((value) => value !== null);
    const discharged = devices.map((item) => num(item.dischargeTodayKwh)).filter((value) => value !== null);
    return {
      batterySoc: socs.length ? socs.reduce((total, value) => total + value, 0) / socs.length : null,
      batterySoh: sohs.length ? sohs.reduce((total, value) => total + value, 0) / sohs.length : null,
      chargePowerKw: signed.length ? signed.filter((value) => value > 0).reduce((total, value) => total + value, 0) : null,
      dischargePowerKw: signed.length ? signed.filter((value) => value < 0).reduce((total, value) => total + Math.abs(value), 0) : null,
      chargeTodayKwh: charged.length ? charged.reduce((total, value) => total + value, 0) : null,
      dischargeTodayKwh: discharged.length ? discharged.reduce((total, value) => total + value, 0) : null,
    };
  }

  function selectedMetrics(detail, selectedCode) {
    if (!selectedCode || selectedCode === "all") return detail.aggregate || {};
    const plant = detail.plants.find((item) => item.providerStationId === selectedCode) || {};
    const bess = selectedBessDevices(detail, selectedCode);
    return bess.length ? { ...plant, ...bessAggregate(bess) } : plant;
  }

  function selectedDevices(detail, selectedCode) {
    const devices = Array.isArray(detail.devices) ? detail.devices : [];
    if (!selectedCode || selectedCode === "all") return devices;
    return devices.filter((device) => String(device.stationCode || "") === String(selectedCode));
  }

  function bessFlow(device) {
    const signed = num(device?.signedPowerKw);
    if (signed === null) return "-";
    if (signed > 0.001) return `Charging ${fmt(signed, "kW")}`;
    if (signed < -0.001) return `Discharging ${fmt(Math.abs(signed), "kW")}`;
    return "Idle 0 kW";
  }

  function detailHtml(system, detail) {
    installStyles();
    const selected = fusion.selectedPlant.get(system.id) || "all";
    const metrics = selectedMetrics(detail, selected);
    const visiblePlants = selected === "all" ? detail.plants : detail.plants.filter((plant) => plant.providerStationId === selected);
    const devices = selectedDevices(detail, selected);
    const bessDevices = selectedBessDevices(detail, selected);
    const maxPower = Math.max(0.001, ...visiblePlants.map((plant) => Math.max(0, num(plant.powerKw) || 0)));
    const selectionLabel = selected === "all" ? `${detail.plants.length} plants combined` : (visiblePlants[0]?.name || "Selected plant");
    const essInventoryExists = devices.some((device) => Number(device.typeId) === 41);
    const liveEssMissing = essInventoryExists && !bessDevices.length;
    const nextAllowed = detail.realtimeRequest?.nextAllowedAt ? new Date(detail.realtimeRequest.nextAllowedAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "";

    return `
      <div class="fs-site-head">
        <div><p class="eyebrow">${esc(system.id)} | FUSIONSOLAR NORTHBOUND</p><h2>${esc(system.name)}</h2><p class="muted">${esc(selectionLabel)} | SG5 | Singapore API region</p></div>
        <div class="fs-controls">
          <select class="fs-select" id="fusion-plant-select" data-system-id="${esc(system.id)}">
            <option value="all" ${selected === "all" ? "selected" : ""}>All plants combined</option>
            ${detail.plants.map((plant) => `<option value="${esc(plant.providerStationId)}" ${selected === plant.providerStationId ? "selected" : ""}>${esc(plant.name)}</option>`).join("")}
          </select>
          <button class="button button-muted" data-action="refresh-fusionsolar-site" data-id="${esc(system.id)}">Refresh site</button>
        </div>
      </div>
      <div class="fs-kpis">
        <div class="fs-kpi"><span>PV power now</span><strong>${fmt(metrics.powerKw, "kW")}</strong><small>${selected === "all" ? "Combined" : "Selected plant"}</small></div>
        <div class="fs-kpi"><span>Generation today</span><strong>${fmt(metrics.energyTodayKwh, "kWh")}</strong><small>Daily energy</small></div>
        <div class="fs-kpi"><span>Installed PV</span><strong>${fmt(metrics.installedCapacityKw, "kWp")}</strong><small>FusionSolar capacity</small></div>
        <div class="fs-kpi"><span>BESS SOC</span><strong>${fmt(metrics.batterySoc, "%", 1)}</strong><small>Huawei ESS type 41</small></div>
        <div class="fs-kpi"><span>Charge</span><strong>${fmt(metrics.chargePowerKw, "kW")}</strong><small>Positive ESS power</small></div>
        <div class="fs-kpi"><span>Discharge</span><strong>${fmt(metrics.dischargePowerKw, "kW")}</strong><small>Negative ESS power</small></div>
      </div>
      ${liveEssMissing ? `<p class="fs-api-note">Huawei returned the ESS inventory, but the live type 41 KPI call is waiting for the Northbound rate-limit window${nextAllowed ? ` | next safe refresh after ${esc(nextAllowed)}` : ""}. No BESS value is being guessed.</p>` : ""}
      ${bessDevices.length ? `<section class="surface monitor-section">
        <div class="surface-title"><h3>BESS / ESS</h3><span class="muted">Live Huawei C&I / utility ESS data</span></div>
        <div class="fs-bess-grid">
          ${bessDevices.map((device) => `<div class="fs-bess-row"><span><strong>${esc(device.name || "ESS")}</strong><br><small>${esc(device.model || device.sn || "Huawei ESS")}</small></span><span><small>SOC</small><br><strong>${fmt(device.soc, "%", 1)}</strong></span><span><small>Power</small><br><span class="fs-bess-flow">${esc(bessFlow(device))}</span></span><span><small>Charged today</small><br><strong>${fmt(device.chargeTodayKwh, "kWh")}</strong></span><span><small>Discharged today</small><br><strong>${fmt(device.dischargeTodayKwh, "kWh")}</strong></span><span><small>SOH</small><br><strong>${fmt(device.soh, "%", 1)}</strong></span></div>`).join("")}
        </div>
      </section>` : ""}
      <section class="surface monitor-section">
        <div class="surface-title"><h3>Plant contribution</h3><span class="muted">${selected === "all" ? "Combined site with colour split" : "Selected FusionSolar plant"}</span></div>
        <div class="fs-plant-grid">
          ${visiblePlants.map((plant) => {
            const index = detail.plants.findIndex((item) => item.providerStationId === plant.providerStationId);
            const colour = plantColour(index);
            const width = Math.max(2, ((num(plant.powerKw) || 0) / maxPower) * 100);
            return `<div class="fs-plant-row"><div class="fs-plant-name"><span class="fs-swatch" style="background:${colour}"></span><span><strong>${esc(plant.name)}</strong><br><small>${esc(plant.providerStationId)}</small></span></div><div class="fs-bar-track"><div class="fs-bar" style="width:${width}%;background:${colour}"></div></div><strong>${fmt(plant.powerKw, "kW")}</strong><strong>${fmt(plant.energyTodayKwh, "kWh")}</strong>${statusBadge(plant.status)}</div>`;
          }).join("") || `<div class="fs-empty">No mapped FusionSolar plants were returned.</div>`}
        </div>
      </section>
      <section class="surface monitor-section">
        <div class="surface-title"><h3>Devices</h3><span class="muted">${devices.length} device${devices.length === 1 ? "" : "s"} in ${esc(selectionLabel)}</span></div>
        <div class="fs-device-list">
          ${devices.map((device) => `<div class="fs-device-row"><strong>${esc(device.name || device.typeName || "Device")}</strong><span>${esc(device.typeName || `Type ${device.typeId || "-"}`)}</span><span>${esc(device.model || "Model not returned")}</span><span>SN ${esc(device.sn || "-")}</span></div>`).join("") || `<div class="fs-empty">No devices returned for this selection.</div>`}
        </div>
      </section>
      <section class="surface monitor-section">
        <div class="surface-title"><h3>FusionSolar alarms</h3><span class="muted">${detail.alarms?.length || 0} returned</span></div>
        ${(detail.alarms || []).length ? `<div class="fs-device-list">${detail.alarms.slice(0, 50).map((alarm) => `<div class="fs-device-row"><strong>${esc(alarm.alarmName || alarm.name || alarm.alarmId || "Alarm")}</strong><span>${esc(alarm.stationCode || alarm.plantCode || "")}</span><span>${esc(alarm.devName || alarm.deviceName || "")}</span><span>${esc(alarm.alarmCause || alarm.cause || alarm.status || "")}</span></div>`).join("")}</div>` : `<div class="fs-empty">No FusionSolar alarms returned.</div>`}
      </section>`;
  }

  async function loadFusionDetail(systemId, force = false) {
    if (!force && fusion.detailCache.has(systemId)) return fusion.detailCache.get(systemId);
    if (fusion.pending.has(systemId)) return fusion.pending.get(systemId);
    const system = getSystem(systemId);
    if (!system) return null;

    const request = (async () => {
      if (!fusion.data) await refreshFusion();
      const plants = mappedPlants(system);
      const codes = plants.map((plant) => plant.providerStationId).filter(Boolean);
      if (!codes.length) throw new Error(`No FusionSolar plants are mapped to ${system.name}.`);
      const response = await fetch(`/api/fusionsolar?stationCodes=${encodeURIComponent(codes.join(","))}`, { cache: "no-store", headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.detail) throw new Error(payload.message || "FusionSolar site detail could not be loaded.");
      fusion.detailCache.set(systemId, payload.detail);
      return payload.detail;
    })().finally(() => fusion.pending.delete(systemId));

    fusion.pending.set(systemId, request);
    return request;
  }

  function renderFusionSite(systemId, force = false) {
    const system = getSystem(systemId);
    if (!system || !mappedNames(system).length) return baseOnAction("open-monitoring-site", systemId);
    state.view = "monitoring-site";
    state.monitoringSystem = systemId;
    pageHeader("Monitoring", "O&M / SITE MONITORING");
    backButton.hidden = false;

    const cached = force ? null : fusion.detailCache.get(systemId);
    if (cached) {
      appView.innerHTML = detailHtml(system, cached);
      return;
    }

    appView.innerHTML = `<div class="monitor-site-loading"><span class="monitor-spinner"></span><div><h2>${esc(system.name)}</h2><p>Loading the mapped FusionSolar plant${mappedNames(system).length === 1 ? "" : "s"} and device inventory…</p></div></div>`;
    loadFusionDetail(systemId, force).then((detail) => {
      if (state.view === "monitoring-site" && state.monitoringSystem === systemId && detail) appView.innerHTML = detailHtml(system, detail);
    }).catch((error) => {
      if (state.view === "monitoring-site" && state.monitoringSystem === systemId) appView.innerHTML = `<div class="monitor-site-error"><h2>${esc(system.name)}</h2><p>${esc(error.message || error)}</p><button class="button button-primary" data-action="refresh-fusionsolar-site" data-id="${esc(systemId)}">Try again</button></div>`;
    });
  }

  onAction = function onActionWithFusionSolar(action, id) {
    const system = getSystem(id);
    const isFusion = Boolean(system && mappedNames(system).length);
    if (isFusion && ["open-monitoring-site", "view-monitoring"].includes(action)) return renderFusionSite(id);
    if (action === "refresh-fusionsolar-site") return renderFusionSite(id, true);
    return baseOnAction(action, id);
  };

  document.addEventListener("change", (event) => {
    const select = event.target.closest?.("#fusion-plant-select");
    if (!select) return;
    const systemId = select.dataset.systemId;
    fusion.selectedPlant.set(systemId, select.value || "all");
    const detail = fusion.detailCache.get(systemId);
    const system = getSystem(systemId);
    if (detail && system && state.view === "monitoring-site" && state.monitoringSystem === systemId) appView.innerHTML = detailHtml(system, detail);
  });

  window.fusionSolarMonitoring = fusion;
})();