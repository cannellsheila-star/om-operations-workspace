(() => {
  const VERSION = "standard-monitoring-v2-20260916";
  const baseRenderMonitoring = window.renderMonitoring || renderMonitoring;
  const baseOnAction = window.onAction || onAction;
  const nativeFetch = window.fetch.bind(window);
  const siteState = new Map();
  const detailCache = new Map();
  const rangeCache = new Map();
  const fusion = window.fusionSolarMonitoring || (window.fusionSolarMonitoring = { status: "idle", data: null, message: "", detailCache: new Map(), selectedPlant: new Map() });

  const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const num = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const norm = (value) => String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  const fmt = (value, unit = "", digits = 1) => {
    const n = num(value);
    return n === null ? "—" : `${n.toLocaleString("en-ZA", { maximumFractionDigits: digits })}${unit ? ` ${unit}` : ""}`;
  };
  const parseTime = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    const d = Number.isFinite(n) ? new Date(n < 100000000000 ? n * 1000 : n) : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const dateTime = (value) => {
    const d = value instanceof Date ? value : parseTime(value);
    return d ? d.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : "—";
  };
  const toLocalInput = (date) => {
    const d = date instanceof Date ? date : new Date(date);
    const p = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

  function installStyles() {
    if (document.getElementById("standard-monitoring-v2-style")) return;
    const style = document.createElement("style");
    style.id = "standard-monitoring-v2-style";
    style.textContent = `
      .smv2-summary{grid-template-columns:repeat(4,minmax(0,1fr))!important}
      .smv2-table{border:1px solid var(--line,#e2e5ec);border-radius:10px;overflow:hidden;background:#fff}
      .smv2-head,.smv2-row{display:grid;grid-template-columns:minmax(220px,2fr) 150px 125px 145px 130px 95px 160px;gap:12px;align-items:center;padding:12px 16px}
      .smv2-head{background:#f5f6f9;border-bottom:1px solid var(--line,#e2e5ec);font-size:11px;text-transform:uppercase;letter-spacing:.045em;font-weight:800;color:#4b5563}
      .smv2-row{width:100%;border:0;border-bottom:1px solid var(--line,#e8eaf0);background:#fff;color:inherit;text-align:left;font:inherit;cursor:pointer;min-height:78px}
      .smv2-row:last-child{border-bottom:0}.smv2-row:hover{background:#fafbfc}.smv2-site{display:grid;gap:3px}.smv2-site strong{font-size:14px}.smv2-site small,.smv2-subtle{font-size:11px;color:#6b7280}
      .smv2-value{font-weight:750}.smv2-provider{display:inline-flex;width:max-content;max-width:100%;padding:4px 8px;border-radius:999px;background:#f3f4f6;font-size:11px;font-weight:700}
      .smv2-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:7px;background:#9ca3af}.smv2-dot.live{background:#16a34a}.smv2-dot.warn{background:#d97706}.smv2-dot.bad{background:#dc2626}
      .smv2-shell{display:grid;gap:16px}.smv2-site-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;flex-wrap:wrap}.smv2-site-head h2{margin:3px 0 4px}.smv2-head-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .smv2-controls{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr)) auto;gap:10px;align-items:end;padding:16px}.smv2-field{display:grid;gap:6px}.smv2-field label{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#6b7280}.smv2-field input,.smv2-field select{width:100%;height:42px;border:1px solid var(--line,#d8dce5);border-radius:7px;background:#fff;color:inherit;padding:0 10px;font:inherit}.smv2-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .smv2-quick{display:flex;gap:7px;flex-wrap:wrap;padding:0 16px 16px}.smv2-quick button{border:1px solid var(--line,#d8dce5);background:#fff;border-radius:999px;padding:7px 11px;font:inherit;font-size:11px;cursor:pointer}.smv2-quick button:hover{background:#f8fafc}
      .smv2-live-kpis{display:grid;grid-template-columns:repeat(6,minmax(130px,1fr));gap:10px}.smv2-kpi{padding:14px 15px;border:1px solid var(--line,#e1e4ea);border-radius:9px;background:#fff;display:grid;gap:5px}.smv2-kpi span{font-size:10px;text-transform:uppercase;letter-spacing:.055em;color:#6b7280;font-weight:750}.smv2-kpi strong{font-size:20px;line-height:1.15}.smv2-kpi small{font-size:10px;color:#6b7280}
      .smv2-chart-card{padding:18px}.smv2-chart-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px}.smv2-chart-head h3{margin:0 0 3px}.smv2-chart-head p{margin:0;font-size:12px;color:#6b7280}.smv2-chart-wrap{position:relative;overflow-x:auto}.smv2-chart{width:100%;min-width:760px;display:block}.smv2-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:11px;margin-bottom:8px}.smv2-legend span{display:inline-flex;align-items:center;gap:6px}.smv2-legend i{width:18px;height:3px;border-radius:2px}.smv2-tooltip{position:absolute;z-index:8;pointer-events:none;min-width:190px;max-width:260px;padding:9px 10px;border-radius:8px;background:rgba(15,23,42,.96);color:#fff;font-size:11px;line-height:1.45;box-shadow:0 8px 24px rgba(0,0,0,.18)}.smv2-tooltip strong{display:block;margin-bottom:4px}.smv2-grid{stroke:rgba(100,110,125,.18);stroke-width:1}.smv2-axis{fill:currentColor;opacity:.58;font-size:10px}.smv2-line{fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.smv2-hit{fill:transparent;cursor:crosshair}
      .smv2-note{padding:11px 13px;border-radius:8px;background:#f8fafc;border:1px solid var(--line,#e2e8f0);font-size:11px;color:#64748b}.smv2-error{padding:14px;border-radius:8px;border:1px solid #f1b76a;background:#fff8ed;color:#7c4a00}.smv2-loading{padding:28px;text-align:center;color:#6b7280}.smv2-device-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:9px}.smv2-device{border:1px solid var(--line,#e2e5ec);border-radius:8px;padding:11px;background:#fff;display:grid;gap:4px}.smv2-device span{font-size:11px;color:#6b7280}
      @media(max-width:1050px){.smv2-head,.smv2-row{grid-template-columns:minmax(210px,2fr) 130px 120px 120px 90px}.smv2-head>:nth-child(4),.smv2-row>:nth-child(4),.smv2-head>:nth-child(7),.smv2-row>:nth-child(7){display:none}.smv2-live-kpis{grid-template-columns:repeat(3,minmax(130px,1fr))}.smv2-controls{grid-template-columns:repeat(2,minmax(170px,1fr))}.smv2-actions{grid-column:1/-1}}
      @media(max-width:680px){.smv2-head{display:none}.smv2-row{grid-template-columns:1fr 1fr;padding:13px}.smv2-row>*{min-width:0}.smv2-row>:first-child{grid-column:1/-1}.smv2-live-kpis{grid-template-columns:repeat(2,minmax(120px,1fr))}.smv2-controls{grid-template-columns:1fr}.smv2-actions{grid-column:auto}.smv2-chart{min-width:650px}.smv2-summary{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
    `;
    document.head.appendChild(style);
  }

  function exactTelemetry(system) {
    const feeds = monitoringState.data?.systems || [];
    const exact = feeds.find((item) => String(item.systemId || "") === String(system.id));
    if (exact) return exact;
    const target = norm(system.name);
    return feeds.find((item) => !item._fusionSynthetic && norm(item.name) === target) || null;
  }

  function allRows() {
    return systems.map((system) => ({ system, telemetry: exactTelemetry(system) }));
  }

  function statusDot(status) {
    return status === "Operational" ? "live" : status === "Non-operational" ? "bad" : status === "Attention required" ? "warn" : "";
  }

  function providerLabel(system, telemetry) {
    if (Array.isArray(system.fusionSolarPlants) && system.fusionSolarPlants.length) return "FusionSolar";
    return telemetry?.provider || system.platform || "Not connected";
  }

  function cachedFusionDetail(systemId) {
    return detailCache.get(systemId) || fusion.detailCache?.get?.(systemId) || null;
  }

  function dashboardSoc(system, telemetry) {
    const direct = num(telemetry?.batterySoc);
    if (direct !== null) return direct;
    return num(cachedFusionDetail(system.id)?.aggregate?.batterySoc);
  }

  function dashboardAlarmCount(system, telemetry) {
    const direct = Array.isArray(telemetry?.activeAlerts) ? telemetry.activeAlerts.length : null;
    if (direct !== null && direct > 0) return direct;
    const detail = cachedFusionDetail(system.id);
    return detail ? Number(detail.aggregate?.alarmCount ?? detail.alarms?.length ?? 0) : (direct ?? null);
  }

  function dashboardLastSignal(telemetry) {
    return telemetry?.lastSync || fusion.data?.fetchedAt || monitoringState.data?.fetchedAt || null;
  }

  function renderDashboardStandard() {
    if (state.view !== "monitoring") return;
    installStyles();
    const rows = allRows();
    const reporting = rows.filter(({ telemetry }) => telemetry);
    const energy = reporting.map(({ telemetry }) => num(telemetry.energyTodayKwh)).filter((v) => v !== null).reduce((a, b) => a + b, 0);
    const alarms = rows.map(({ system, telemetry }) => dashboardAlarmCount(system, telemetry)).filter((v) => v !== null).reduce((a, b) => a + b, 0);
    const providers = new Set(reporting.map(({ system, telemetry }) => providerLabel(system, telemetry)).filter(Boolean));

    const statGrid = appView.querySelector(".monitoring-stat-grid");
    if (statGrid) {
      statGrid.classList.add("smv2-summary");
      statGrid.innerHTML = `
        <article class="stat-card"><span>Sites reporting live</span><strong>${reporting.length}/${systems.length}</strong><span>${providers.size ? `${providers.size} monitoring source${providers.size === 1 ? "" : "s"} connected` : "Waiting for monitoring APIs"}</span></article>
        <article class="stat-card"><span>PV generation today</span><strong>${reporting.length ? fmt(energy, "kWh", 1) : "—"}</strong><span>Live daily energy from connected systems</span></article>
        <article class="stat-card"><span>Active alarms</span><strong>${reporting.length ? alarms : "—"}</strong><span>Current monitoring exceptions</span></article>
        <article class="stat-card"><span>Last portfolio update</span><strong style="font-size:15px">${dateTime(monitoringState.data?.fetchedAt || fusion.data?.fetchedAt)}</strong><span>Refreshes automatically</span></article>`;
    }

    const sectionHeader = [...appView.querySelectorAll(".section-header")].find((node) => node.querySelector("h2")?.textContent?.trim() === "Site performance");
    if (sectionHeader) sectionHeader.querySelector(".muted")?.replaceChildren(document.createTextNode("Live operational snapshot · open a site for kW, kWh and BESS graphs"));
    const oldTable = appView.querySelector(".monitoring-table");
    if (!oldTable) return;
    const table = document.createElement("div");
    table.className = "smv2-table";
    table.dataset.standardMonitoring = VERSION;
    table.innerHTML = `<div class="smv2-head"><span>Site</span><span>Status</span><span>Monitoring</span><span>PV today</span><span>BESS SOC</span><span>Alarms</span><span>Last update</span></div>${rows.map(({ system, telemetry }) => {
      const soc = dashboardSoc(system, telemetry);
      const alarmCount = dashboardAlarmCount(system, telemetry);
      const provider = providerLabel(system, telemetry);
      return `<button class="smv2-row" type="button" data-smv2-open="${esc(system.id)}"><span class="smv2-site"><strong>${esc(system.name)}</strong><small>${esc(system.id)} · ${esc(fmt(system.kwp, "kWp", 2))}</small></span><span><i class="smv2-dot ${statusDot(telemetry?.status || system.status)}"></i>${esc(telemetry?.status || system.status || "Not confirmed")}</span><span><span class="smv2-provider">${esc(provider)}</span></span><span class="smv2-value">${fmt(telemetry?.energyTodayKwh, "kWh", 2)}</span><span class="smv2-value">${fmt(soc, "%", 1)}</span><span class="smv2-value">${alarmCount === null ? "—" : alarmCount}</span><span class="smv2-subtle">${telemetry ? esc(dateTime(dashboardLastSignal(telemetry))) : "Waiting for API"}</span></button>`;
    }).join("")}`;
    oldTable.replaceWith(table);
  }

  window.renderMonitoring = function standardRenderMonitoring(...args) {
    const result = baseRenderMonitoring.apply(this, args);
    renderDashboardStandard();
    return result;
  };
  try { renderMonitoring = window.renderMonitoring; } catch {}

  function getSiteState(systemId) {
    if (siteState.has(systemId)) return siteState.get(systemId);
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    const next = { from, to, resolution: "5m", plant: "all", loading: false, error: "", data: null, live: null, provider: "", detail: null };
    siteState.set(systemId, next);
    return next;
  }

  function deyeTelemetry(system) {
    const t = exactTelemetry(system);
    return t && !t._fusionSynthetic && String(t.provider || "").toLowerCase().includes("deye") ? t : null;
  }

  function isFusion(system) {
    return Array.isArray(system?.fusionSolarPlants) && system.fusionSolarPlants.length > 0;
  }

  function mappedFusionPlants(system) {
    const wanted = new Set((system.fusionSolarPlants || []).map(norm));
    return (fusion.data?.systems || []).filter((plant) => wanted.has(norm(plant.name)));
  }

  async function ensureFusionPortfolio() {
    if (fusion.data?.systems?.length) return fusion.data;
    const response = await nativeFetch("/api/fusionsolar", { cache: "no-store", headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.connected === false) throw new Error(payload.message || "FusionSolar could not be loaded.");
    fusion.data = payload; fusion.status = "ready";
    return payload;
  }

  async function loadFusionDetail(system, force = false) {
    if (!force && detailCache.has(system.id)) return detailCache.get(system.id);
    await ensureFusionPortfolio();
    const plants = mappedFusionPlants(system);
    const codes = plants.map((p) => p.providerStationId).filter(Boolean);
    if (!codes.length) throw new Error("No FusionSolar plant is mapped to this workspace system.");
    const response = await nativeFetch(`/api/fusionsolar?stationCodes=${encodeURIComponent(codes.join(","))}`, { cache: "no-store", headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.detail) throw new Error(payload.message || "FusionSolar site detail could not be loaded.");
    detailCache.set(system.id, payload.detail);
    fusion.detailCache?.set?.(system.id, payload.detail);
    return payload.detail;
  }

  function selectedFusionCodes(system, stateObj, detail) {
    const allCodes = (detail?.plants || []).map((p) => String(p.providerStationId || "")).filter(Boolean);
    if (!stateObj.plant || stateObj.plant === "all") return allCodes;
    return allCodes.includes(stateObj.plant) ? [stateObj.plant] : allCodes;
  }

  function liveModel(system, stateObj) {
    if (isFusion(system)) {
      const detail = stateObj.detail;
      const codes = selectedFusionCodes(system, stateObj, detail);
      const selectedPlants = (detail?.plants || []).filter((p) => codes.includes(String(p.providerStationId)));
      const bess = (detail?.bessDevices || []).filter((d) => codes.includes(String(d.stationCode || "")));
      const avg = (arr, key) => { const values = arr.map((x) => num(x[key])).filter((x) => x !== null); return values.length ? values.reduce((a,b)=>a+b,0)/values.length : null; };
      const sum = (arr, key) => { const values = arr.map((x) => num(x[key])).filter((x) => x !== null); return values.length ? values.reduce((a,b)=>a+b,0) : null; };
      return {
        provider: "FusionSolar",
        status: selectedPlants.some((p)=>p.status === "Non-operational") ? "Non-operational" : selectedPlants.some((p)=>p.status === "Attention required") ? "Attention required" : selectedPlants.some((p)=>p.status === "Operational") ? "Operational" : "Unknown",
        pvKw: sum(selectedPlants, "powerKw"),
        pvTodayKwh: sum(selectedPlants, "energyTodayKwh"),
        loadKw: null, importKw: null, exportKw: null,
        soc: avg(bess, "soc"),
        chargeKw: sum(bess.filter((x)=>num(x.signedPowerKw) > 0), "signedPowerKw"),
        dischargeKw: bess.length ? bess.filter((x)=>num(x.signedPowerKw) < 0).reduce((a,x)=>a+Math.abs(num(x.signedPowerKw)||0),0) : null,
        last: fusion.data?.fetchedAt || new Date().toISOString(),
      };
    }
    const t = deyeTelemetry(system);
    return t ? {
      provider: "Deye Cloud", status: t.status, pvKw: num(t.powerKw), pvTodayKwh: num(t.energyTodayKwh), loadKw: num(t.consumptionPowerKw),
      importKw: num(t.purchasePowerKw), exportKw: null, soc: num(t.batterySoc), chargeKw: num(t.chargePowerKw) === null ? null : Math.abs(num(t.chargePowerKw)), dischargeKw: num(t.dischargePowerKw), last: t.lastSync,
    } : { provider: system.platform || "Not connected", status: system.status, pvKw:null,pvTodayKwh:null,loadKw:null,importKw:null,exportKw:null,soc:null,chargeKw:null,dischargeKw:null,last:null };
  }

  function flowBalance(pv, load, imp, exp, charge, discharge) {
    let p = num(pv), l = num(load), i = num(imp), e = num(exp), c = num(charge), d = num(discharge);
    c = c ?? 0; d = d ?? 0;
    if (l === null && p !== null && i !== null && e !== null) l = p + i + d - e - c;
    if ((i === null || e === null) && l !== null && p !== null) {
      const net = l + c - p - d;
      if (i === null) i = Math.max(net, 0);
      if (e === null) e = Math.max(-net, 0);
    }
    return { pvKw:p, loadKw:l, importKw:i, exportKw:e, chargeKw:c, dischargeKw:d };
  }

  function bucketKey(ms, resolution) {
    const d = new Date(ms);
    if (resolution === "1h") return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime();
    if (resolution === "1d") return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return Math.floor(ms / 300000) * 300000;
  }

  function aggregatePowerRows(rows, resolution) {
    if (resolution === "5m") return rows.sort((a,b)=>a.time-b.time);
    const groups = new Map();
    rows.forEach((r) => {
      const key = bucketKey(r.time, resolution);
      if (!groups.has(key)) groups.set(key, { time:key, rows:[] });
      groups.get(key).rows.push(r);
    });
    return [...groups.values()].sort((a,b)=>a.time-b.time).map(({time,rows:list}) => {
      const avg = (key) => { const v=list.map(x=>num(x[key])).filter(x=>x!==null); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null; };
      return { time, pvKw:avg("pvKw"), loadKw:avg("loadKw"), importKw:avg("importKw"), exportKw:avg("exportKw"), chargeKw:avg("chargeKw"), dischargeKw:avg("dischargeKw"), soc:avg("soc") };
    });
  }

  function energyFromPower(power, resolution) {
    const intervalHours = resolution === "5m" ? 5/60 : resolution === "1h" ? 1 : 24;
    return power.map((r) => ({ time:r.time, pvKwh:num(r.pvKw)===null?null:r.pvKw*intervalHours, loadKwh:num(r.loadKw)===null?null:r.loadKw*intervalHours, importKwh:num(r.importKw)===null?null:r.importKw*intervalHours, exportKwh:num(r.exportKw)===null?null:r.exportKw*intervalHours }));
  }

  function normaliseDeye(system, raw, resolution) {
    const base = (raw.power || []).map((r) => {
      const pv = num(r.generationPower); const load = num(r.consumptionPower); const gp = num(r.gridPower); const purchase = num(r.purchasePower);
      const chargeRaw = num(r.chargePower), dischargeRaw = num(r.dischargePower), battery = num(r.batteryPower);
      const charge = chargeRaw === null ? (battery !== null && battery < 0 ? Math.abs(battery)/1000 : 0) : Math.abs(chargeRaw)/1000;
      const discharge = dischargeRaw === null ? (battery !== null && battery > 0 ? battery/1000 : 0) : Math.abs(dischargeRaw)/1000;
      let imp = purchase === null ? null : Math.max(purchase/1000,0), exp = null;
      if (gp !== null) { imp = Math.max(gp/1000,0); exp = Math.max(-gp/1000,0); }
      const flow = flowBalance(pv===null?null:pv/1000, load===null?null:load/1000, imp, exp, charge, discharge);
      return { time:(num(r.timeStamp)||0)*1000, ...flow, soc:num(r.batterySOC) };
    }).filter((r)=>r.time);
    const power = aggregatePowerRows(base, resolution);
    let energy = energyFromPower(power, resolution);
    if (resolution === "1d" && Array.isArray(raw.daily) && raw.daily.length) {
      energy = raw.daily.map((r) => {
        const time = new Date(Number(r.year), Number(r.month)-1, Number(r.day)).getTime();
        let pv=num(r.generationValue), load=num(r.consumptionValue), imp=num(r.purchaseValue), exp=num(r.gridValue);
        const charge=num(r.chargeValue)||0, discharge=num(r.dischargeValue)||0;
        if (load===null && pv!==null && imp!==null && exp!==null) load=pv+imp+discharge-exp-charge;
        if ((imp===null || exp===null) && load!==null && pv!==null) { const net=load+charge-pv-discharge; if(imp===null) imp=Math.max(net,0); if(exp===null) exp=Math.max(-net,0); }
        return {time,pvKwh:pv,loadKwh:load,importKwh:imp,exportKwh:exp};
      }).filter((r)=>r.time>=getSiteState(system.id).from.getTime()-86400000 && r.time<=getSiteState(system.id).to.getTime()+86400000);
    }
    return { provider:"Deye Cloud", power, energy, bess:power.map((r)=>({time:r.time,soc:r.soc,chargeKw:r.chargeKw,dischargeKw:r.dischargeKw})), devices:raw.devices||[], note:"Deye station history normalized to the standard monitoring model." };
  }

  async function fetchJson(url) {
    const response = await nativeFetch(url, { cache:"no-store", headers:{Accept:"application/json"} });
    const payload = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(payload.message || `Monitoring request failed (HTTP ${response.status}).`);
    return payload;
  }

  async function fetchFusionDeviceHistory(ids, typeId, from, to) {
    const chunks = [];
    for (let i=0;i<ids.length;i+=10) chunks.push(ids.slice(i,i+10));
    const rows=[];
    for (const chunk of chunks) {
      const url=`/api/fusionsolar-range?deviceId=${encodeURIComponent(chunk.join(","))}&deviceType=${encodeURIComponent(typeId)}&from=${from}&to=${to}`;
      const data=await fetchJson(url);
      rows.push(...(data.device?.history||[]));
    }
    return rows;
  }

  function fusionFiveMinutePower(inverterRows, meterRows, bessRows) {
    const buckets=new Map();
    const ensure=(time)=>{const key=bucketKey(time,"5m"); if(!buckets.has(key)) buckets.set(key,{time:key,pvKw:0,hasPv:false,netGridKw:0,hasGrid:false,chargeKw:0,dischargeKw:0,socs:[]}); return buckets.get(key);};
    inverterRows.forEach((r)=>{ const t=num(r.time); if(t===null)return; const v=num(r.metrics?.active_power); if(v===null)return; const b=ensure(t); b.pvKw+=v; b.hasPv=true; });
    meterRows.forEach((r)=>{ const t=num(r.time); if(t===null)return; const v=num(r.metrics?.active_power); if(v===null)return; const b=ensure(t); b.netGridKw+=v/1000; b.hasGrid=true; });
    bessRows.forEach((r)=>{ const t=num(r.time); if(t===null)return; const b=ensure(t); const c=num(r.chargePowerKw),d=num(r.dischargePowerKw),s=num(r.soc); if(c!==null)b.chargeKw+=Math.max(c,0); if(d!==null)b.dischargeKw+=Math.max(d,0); if(s!==null)b.socs.push(s); });
    return [...buckets.values()].sort((a,b)=>a.time-b.time).map((b)=>{
      const imp=b.hasGrid?Math.max(-b.netGridKw,0):null, exp=b.hasGrid?Math.max(b.netGridKw,0):null;
      const flow=flowBalance(b.hasPv?b.pvKw:null,null,imp,exp,b.chargeKw,b.dischargeKw);
      return {...flow,time:b.time,soc:b.socs.length?b.socs.reduce((a,v)=>a+v,0)/b.socs.length:null};
    });
  }

  function fusionStationRows(primary, resolution) {
    const source = resolution === "1d" ? (primary.daily||[]) : (primary.power||[]);
    return source.map((r)=>{
      const time=num(r.time); if(time===null)return null;
      let pv=num(resolution === "1d" ? r.generationKwh : r.pvKw);
      let load=num(resolution === "1d" ? r.consumptionKwh : r.loadKw);
      let exp=num(resolution === "1d" ? r.gridKwh : r.gridKw);
      const bRows=(primary.bess||[]).filter((b)=>bucketKey(num(b.time)||0,resolution)===bucketKey(time,resolution));
      const avg=(key)=>{const v=bRows.map(x=>num(x[key])).filter(x=>x!==null);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
      const charge=avg("chargePowerKw")||0, discharge=avg("dischargePowerKw")||0;
      const flow=flowBalance(pv,load,null,exp,charge,discharge);
      return {time,...flow,soc:avg("soc")};
    }).filter(Boolean);
  }

  async function normaliseFusion(system, stateObj) {
    const detail=stateObj.detail || await loadFusionDetail(system);
    stateObj.detail=detail;
    const codes=selectedFusionCodes(system,stateObj,detail);
    const selectedDevices=(detail.devices||[]).filter((d)=>codes.includes(String(d.stationCode||"")));
    const bessIds=(detail.bessDevices||[]).filter((d)=>codes.includes(String(d.stationCode||""))).map((d)=>String(d.id)).filter(Boolean);
    const from=stateObj.from.getTime(), to=stateObj.to.getTime();
    if (stateObj.resolution === "5m" && to-from > 3*86400000) throw new Error("FusionSolar 5-minute history is limited to 3 days. Choose Hourly or Daily for a longer range.");
    const primary=await fetchJson(`/api/fusionsolar-range?stationCodes=${encodeURIComponent(codes.join(","))}&bessIds=${encodeURIComponent(bessIds.join(","))}&from=${from}&to=${to}`);
    let power;
    if (stateObj.resolution === "5m") {
      const inverterIds=selectedDevices.filter((d)=>Number(d.typeId)===1).map((d)=>String(d.id)).filter(Boolean);
      const meterIds=selectedDevices.filter((d)=>Number(d.typeId)===17).map((d)=>String(d.id)).filter(Boolean);
      const inverterRows=inverterIds.length?await fetchFusionDeviceHistory(inverterIds,1,from,to):[];
      const meterRows=meterIds.length?await fetchFusionDeviceHistory(meterIds,17,from,to):[];
      power=fusionFiveMinutePower(inverterRows,meterRows,primary.bess||[]);
    } else {
      const station=fusionStationRows(primary,stateObj.resolution);
      power=aggregatePowerRows(station,stateObj.resolution);
    }
    const energy=energyFromPower(power,stateObj.resolution);
    if (stateObj.resolution === "1d" && primary.daily?.length) {
      primary.daily.forEach((r)=>{
        const match=energy.find((e)=>bucketKey(e.time,"1d")===bucketKey(num(r.time)||0,"1d"));
        if (!match) return;
        if(num(r.generationKwh)!==null)match.pvKwh=num(r.generationKwh);
        if(num(r.consumptionKwh)!==null)match.loadKwh=num(r.consumptionKwh);
        if(num(r.gridKwh)!==null)match.exportKwh=num(r.gridKwh);
      });
    }
    return {provider:"FusionSolar",power,energy,bess:power.map((r)=>({time:r.time,soc:r.soc,chargeKw:r.chargeKw,dischargeKw:r.dischargeKw})),devices:selectedDevices,note:"FusionSolar data normalized from station KPIs, inverter history, grid meters and ESS type 41 history."};
  }

  async function loadRange(system, force=false) {
    const st=getSiteState(system.id);
    const key=`${system.id}|${st.plant}|${st.from.getTime()}|${st.to.getTime()}|${st.resolution}`;
    if (!force && rangeCache.has(key)) { st.data=rangeCache.get(key); renderSite(system); return; }
    st.loading=true; st.error=""; renderSite(system);
    try {
      let data;
      if (isFusion(system)) data=await normaliseFusion(system,st);
      else {
        const t=deyeTelemetry(system);
        if (!t?.providerStationId) throw new Error("No live monitoring API is linked to this system yet.");
        const raw=await fetchJson(`/api/monitoring-range?stationId=${encodeURIComponent(t.providerStationId)}&from=${Math.floor(st.from.getTime()/1000)}&to=${Math.floor(st.to.getTime()/1000)}`);
        data=normaliseDeye(system,raw,st.resolution);
      }
      st.data=data; st.provider=data.provider; rangeCache.set(key,data);
    } catch(error){ st.error=error?.message||"Monitoring history could not be loaded."; st.data=null; }
    finally{ st.loading=false; renderSite(system); }
  }

  function seriesColours() { return ["#0f76d8","#7a4cc2","#0a9b72","#d96b32","#bd3b77","#7d8794"]; }

  function lineChart(rows, series, opts={}) {
    if (!rows?.length) return `<div class="smv2-note">No data was returned for this graph and selected range.</div>`;
    const width=1000,height=320,left=58,right=opts.rightAxis?60:18,top=18,bottom=46,plotW=width-left-right,plotH=height-top-bottom;
    const vals=rows.flatMap(r=>series.filter(s=>!s.right).map(s=>num(r[s.key])).filter(v=>v!==null));
    let min=opts.min ?? Math.min(0,...(vals.length?vals:[0])),max=opts.max ?? Math.max(...(vals.length?vals:[1])); if(max===min)max=min+1;
    const rvals=rows.flatMap(r=>series.filter(s=>s.right).map(s=>num(r[s.key])).filter(v=>v!==null));
    let rmin=opts.rmin ?? Math.min(0,...(rvals.length?rvals:[0])),rmax=opts.rmax ?? Math.max(...(rvals.length?rvals:[1])); if(rmax===rmin)rmax=rmin+1;
    const x=i=>left+(rows.length===1?plotW/2:i/(rows.length-1)*plotW), y=v=>top+(1-(v-min)/(max-min))*plotH, yr=v=>top+(1-(v-rmin)/(rmax-rmin))*plotH;
    const grid=Array.from({length:5},(_,i)=>{const ratio=i/4,yy=top+ratio*plotH,val=max-ratio*(max-min),rv=rmax-ratio*(rmax-rmin);return `<line class="smv2-grid" x1="${left}" x2="${left+plotW}" y1="${yy}" y2="${yy}"/><text class="smv2-axis" x="${left-7}" y="${yy+4}" text-anchor="end">${val.toLocaleString("en-ZA",{maximumFractionDigits:1})}</text>${opts.rightAxis?`<text class="smv2-axis" x="${left+plotW+7}" y="${yy+4}">${rv.toLocaleString("en-ZA",{maximumFractionDigits:1})}</text>`:""}`}).join("");
    const colors=seriesColours();
    const lines=series.map((s,idx)=>{let segment=[],parts=[]; rows.forEach((r,i)=>{const v=num(r[s.key]); if(v===null){if(segment.length>1)parts.push(segment);segment=[];return;} segment.push([x(i),s.right?yr(v):y(v)]);}); if(segment.length>1)parts.push(segment); return parts.map(p=>`<polyline class="smv2-line" stroke="${colors[idx%colors.length]}" points="${p.map(q=>q.join(",")).join(" ")}"/>`).join("");}).join("");
    const tickIdx=[0,Math.floor((rows.length-1)*.25),Math.floor((rows.length-1)*.5),Math.floor((rows.length-1)*.75),rows.length-1].filter((v,i,a)=>v>=0&&a.indexOf(v)===i);
    const ticks=tickIdx.map(i=>`<text class="smv2-axis" x="${x(i)}" y="${height-12}" text-anchor="middle">${esc(dateTime(rows[i].time))}</text>`).join("");
    const legend=series.map((s,i)=>`<span><i style="background:${colors[i%colors.length]}"></i>${esc(s.label)}</span>`).join("");
    const payload=encodeURIComponent(JSON.stringify(rows.map(r=>({time:r.time,values:series.map(s=>({label:s.label,value:num(r[s.key]),unit:s.unit||opts.unit||""}))}))));
    return `<div class="smv2-chart-wrap" data-smv2-chart="${payload}"><div class="smv2-legend">${legend}</div><svg class="smv2-chart" viewBox="0 0 ${width} ${height}">${grid}${lines}${ticks}<rect class="smv2-hit" x="${left}" y="${top}" width="${plotW}" height="${plotH}"/><text class="smv2-axis" x="16" y="${top+plotH/2}" transform="rotate(-90 16 ${top+plotH/2})" text-anchor="middle">${esc(opts.unit||"")}</text>${opts.rightAxis?`<text class="smv2-axis" x="${width-10}" y="${top+plotH/2}" transform="rotate(90 ${width-10} ${top+plotH/2})" text-anchor="middle">${esc(opts.rightUnit||"")}</text>`:""}</svg><div class="smv2-tooltip" hidden></div></div>`;
  }

  function barChart(rows, series) {
    if (!rows?.length) return `<div class="smv2-note">No energy data was returned for this range.</div>`;
    const width=1000,height=320,left=58,right=18,top=18,bottom=52,plotW=width-left-right,plotH=height-top-bottom,colors=seriesColours();
    const max=Math.max(1,...rows.flatMap(r=>series.map(s=>Math.max(0,num(r[s.key])||0))));
    const slot=plotW/rows.length,groupW=Math.min(slot*.82,70),barW=Math.max(2,groupW/series.length);
    const grid=Array.from({length:5},(_,i)=>{const ratio=i/4,yy=top+ratio*plotH,val=max-ratio*max;return `<line class="smv2-grid" x1="${left}" x2="${left+plotW}" y1="${yy}" y2="${yy}"/><text class="smv2-axis" x="${left-7}" y="${yy+4}" text-anchor="end">${val.toLocaleString("en-ZA",{maximumFractionDigits:1})}</text>`}).join("");
    const bars=rows.map((r,i)=>{const x0=left+i*slot+(slot-groupW)/2;return series.map((s,j)=>{const val=Math.max(0,num(r[s.key])||0),h=val/max*plotH;return `<rect x="${x0+j*barW}" y="${top+plotH-h}" width="${Math.max(1,barW-1)}" height="${h}" fill="${colors[j%colors.length]}" opacity=".88"/>`;}).join("");}).join("");
    const tickIdx=[0,Math.floor((rows.length-1)*.25),Math.floor((rows.length-1)*.5),Math.floor((rows.length-1)*.75),rows.length-1].filter((v,i,a)=>v>=0&&a.indexOf(v)===i);
    const ticks=tickIdx.map(i=>`<text class="smv2-axis" x="${left+(i+.5)*slot}" y="${height-12}" text-anchor="middle">${esc(dateTime(rows[i].time))}</text>`).join("");
    const legend=series.map((s,i)=>`<span><i style="background:${colors[i%colors.length]}"></i>${esc(s.label)}</span>`).join("");
    const payload=encodeURIComponent(JSON.stringify(rows.map(r=>({time:r.time,values:series.map(s=>({label:s.label,value:num(r[s.key]),unit:"kWh"}))}))));
    return `<div class="smv2-chart-wrap" data-smv2-chart="${payload}"><div class="smv2-legend">${legend}</div><svg class="smv2-chart" viewBox="0 0 ${width} ${height}">${grid}${bars}${ticks}<rect class="smv2-hit" x="${left}" y="${top}" width="${plotW}" height="${plotH}"/><text class="smv2-axis" x="16" y="${top+plotH/2}" transform="rotate(-90 16 ${top+plotH/2})" text-anchor="middle">kWh</text></svg><div class="smv2-tooltip" hidden></div></div>`;
  }

  function attachTooltips(root) {
    root.querySelectorAll("[data-smv2-chart]").forEach((wrap)=>{
      if(wrap.dataset.ready)return; wrap.dataset.ready="1";
      let data=[]; try{data=JSON.parse(decodeURIComponent(wrap.dataset.smv2Chart||""));}catch{}
      const svg=wrap.querySelector("svg"),tip=wrap.querySelector(".smv2-tooltip"); if(!svg||!tip||!data.length)return;
      const show=(event)=>{const rect=svg.getBoundingClientRect(),ratio=clamp((event.clientX-rect.left)/rect.width,0,1),idx=Math.round(ratio*(data.length-1)),row=data[idx];if(!row)return;tip.innerHTML=`<strong>${esc(dateTime(row.time))}</strong>${row.values.filter(v=>v.value!==null).map(v=>`<div>${esc(v.label)}: <b>${esc(fmt(v.value,v.unit,2))}</b></div>`).join("")}`;tip.hidden=false;tip.style.left=`${clamp(event.clientX-wrap.getBoundingClientRect().left+12,8,Math.max(8,wrap.clientWidth-230))}px`;tip.style.top="44px";};
      svg.addEventListener("pointermove",show); svg.addEventListener("pointerdown",show); svg.addEventListener("pointerleave",()=>{tip.hidden=true;});
    });
  }

  function siteKpis(system, st) {
    const live=liveModel(system,st); st.live=live;
    const latest=st.data?.power?.at?.(-1); if(latest){live.pvKw=num(latest.pvKw)??live.pvKw;live.loadKw=num(latest.loadKw)??live.loadKw;live.importKw=num(latest.importKw)??live.importKw;live.exportKw=num(latest.exportKw)??live.exportKw;live.chargeKw=num(latest.chargeKw)??live.chargeKw;live.dischargeKw=num(latest.dischargeKw)??live.dischargeKw;live.soc=num(latest.soc)??live.soc;}
    const mode=num(live.chargeKw)>0.05?`Charging ${fmt(live.chargeKw,"kW",1)}`:num(live.dischargeKw)>0.05?`Discharging ${fmt(live.dischargeKw,"kW",1)}`:(num(live.soc)!==null?"Idle":"—");
    return `<div class="smv2-live-kpis"><article class="smv2-kpi"><span>PV now</span><strong>${fmt(live.pvKw,"kW",1)}</strong><small>Live generation</small></article><article class="smv2-kpi"><span>Load now</span><strong>${fmt(live.loadKw,"kW",1)}</strong><small>${num(live.loadKw)!==null?"Measured or balanced":"Not available"}</small></article><article class="smv2-kpi"><span>Grid import</span><strong>${fmt(live.importKw,"kW",1)}</strong><small>Import now</small></article><article class="smv2-kpi"><span>Grid export</span><strong>${fmt(live.exportKw,"kW",1)}</strong><small>Export now</small></article><article class="smv2-kpi"><span>BESS SOC</span><strong>${fmt(live.soc,"%",1)}</strong><small>State of charge</small></article><article class="smv2-kpi"><span>BESS</span><strong style="font-size:15px">${esc(mode)}</strong><small>Charge / discharge</small></article></div>`;
  }

  function plantSelector(system,st) {
    if(!isFusion(system)||!st.detail?.plants?.length)return "";
    return `<div class="smv2-field"><label>FusionSolar plant</label><select id="smv2-plant"><option value="all" ${st.plant==="all"?"selected":""}>All plants combined</option>${st.detail.plants.map(p=>`<option value="${esc(p.providerStationId)}" ${st.plant===p.providerStationId?"selected":""}>${esc(p.name)}</option>`).join("")}</select></div>`;
  }

  function deviceSection(st) {
    const devices=st.data?.devices||[];
    if(!devices.length)return `<section class="surface smv2-chart-card"><div class="smv2-chart-head"><div><h3>Devices</h3><p>Device inventory from the connected monitoring API.</p></div></div><div class="smv2-note">No device inventory was returned for this site.</div></section>`;
    return `<section class="surface smv2-chart-card"><div class="smv2-chart-head"><div><h3>Devices</h3><p>Standard inventory view; provider-specific device detail remains available from the monitoring API.</p></div><span class="smv2-provider">${devices.length} devices</span></div><div class="smv2-device-grid">${devices.slice(0,80).map(d=>`<div class="smv2-device"><strong>${esc(d.name||d.deviceType||d.typeName||"Device")}</strong><span>${esc(d.sn||d.deviceSn||d.id||"")}</span><span>${esc(d.model||d.productId||d.typeName||"")}</span></div>`).join("")}</div></section>`;
  }

  function renderSite(system) {
    installStyles();
    const st=getSiteState(system.id),live=liveModel(system,st); st.live=live;
    pageHeader("Monitoring","O&M / SITE MONITORING"); backButton.hidden=false; primaryAction.hidden=true;
    const resLabel=st.resolution==="5m"?"5-minute":st.resolution==="1h"?"Hourly":"Daily";
    const data=st.data;
    appView.innerHTML=`<div class="smv2-shell" data-standard-monitoring="${VERSION}"><div class="smv2-site-head"><div><p class="eyebrow">${esc(system.id)} · ${esc(live.provider||providerLabel(system,exactTelemetry(system)))}</p><h2>${esc(system.name)}</h2><div class="smv2-head-meta"><span><i class="smv2-dot ${statusDot(live.status||system.status)}"></i>${esc(live.status||system.status||"Unknown")}</span><span class="smv2-provider">${esc(live.provider||providerLabel(system,exactTelemetry(system)))}</span><span class="smv2-subtle">Last signal ${esc(dateTime(live.last))}</span></div></div><button class="button button-muted" type="button" data-smv2-refresh>Refresh live data</button></div>${siteKpis(system,st)}<section class="surface"><div class="smv2-controls"><div class="smv2-field"><label>From</label><input id="smv2-from" type="datetime-local" value="${esc(toLocalInput(st.from))}"></div><div class="smv2-field"><label>To</label><input id="smv2-to" type="datetime-local" value="${esc(toLocalInput(st.to))}"></div><div class="smv2-field"><label>Data resolution</label><select id="smv2-resolution"><option value="5m" ${st.resolution==="5m"?"selected":""}>5 minute</option><option value="1h" ${st.resolution==="1h"?"selected":""}>Hourly</option><option value="1d" ${st.resolution==="1d"?"selected":""}>Daily</option></select></div>${plantSelector(system,st)}<div class="smv2-actions"><button class="button button-primary" type="button" data-smv2-apply>Apply</button></div></div><div class="smv2-quick"><button type="button" data-smv2-range="today">Today</button><button type="button" data-smv2-range="24h">Last 24 hours</button><button type="button" data-smv2-range="7d">Last 7 days</button><button type="button" data-smv2-range="30d">Last 30 days</button>${data?`<button type="button" data-smv2-export>Export CSV</button>`:""}</div></section>${st.loading?`<div class="surface smv2-loading">Loading ${esc(resLabel)} monitoring data…</div>`:st.error?`<div class="smv2-error">${esc(st.error)}</div>`:data?`<section class="surface smv2-chart-card"><div class="smv2-chart-head"><div><h3>Energy — kWh</h3><p>PV generation, site load, grid import and grid export · ${esc(resLabel)} buckets.</p></div></div>${barChart(data.energy,[{key:"pvKwh",label:"PV generation"},{key:"loadKwh",label:"Load"},{key:"importKwh",label:"Grid import"},{key:"exportKwh",label:"Grid export"}])}</section><section class="surface smv2-chart-card"><div class="smv2-chart-head"><div><h3>Power — kW</h3><p>PV, load, grid import and grid export · ${esc(resLabel)} profile.</p></div></div>${lineChart(data.power,[{key:"pvKw",label:"PV",unit:"kW"},{key:"loadKw",label:"Load",unit:"kW"},{key:"importKw",label:"Grid import",unit:"kW"},{key:"exportKw",label:"Grid export",unit:"kW"}],{unit:"kW"})}</section><section class="surface smv2-chart-card"><div class="smv2-chart-head"><div><h3>BESS — SOC, charge and discharge</h3><p>SOC on the left axis; charging and discharging power on the right.</p></div></div>${lineChart(data.bess,[{key:"soc",label:"SOC",unit:"%"},{key:"chargeKw",label:"Charge",unit:"kW",right:true},{key:"dischargeKw",label:"Discharge",unit:"kW",right:true}],{unit:"%",min:0,max:100,rightAxis:true,rightUnit:"kW",rmin:0})}</section><div class="smv2-note">${esc(data.note||"")} Load is calculated from the site energy balance only when the API does not return it directly.</div>${deviceSection(st)}`:`<div class="surface smv2-loading">Select a calendar range and resolution to load monitoring data.</div>`}</div>`;
    attachTooltips(appView);
  }

  function openStandardSite(systemId) {
    const system=getSystem(systemId); if(!system)return;
    state.view="monitoring-site"; state.monitoringSystem=systemId;
    const st=getSiteState(systemId);
    renderSite(system);
    (async()=>{
      if(isFusion(system)) {
        try { st.detail=await loadFusionDetail(system); renderSite(system); } catch(error){st.error=error.message||"FusionSolar detail could not be loaded.";renderSite(system);return;}
      }
      if(!st.data&&!st.loading)loadRange(system);
    })();
  }

  function exportData(system,st) {
    if(!st.data)return;
    const byTime=new Map();
    st.data.power.forEach(r=>byTime.set(r.time,{time:r.time,pvKw:r.pvKw,loadKw:r.loadKw,importKw:r.importKw,exportKw:r.exportKw,chargeKw:r.chargeKw,dischargeKw:r.dischargeKw,soc:r.soc}));
    st.data.energy.forEach(r=>{const row=byTime.get(r.time)||{time:r.time};Object.assign(row,r);byTime.set(r.time,row);});
    const headers=["timestamp","pv_kW","load_kW","grid_import_kW","grid_export_kW","bess_charge_kW","bess_discharge_kW","bess_soc_pct","pv_kWh","load_kWh","grid_import_kWh","grid_export_kWh"];
    const rows=[...byTime.values()].sort((a,b)=>a.time-b.time).map(r=>[new Date(r.time).toISOString(),r.pvKw,r.loadKw,r.importKw,r.exportKw,r.chargeKw,r.dischargeKw,r.soc,r.pvKwh,r.loadKwh,r.importKwh,r.exportKwh]);
    const blob=new Blob([[headers,...rows].map(r=>r.map(csvCell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`${norm(system.name).replace(/\s+/g,"-")}-${st.resolution}-${toLocalInput(st.from).replace(/[:T]/g,"-")}-to-${toLocalInput(st.to).replace(/[:T]/g,"-")}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  window.onAction = function standardMonitoringAction(action,id,...rest) {
    if(action==="open-monitoring-site") { openStandardSite(id); return; }
    return baseOnAction.call(this,action,id,...rest);
  };
  try { onAction = window.onAction; } catch {}

  document.addEventListener("click",(event)=>{
    const dash=event.target.closest?.("[data-smv2-open]"); if(dash){event.preventDefault();openStandardSite(dash.dataset.smv2Open);return;}
    if(state.view!=="monitoring-site"||!state.monitoringSystem)return;
    const system=getSystem(state.monitoringSystem),st=getSiteState(state.monitoringSystem); if(!system)return;
    if(event.target.closest?.("[data-smv2-apply]")){
      const f=document.getElementById("smv2-from")?.value,t=document.getElementById("smv2-to")?.value,r=document.getElementById("smv2-resolution")?.value,p=document.getElementById("smv2-plant")?.value;
      const from=f?new Date(f):null,to=t?new Date(t):null;if(!from||!to||Number.isNaN(from.getTime())||Number.isNaN(to.getTime())||to<=from){showToast("Choose a valid calendar start and end time.");return;}st.from=from;st.to=to;st.resolution=r||"5m";if(p)st.plant=p;st.data=null;loadRange(system,true);return;
    }
    const quick=event.target.closest?.("[data-smv2-range]"); if(quick){const now=new Date();let from;if(quick.dataset.smv2Range==="today")from=new Date(now.getFullYear(),now.getMonth(),now.getDate());else if(quick.dataset.smv2Range==="24h")from=new Date(now-86400000);else if(quick.dataset.smv2Range==="7d")from=new Date(now-7*86400000);else from=new Date(now-30*86400000);st.from=from;st.to=now;if((st.to-st.from)>3*86400000&&st.resolution==="5m")st.resolution=quick.dataset.smv2Range==="7d"?"1h":"1d";st.data=null;loadRange(system,true);return;}
    if(event.target.closest?.("[data-smv2-refresh]")){if(isFusion(system))detailCache.delete(system.id);st.data=null;(async()=>{try{if(isFusion(system))st.detail=await loadFusionDetail(system,true);await loadRange(system,true);}catch(error){st.error=error.message;renderSite(system);}})();return;}
    if(event.target.closest?.("[data-smv2-export]")){exportData(system,st);return;}
  },true);

  document.addEventListener("change",(event)=>{
    if(state.view!=="monitoring-site"||!state.monitoringSystem)return;
    if(event.target?.id!=="smv2-plant")return;
    const system=getSystem(state.monitoringSystem),st=getSiteState(state.monitoringSystem);if(!system)return;st.plant=event.target.value||"all";st.data=null;loadRange(system,true);
  });

  setInterval(()=>{
    if(document.visibilityState!=="visible")return;
    if(state.view==="monitoring")renderDashboardStandard();
  },30000);

  installStyles();
  if(state.view==="monitoring")renderDashboardStandard();
})();