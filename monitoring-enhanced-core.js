(() => {
  const originalOnAction = onAction;
  const detailCache = new Map();
  const pendingDetails = new Map();
  let refreshPromise = null;
  let lastAutoToast = 0;

  const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const num = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
  const fmt = (v, unit = "", digits = 2) => {
    const n = num(v);
    return n === null ? "—" : `${n.toLocaleString("en-ZA", { maximumFractionDigits: digits })}${unit ? ` ${unit}` : ""}`;
  };

  function nameTokens(value) {
    const ignore = new Set(["sleepover", "sleep", "over", "gate", "solar", "site", "plant", "system", "the"]);
    return String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((x) => x && !ignore.has(x));
  }
  function matchScore(system, telemetry) {
    if (!telemetry) return 0;
    if (String(telemetry.systemId || "") === String(system.id || "")) return 100;
    const a = nameTokens(system.name), b = nameTokens(telemetry.name);
    if (!a.length || !b.length) return 0;
    const overlap = a.filter((x) => b.includes(x)).length;
    return overlap ? overlap * 10 + (a.join(" ") === b.join(" ") ? 50 : 0) - Math.abs(a.length - b.length) : 0;
  }
  function telemetryFor(system) {
    let best = null, score = 0;
    (monitoringState.data?.systems || []).forEach((candidate) => {
      const next = matchScore(system, candidate);
      if (next > score) { score = next; best = candidate; }
    });
    return score >= 9 ? best : null;
  }
  function systemFor(telemetry) {
    let best = null, score = 0;
    systems.forEach((system) => {
      const next = matchScore(system, telemetry);
      if (next > score) { score = next; best = system; }
    });
    return score >= 9 ? best : null;
  }
  function dateTime(value) {
    if (value === null || value === undefined || value === "") return "—";
    const n = Number(value);
    const date = Number.isFinite(n) ? new Date(n < 100000000000 ? n * 1000 : n) : new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
  }
  function badge(value) {
    const status = String(value || "Unknown");
    const tone = ["Operational", "Online"].includes(status) ? "ok" : ["Non-operational", "Offline"].includes(status) ? "bad" : ["Attention required", "Alert"].includes(status) ? "warn" : "neutral";
    return `<span class="monitor-status monitor-status-${tone}">${esc(status)}</span>`;
  }

  function todayLabel() { return new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }); }
  function nextTicketId() {
    const highest = tickets.reduce((max, ticket) => Math.max(max, Number(String(ticket.id || "").match(/(\d+)$/)?.[1] || 0)), 0);
    return `TKT-${new Date().getFullYear()}-${String(highest + 1).padStart(4, "0")}`;
  }
  function lastWork(ticket) {
    const item = Array.isArray(ticket.work) ? ticket.work.at(-1) : null;
    return String(item && typeof item === "object" ? (item.note ?? item.text ?? item.update ?? "") : item || "");
  }
  function addWork(ticket, note) {
    if (!note || lastWork(ticket) === note) return false;
    ticket.work = Array.isArray(ticket.work) ? ticket.work : [];
    ticket.work.push({ date: todayLabel(), note });
    return true;
  }
  function ensureTicket(system, key, issue, concern, note, monitorData = {}) {
    let ticket = tickets.find((t) => t.monitorKey === key && t.status !== "Completed");
    if (ticket) {
      let changed = false;
      if (ticket.issue !== issue) { ticket.issue = issue; changed = true; }
      if (ticket.concern !== concern) { ticket.concern = concern; changed = true; }
      if (addWork(ticket, note)) changed = true;
      ticket.monitorData = { ...(ticket.monitorData || {}), ...monitorData, lastSeen: new Date().toISOString() };
      return { created: false, changed };
    }
    ticket = {
      id: nextTicketId(), system: system.id, source: "Monitoring alert", issue, concern,
      found: todayLabel(), opened: todayLabel(), status: "Open", workflow: "", pm: false,
      approver: "", owner: system.contractor || "Blue Energy Africa", work: [{ date: todayLabel(), note }],
      files: [], emailHistory: [], autoManaged: true, monitorKey: key,
      monitorData: { ...monitorData, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString() },
    };
    tickets.unshift(ticket);
    return { created: true, changed: true };
  }
  function resolveTicket(key, note) {
    const ticket = tickets.find((t) => t.monitorKey === key && t.status !== "Completed" && t.autoManaged);
    if (!ticket) return false;
    ticket.status = "Completed";
    ticket.workflow = "";
    addWork(ticket, note);
    ticket.monitorData = { ...(ticket.monitorData || {}), recoveredAt: new Date().toISOString() };
    return true;
  }
  function countRead(key) { try { return Number(localStorage.getItem(`om-monitor-condition:${key}`) || 0) || 0; } catch { return 0; } }
  function countWrite(key, value) { try { localStorage.setItem(`om-monitor-condition:${key}`, String(value)); } catch {} }
  function productionWindow(t) {
    const irr = num(t?.irradiance);
    if (irr !== null && irr >= 50) return true;
    try {
      const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: t?.stationTimezone || "Africa/Johannesburg", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
      return hour >= 8 && hour < 17;
    } catch { return false; }
  }
  function alarmConcern(a) {
    if (num(a.level) === 2 || [2, 3].includes(num(a.impact))) return "Critical";
    if (num(a.level) === 1 || num(a.impact) === 1) return "High";
    return "Medium";
  }
  function alarmKey(system, alarm) { return `monitor:${system.id}:alarm:${alarm.source || "deye"}:${alarm.deviceSn || "station"}:${alarm.id || alarm.code || alarm.name}`; }

  function applyAutomation(payload, detail = false) {
    const feeds = detail ? [payload?.detail].filter(Boolean) : (payload?.systems || []);
    let changed = false, created = 0;
    feeds.forEach((t) => {
      const system = systemFor(t);
      if (!system) return;
      const d = t.deviceSummary || {}, total = Number(d.total || 0), online = Number(d.online || 0), offline = Number(d.offline || 0), alertCount = Number(d.alert || 0);
      const connectionKey = `monitor:${system.id}:connectivity`;
      const productionKey = `monitor:${system.id}:no-production`;
      let status = t.status || system.status;

      if (total && offline === total) {
        const r = ensureTicket(system, connectionKey, "Monitoring: site offline", "Critical", `Deye reports all ${total} monitored devices offline. Immediate investigation required.`, { total, online, offline, alertCount });
        changed ||= r.changed; created += r.created ? 1 : 0; status = "Non-operational";
      } else if (offline > 0 || alertCount > 0) {
        const issue = offline ? `Monitoring: ${offline} of ${total} devices offline` : `Monitoring: ${alertCount} devices in alert state`;
        const r = ensureTicket(system, connectionKey, issue, "High", `Connectivity check: ${online} online, ${offline} offline and ${alertCount} in alert state out of ${total} devices.`, { total, online, offline, alertCount });
        changed ||= r.changed; created += r.created ? 1 : 0; status = "Attention required";
      } else if (total && online === total) {
        if (resolveTicket(connectionKey, `All ${total} monitored devices are online again. Connectivity ticket automatically closed.`)) changed = true;
      }

      const power = num(t.powerKw);
      const candidate = total > 0 && online > 0 && power !== null && power <= 0.02 && productionWindow(t);
      const countKey = `${system.id}:zero-production`;
      const count = candidate ? countRead(countKey) + 1 : 0;
      countWrite(countKey, count);
      const irr = num(t.irradiance);
      const zeroProduction = candidate && ((irr !== null && irr >= 50) || count >= 2);
      if (zeroProduction) {
        const r = ensureTicket(system, productionKey, "Monitoring: no solar production", "High", `Site is reporting ${fmt(power, "kW")} generation during the production window while ${online} monitored device${online === 1 ? " is" : "s are"} online.`, { powerKw: power, irradiance: irr });
        changed ||= r.changed; created += r.created ? 1 : 0; if (status !== "Non-operational") status = "Attention required";
      } else if (power !== null && power > 0.02 && resolveTicket(productionKey, `Solar production recovered to ${fmt(power, "kW")}. No-production ticket automatically closed.`)) changed = true;

      (t.alerts || []).forEach((alarm) => {
        const key = alarmKey(system, alarm);
        if (alarm.active) {
          const detailText = [alarm.description, alarm.reason, alarm.solution].filter(Boolean).join(" | ");
          const where = alarm.deviceSn ? `device ${alarm.deviceSn}` : "station";
          const r = ensureTicket(system, key, `Deye alarm: ${alarm.name || alarm.code || "Active alarm"}`, alarmConcern(alarm), `Active Deye alarm on ${where}${alarm.code ? ` (${alarm.code})` : ""}.${detailText ? ` ${detailText}` : ""}`, { alert: alarm });
          changed ||= r.changed; created += r.created ? 1 : 0; if (status !== "Non-operational") status = "Attention required";
        } else if (resolveTicket(key, `${alarm.name || alarm.code || "Deye alarm"} has cleared. Monitoring ticket automatically closed.`)) changed = true;
      });
      if (["Operational", "Attention required", "Non-operational"].includes(status) && system.status !== status) { system.status = status; changed = true; }
    });
    if (changed) saveWorkspace();
    if (created && Date.now() - lastAutoToast > 5000) { lastAutoToast = Date.now(); showToast(`${created} monitoring ticket${created === 1 ? "" : "s"} created automatically.`); }
  }

  refreshMonitoring = function enhancedRefreshMonitoring() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      monitoringState.status = "loading"; monitoringState.message = "";
      if (state.view === "monitoring") renderMonitoring();
      try {
        const response = await fetch("/api/monitoring", { headers: { Accept: "application/json" }, cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || "The monitoring feed could not be reached.");
        monitoringState.data = payload; monitoringState.message = payload.message || ""; monitoringState.status = "ready";
        applyAutomation(payload);
      } catch (error) {
        monitoringState.data = null; monitoringState.message = error.message || "The monitoring feed could not be reached."; monitoringState.status = "error";
      } finally { refreshPromise = null; }
      if (state.view === "monitoring") renderMonitoring();
      return monitoringState.data;
    })();
    return refreshPromise;
  };


  renderMonitoring = function enhancedRenderMonitoring() {
    state.view = "monitoring";
    pageHeader("Monitoring", "O&M / LIVE MONITORING", "Refresh data");
    const rows = systems.map((system) => ({ system, telemetry: telemetryFor(system) }));
    const live = rows.filter((r) => r.telemetry);
    const totalPower = live.reduce((s, r) => s + (num(r.telemetry.powerKw) || 0), 0);
    const totalEnergy = live.reduce((s, r) => s + (num(r.telemetry.energyTodayKwh) || 0), 0);
    const deviceTotal = live.reduce((s, r) => s + Number(r.telemetry.deviceSummary?.total || 0), 0);
    const deviceOffline = live.reduce((s, r) => s + Number(r.telemetry.deviceSummary?.offline || 0), 0);
    const alarms = live.reduce((s, r) => s + Number(r.telemetry.activeAlerts?.length || 0), 0);
    appView.innerHTML = `
      <div class="monitoring-stat-grid monitoring-stat-grid-expanded">
        <article class="stat-card"><span>PV power now</span><strong>${live.length ? fmt(totalPower, "kW") : "—"}</strong><span>${live.length} Deye station${live.length === 1 ? "" : "s"} reporting</span></article>
        <article class="stat-card"><span>Generation today</span><strong>${live.length ? fmt(totalEnergy, "kWh") : "—"}</strong><span>Latest daily energy</span></article>
        <article class="stat-card"><span>Device connectivity</span><strong>${deviceTotal ? `${deviceTotal - deviceOffline}/${deviceTotal}` : "—"}</strong><span>${deviceOffline ? `${deviceOffline} offline` : deviceTotal ? "All reporting devices online" : "Awaiting device inventory"}</span></article>
        <article class="stat-card"><span>Active alarms</span><strong>${live.length ? alarms : "—"}</strong><span>Alarms feed automatic tickets</span></article>
      </div>
      <div class="section-header"><h2>Site performance</h2><span class="muted">Click a site for full station and device detail</span></div>
      <div class="monitoring-table monitoring-table-expanded"><div class="monitoring-head"><span>Site</span><span>Status</span><span>PV now</span><span>Today</span><span>BESS SOC</span><span>Charge / discharge</span><span>Devices</span><span>Alarms</span><span>Last signal</span></div>
      ${rows.map(({ system, telemetry: t }) => { const d = t?.deviceSummary || {}; return `<button class="monitoring-row monitoring-site-row" data-action="open-monitoring-site" data-id="${esc(system.id)}"><span class="asset-site"><strong>${esc(system.name)}</strong><small>${esc(system.id)} · ${esc(fmt(system.kwp, "kWp"))}</small></span><span>${badge(t?.status || system.status)}</span><span class="monitoring-value">${fmt(t?.powerKw, "kW")}</span><span class="monitoring-value">${fmt(t?.energyTodayKwh, "kWh")}</span><span class="monitoring-value">${fmt(t?.batterySoc, "%", 1)}</span><span class="monitoring-value"><span class="monitor-flow-label">C ${fmt(t?.chargePowerKw, "kW")}</span><span class="monitor-flow-label">D ${fmt(t?.dischargePowerKw, "kW")}</span></span><span class="monitoring-value">${t ? `${d.online || 0}/${d.total || 0} online` : "—"}${d.offline ? `<small>${d.offline} offline</small>` : ""}</span><span class="monitoring-value">${t ? t.activeAlerts?.length || 0 : "—"}</span><span class="card-meta">${t ? esc(dateTime(t.lastSync)) : monitoringState.status === "loading" ? "Checking…" : "Waiting for API"}</span></button>`; }).join("")}</div>`;
    if (monitoringState.status === "idle") refreshMonitoring();
  };

  const metricCard = (label, value, sub = "") => `<article class="monitor-kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}</article>`;
  function metricGroups(metrics) {
    const groups = { PV: [], Battery: [], Grid: [], Load: [], AC: [], DC: [], Temperature: [], Faults: [], Other: [] };
    (metrics || []).forEach((m) => {
      const k = `${m.key || ""} ${m.name || ""}`.toLowerCase();
      const g = /fault|alarm|warning|error|insulation/.test(k) ? "Faults" : /battery|bms|soc|charge|discharge/.test(k) ? "Battery" : /pv|solar|string|mppt/.test(k) ? "PV" : /grid|ct|utility|mains/.test(k) ? "Grid" : /load|ups|consumption/.test(k) ? "Load" : /temp|temperature/.test(k) ? "Temperature" : /\bac\b|frequency/.test(k) ? "AC" : /\bdc\b/.test(k) ? "DC" : "Other";
      groups[g].push(m);
    });
    return groups;
  }
  function renderMetrics(device) {
    return Object.entries(metricGroups(device.metrics)).filter(([, list]) => list.length).map(([name, list]) => `<section class="device-metric-group"><h5>${esc(name)} <span>${list.length}</span></h5><div class="device-metric-grid">${list.map((m) => `<div class="device-metric"><span>${esc(m.name || m.key)}</span><strong>${esc(m.value ?? "—")} ${esc(m.unit || "")}</strong><small>${esc(m.key || "")}</small></div>`).join("")}</div></section>`).join("");
  }
  function flatten(value, prefix = "") {
    if (!value || typeof value !== "object") return [];
    const ignore = new Set(["requestId", "success", "code", "msg"]);
    return Object.entries(value).flatMap(([key, v]) => ignore.has(key) ? [] : Array.isArray(v) ? [{ key: prefix ? `${prefix}.${key}` : key, value: JSON.stringify(v) }] : v && typeof v === "object" ? flatten(v, prefix ? `${prefix}.${key}` : key) : [{ key: prefix ? `${prefix}.${key}` : key, value: v ?? "—" }]);
  }
  function renderConfig(device) {
    const rows = Object.entries(device.config || {}).flatMap(([section, value]) => flatten(value, section));
    return rows.length ? `<div class="device-config-grid">${rows.map((r) => `<div><span>${esc(r.key)}</span><strong>${esc(r.value)}</strong></div>`).join("")}</div>` : `<p class="monitor-empty">No configuration values returned for this device type or permission scope.</p>`;
  }
  function renderAlarm(a) {
    return `<article class="monitor-alarm ${a.active ? "active" : "cleared"}"><div><strong>${esc(a.name || a.code || "Deye alert")}</strong><span>${a.deviceSn ? `Device ${esc(a.deviceSn)}` : "Station alarm"}</span></div><div>${a.active ? badge("Alert") : badge("Cleared")}</div><p>${esc([a.description, a.reason].filter(Boolean).join(" · ") || "No additional description returned.")}</p>${a.solution ? `<small><strong>Suggested action:</strong> ${esc(a.solution)}</small>` : ""}</article>`;
  }
  function renderCoverage(coverage) {
    const map = new Map();
    (coverage || []).forEach((x) => { const key = `${x.path}|${x.deviceSn || ""}`; if (!map.has(key) || x.ok) map.set(key, x); });
    const rows = [...map.values()];
    return rows.length ? `<details class="api-coverage"><summary>API coverage · ${rows.filter((x) => x.ok).length}/${rows.length} calls returned</summary><div class="api-coverage-list">${rows.map((x) => `<div><code>${esc(x.path)}</code>${x.deviceSn ? `<span>${esc(x.deviceSn)}</span>` : `<span></span>`}${x.ok ? badge("Online") : `<span class="api-error">${esc(x.error || "Not returned")}</span>`}</div>`).join("")}</div></details>` : "";
  }
  function renderDeviceHistory(device) {
    const rows = Array.isArray(device.history) ? device.history.slice(-24) : [];
    if (!rows.length) return `<p class="monitor-empty">No device history returned for the selected measure points.</p>`;
    return `<details class="device-history"><summary>Recent device history · ${rows.length} samples</summary><div class="device-history-list">${rows.map((row) => { const pairs = (Array.isArray(row.itemList) ? row.itemList : []).flatMap((item) => item && typeof item === "object" ? Object.entries(item) : []); return `<div class="device-history-row"><time>${esc(dateTime(row.collectionTime || row.time || row.dateTime || ""))}</time><div>${pairs.map(([k, v]) => `<span><small>${esc(k)}</small><strong>${esc(v)}</strong></span>`).join("") || `<span><strong>${esc(JSON.stringify(row))}</strong></span>`}</div></div>`; }).join("")}</div></details>`;
  }
  function renderDevice(device) {
    const s = device.metricSummary || {}, alarms = device.alerts || [], points = device.measurePoints || [];
    return `<details class="monitor-device" ${device.status !== "Online" || device.activeAlerts?.length ? "open" : ""}><summary><span><strong>${esc(device.deviceType || "Device")}</strong><small>SN ${esc(device.deviceSn)}</small></span><span>${badge(device.status)}</span><span><strong>${fmt(s.batterySoc, "%", 1)}</strong><small>BESS SOC</small></span><span><strong>${fmt(s.pvPowerW === null || s.pvPowerW === undefined ? null : Number(s.pvPowerW) / 1000, "kW")}</strong><small>Device PV</small></span><span><strong>${device.metrics?.length || 0}</strong><small>live points</small></span><span><strong>${points.length}</strong><small>measure points</small></span></summary><div class="monitor-device-body"><div class="device-summary-strip">${metricCard("Last collection", dateTime(device.collectionTime))}${metricCard("Active alarms", String(device.activeAlerts?.length || 0))}${metricCard("Product ID", device.productId || "—")}${metricCard("Device state", device.status || "Unknown")}</div><div class="monitor-subhead"><h4>Every live measurement returned by Deye</h4><span>${device.metrics?.length || 0} points</span></div>${device.metrics?.length ? renderMetrics(device) : `<p class="monitor-empty">No live measurement points returned for this device.</p>`}<div class="monitor-subhead"><h4>Measure-point catalogue & history</h4><span>${points.length} available</span></div>${points.length ? `<details class="measure-point-catalog"><summary>Available Deye measure points · ${points.length}</summary><div class="measure-point-chips">${points.map((p) => `<code>${esc(p)}</code>`).join("")}</div></details>` : `<p class="monitor-empty">No measure-point catalogue returned.</p>`}${renderDeviceHistory(device)}<div class="monitor-subhead"><h4>Alarms</h4><span>${alarms.length} returned</span></div>${alarms.length ? `<div class="monitor-alarm-list">${alarms.map(renderAlarm).join("")}</div>` : `<p class="monitor-empty">No device alarms returned.</p>`}<div class="monitor-subhead"><h4>Device configuration</h4><span>Read-only</span></div>${renderConfig(device)}${renderCoverage(device.apiCoverage)}</div></details>`;
  }
  function renderHistory(detail) {
    const rows = (detail.powerHistory?.length ? detail.powerHistory : detail.history || []).slice(-48);
    if (!rows.length) return `<p class="monitor-empty">No station history returned for the current period.</p>`;
    return `<div class="monitor-history"><div class="monitor-history-head"><span>Time</span><span>PV kW</span><span>Load kW</span><span>Grid kW</span><span>SOC</span><span>Charge kW</span><span>Discharge kW</span></div>${rows.map((r) => `<div class="monitor-history-row"><span>${esc(dateTime(r.timeStamp || r.dateTime || r.time || ""))}</span><span>${fmt(num(r.generationPower) === null ? null : Number(r.generationPower) / 1000, "kW")}</span><span>${fmt(num(r.consumptionPower) === null ? null : Number(r.consumptionPower) / 1000, "kW")}</span><span>${fmt(num(r.gridPower) === null ? null : Number(r.gridPower) / 1000, "kW")}</span><span>${fmt(r.batterySOC, "%", 1)}</span><span>${fmt(num(r.chargePower) === null ? null : Number(r.chargePower) / 1000, "kW")}</span><span>${fmt(num(r.dischargePower) === null ? null : Number(r.dischargePower) / 1000, "kW")}</span></div>`).join("")}</div>`;
  }

  function siteHtml(system, detail) {
    const d = detail.deviceSummary || {}, alarms = detail.alerts || [], active = detail.activeAlerts || [];
    return `<div class="monitor-site-head"><div><p class="eyebrow">${esc(system.id)} · DEYE STATION ${esc(detail.providerStationId)}</p><h2>${esc(system.name)}</h2><p class="muted">${esc(detail.locationAddress || "Location not returned")} · Last signal ${esc(dateTime(detail.lastSync))}</p></div><div>${badge(detail.status)} <button class="button button-muted" data-action="refresh-monitoring-site" data-id="${esc(system.id)}">Refresh site</button></div></div><div class="monitor-site-kpis">${metricCard("PV power", fmt(detail.powerKw, "kW"), "Live generation")}${metricCard("Generation today", fmt(detail.energyTodayKwh, "kWh"), "Daily energy")}${metricCard("Load", fmt(detail.consumptionPowerKw, "kW"), "Site consumption")}${metricCard("Grid", fmt(detail.gridPowerKw, "kW"), "Net grid power")}${metricCard("Grid purchase", fmt(detail.purchasePowerKw, "kW"), "Import from grid")}${metricCard("Wire power", fmt(detail.wirePowerKw, "kW"), "Deye wire power")}${metricCard("BESS SOC", fmt(detail.batterySoc, "%", 1), "State of charge")}${metricCard("BESS power", fmt(detail.batteryPowerKw, "kW"), "Net battery power")}${metricCard("BESS charge", fmt(detail.chargePowerKw, "kW"), "Charging now")}${metricCard("BESS discharge", fmt(detail.dischargePowerKw, "kW"), "Discharging now")}${metricCard("Irradiance", fmt(detail.irradiance, "W/m²", 0), "When available")}${metricCard("Devices", `${d.online || 0}/${d.total || 0}`, `${d.offline || 0} offline · ${d.alert || 0} alert`)}</div><section class="surface monitor-section"><div class="surface-title"><h3>Alarms & automatic ticket triggers</h3><span>${active.length ? badge("Alert") : badge("Online")}</span></div><p class="muted">Open Deye alarms, full/partial outages and confirmed zero production create O&amp;M tickets automatically. Recovery closes auto-managed connectivity and production tickets.</p>${alarms.length ? `<div class="monitor-alarm-list">${alarms.map(renderAlarm).join("")}</div>` : `<p class="monitor-empty">No station or device alarms returned.</p>`}</section><section class="surface monitor-section"><div class="surface-title"><h3>Station power history</h3><span class="muted">PV · load · grid · BESS</span></div>${renderHistory(detail)}</section><section class="surface monitor-section"><div class="surface-title"><h3>Device-level monitoring</h3><span class="muted">${detail.devices?.length || 0} devices · all available live points</span></div><div class="monitor-device-list">${(detail.devices || []).sort((a,b) => String(a.deviceType).localeCompare(String(b.deviceType)) || String(a.deviceSn).localeCompare(String(b.deviceSn))).map(renderDevice).join("") || `<p class="monitor-empty">No devices returned for this station.</p>`}</div></section><section class="surface monitor-section"><div class="surface-title"><h3>Deye API coverage</h3><span class="muted">Read-only calls</span></div><p class="muted">The drill-down requests station latest/history/alarms, the station device inventory, batched device latest data, measure-point catalogues, device history, device alarms and supported system/battery/TOU configuration reads.</p>${renderCoverage(detail.apiCoverage)}</section>`;
  }
  async function loadSite(systemId, force = false) {
    const system = getSystem(systemId), t = telemetryFor(system);
    if (!system || !t?.providerStationId) return null;
    if (!force && detailCache.has(systemId)) return detailCache.get(systemId);
    if (pendingDetails.has(systemId)) return pendingDetails.get(systemId);
    const request = (async () => {
      const response = await fetch(`/api/monitoring?stationId=${encodeURIComponent(t.providerStationId)}`, { headers: { Accept: "application/json" }, cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Detailed monitoring could not be loaded.");
      detailCache.set(systemId, payload.detail); applyAutomation(payload, true); return payload.detail;
    })().finally(() => pendingDetails.delete(systemId));
    pendingDetails.set(systemId, request); return request;
  }
  function renderSite(systemId, force = false) {
    const system = getSystem(systemId);
    if (!system) return renderMonitoring();
    state.view = "monitoring-site"; state.monitoringSystem = systemId; pageHeader("Monitoring", "O&M / SITE MONITORING"); backButton.hidden = false;
    const cached = force ? null : detailCache.get(systemId);
    if (cached) { appView.innerHTML = siteHtml(system, cached); return; }
    const t = telemetryFor(system);
    appView.innerHTML = `<div class="monitor-site-loading"><span class="monitor-spinner"></span><div><h2>${esc(system.name)}</h2><p>${t ? "Calling station, device, alarm, history and configuration endpoints…" : "No Deye station has been matched to this system yet."}</p></div></div>`;
    if (!t) return;
    loadSite(systemId, force).then((detail) => { if (state.view === "monitoring-site" && state.monitoringSystem === systemId && detail) appView.innerHTML = siteHtml(system, detail); }).catch((error) => { if (state.view === "monitoring-site" && state.monitoringSystem === systemId) appView.innerHTML = `<div class="monitor-site-error"><h2>${esc(system.name)}</h2><p>${esc(error.message)}</p><button class="button button-primary" data-action="refresh-monitoring-site" data-id="${esc(systemId)}">Try again</button></div>`; });
  }

  onAction = function enhancedOnAction(action, id) {
    if (action === "open-monitoring-site") return renderSite(id);
    if (action === "refresh-monitoring-site") return renderSite(id, true);
    if (action === "view-monitoring") return renderSite(id);
    return originalOnAction(action, id);
  };
  backButton.addEventListener("click", () => { if (state.view === "monitoring-site") renderMonitoring(); });
  window.setInterval(() => { if (document.visibilityState === "visible") refreshMonitoring(); }, 180000);
  window.setTimeout(() => { if (document.visibilityState === "visible" && monitoringState.status === "idle") refreshMonitoring(); }, 2500);
})();
