(() => {
  const detailCache = new Map();
  const nativeFetch = window.fetch.bind(window);
  let enhanceTimer = null;

  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const escapeHtml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
  const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const slug = (value) => String(value || "site").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";

  function scheduleEnhance() {
    window.clearTimeout(enhanceTimer);
    enhanceTimer = window.setTimeout(enhanceCurrentSite, 30);
  }

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    try {
      const rawUrl = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      const url = new URL(rawUrl, window.location.href);
      if (url.pathname === "/api/monitoring" && url.searchParams.get("stationId")) {
        response.clone().json().then((payload) => {
          if (!payload?.detail) return;
          const currentSystemId = typeof state !== "undefined" ? state.monitoringSystem : "";
          if (currentSystemId) detailCache.set(currentSystemId, payload.detail);
          if (payload.detail.systemId) detailCache.set(String(payload.detail.systemId), payload.detail);
          if (payload.detail.providerStationId) detailCache.set(`station:${payload.detail.providerStationId}`, payload.detail);
          scheduleEnhance();
        }).catch(() => {});
      }
    } catch {}
    return response;
  };

  function parseTime(value) {
    if (value === null || value === undefined || value === "") return null;
    const numericValue = Number(value);
    const date = Number.isFinite(numericValue)
      ? new Date(numericValue < 100000000000 ? numericValue * 1000 : numericValue)
      : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function timeLabel(value) {
    const date = parseTime(value);
    if (!date) return String(value || "—");
    return date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
  }

  function dateLabel(row) {
    const direct = row?.dateTime || row?.timeStamp || row?.time || row?.collectionTime;
    const date = parseTime(direct);
    if (date) return date.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" });
    const year = Number(row?.year), month = Number(row?.month), day = Number(row?.day);
    if (year && month && day) return new Date(year, month - 1, day).toLocaleDateString("en-ZA", { day: "2-digit", month: "short" });
    if (year && month) return new Date(year, month - 1, 1).toLocaleDateString("en-ZA", { month: "short", year: "numeric" });
    if (year) return String(year);
    return "—";
  }

  function stationPowerRows(detail) {
    return (Array.isArray(detail?.powerHistory) ? detail.powerHistory : [])
      .map((row) => ({
        time: parseTime(row.timeStamp || row.dateTime || row.time),
        pv: number(row.generationPower) === null ? null : number(row.generationPower) / 1000,
        load: number(row.consumptionPower) === null ? null : number(row.consumptionPower) / 1000,
        grid: number(row.gridPower) === null ? null : number(row.gridPower) / 1000,
        charge: number(row.chargePower) === null ? null : number(row.chargePower) / 1000,
        discharge: number(row.dischargePower) === null ? null : number(row.dischargePower) / 1000,
        soc: number(row.batterySOC),
      }))
      .filter((row) => row.time)
      .sort((a, b) => a.time - b.time);
  }

  function dailyRows(detail) {
    return (Array.isArray(detail?.history) ? detail.history : [])
      .map((row) => ({
        label: dateLabel(row),
        generation: number(row.generationValue ?? row.generation ?? row.generationEnergy ?? row.energy),
        consumption: number(row.consumptionValue),
        purchase: number(row.purchaseValue),
        charge: number(row.chargeValue),
        discharge: number(row.dischargeValue),
      }))
      .filter((row) => row.generation !== null || row.consumption !== null || row.purchase !== null);
  }

  function smoothPath(points) {
    if (!points.length) return "";
    if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
    let path = `M ${points[0][0]} ${points[0][1]}`;
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const cur = points[i];
      const mid = (prev[0] + cur[0]) / 2;
      path += ` C ${mid} ${prev[1]}, ${mid} ${cur[1]}, ${cur[0]} ${cur[1]}`;
    }
    return path;
  }

  function lineChart(rows, series, unit, idPrefix, yMinOverride = null, yMaxOverride = null) {
    if (!rows.length) return `<p class="monitor-empty">No time-series data returned for this period.</p>`;
    const width = 920, height = 320, left = 62, right = 18, top = 22, bottom = 48;
    const plotW = width - left - right, plotH = height - top - bottom;
    const values = rows.flatMap((row) => series.map((s) => number(row[s.key])).filter((v) => v !== null));
    if (!values.length) return `<p class="monitor-empty">No numeric values were returned for this chart.</p>`;
    let yMin = yMinOverride === null ? Math.min(0, ...values) : yMinOverride;
    let yMax = yMaxOverride === null ? Math.max(...values) : yMaxOverride;
    if (yMax === yMin) yMax = yMin + 1;
    const xFor = (index) => left + (rows.length === 1 ? plotW / 2 : (index / (rows.length - 1)) * plotW);
    const yFor = (value) => top + (1 - ((value - yMin) / (yMax - yMin))) * plotH;
    const grid = Array.from({ length: 5 }, (_, i) => {
      const ratio = i / 4;
      const y = top + ratio * plotH;
      const value = yMax - ratio * (yMax - yMin);
      return `<line x1="${left}" y1="${y}" x2="${left + plotW}" y2="${y}" class="ma-grid"/><text x="${left - 10}" y="${y + 4}" text-anchor="end" class="ma-axis-label">${escapeHtml(value.toLocaleString("en-ZA", { maximumFractionDigits: 1 }))}</text>`;
    }).join("");
    const xTickIndexes = [...new Set([0, Math.floor((rows.length - 1) * 0.25), Math.floor((rows.length - 1) * 0.5), Math.floor((rows.length - 1) * 0.75), rows.length - 1])];
    const xTicks = xTickIndexes.map((i) => `<text x="${xFor(i)}" y="${height - 16}" text-anchor="middle" class="ma-axis-label">${escapeHtml(timeLabel(rows[i].time))}</text>`).join("");
    const paths = series.map((s, seriesIndex) => {
      const points = rows.map((row, index) => {
        const value = number(row[s.key]);
        return value === null ? null : [xFor(index), yFor(value)];
      }).filter(Boolean);
      return points.length ? `<path d="${smoothPath(points)}" class="ma-line ma-series-${seriesIndex}" vector-effect="non-scaling-stroke"/>` : "";
    }).join("");
    const legend = series.map((s, index) => `<span><i class="ma-legend ma-series-bg-${index}"></i>${escapeHtml(s.label)}</span>`).join("");
    return `<div class="ma-chart-wrap"><div class="ma-chart-legend">${legend}</div><svg class="ma-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Time-series chart"><text x="16" y="${top + plotH / 2}" transform="rotate(-90 16 ${top + plotH / 2})" text-anchor="middle" class="ma-axis-title">${escapeHtml(unit)}</text>${grid}<line x1="${left}" y1="${top + plotH}" x2="${left + plotW}" y2="${top + plotH}" class="ma-axis"/>${paths}${xTicks}</svg></div>`;
  }

  function barChart(rows, key, unit) {
    if (!rows.length) return `<p class="monitor-empty">No daily energy values returned.</p>`;
    const width = 920, height = 300, left = 62, right = 18, top = 22, bottom = 54;
    const plotW = width - left - right, plotH = height - top - bottom;
    const vals = rows.map((r) => number(r[key]) || 0);
    const max = Math.max(1, ...vals);
    const slot = plotW / rows.length;
    const barW = Math.max(8, Math.min(48, slot * 0.62));
    const grid = Array.from({ length: 5 }, (_, i) => {
      const ratio = i / 4;
      const y = top + ratio * plotH;
      const value = max - ratio * max;
      return `<line x1="${left}" y1="${y}" x2="${left + plotW}" y2="${y}" class="ma-grid"/><text x="${left - 10}" y="${y + 4}" text-anchor="end" class="ma-axis-label">${escapeHtml(value.toLocaleString("en-ZA", { maximumFractionDigits: 0 }))}</text>`;
    }).join("");
    const bars = rows.map((row, i) => {
      const value = number(row[key]) || 0;
      const h = (value / max) * plotH;
      const x = left + i * slot + (slot - barW) / 2;
      const y = top + plotH - h;
      const showLabel = rows.length <= 14 || i % Math.ceil(rows.length / 12) === 0 || i === rows.length - 1;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" class="ma-bar"><title>${escapeHtml(row.label)}: ${escapeHtml(value)} ${escapeHtml(unit)}</title></rect>${showLabel ? `<text x="${x + barW / 2}" y="${height - 18}" text-anchor="middle" class="ma-axis-label">${escapeHtml(row.label)}</text>` : ""}`;
    }).join("");
    return `<div class="ma-chart-wrap"><svg class="ma-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily energy chart"><text x="16" y="${top + plotH / 2}" transform="rotate(-90 16 ${top + plotH / 2})" text-anchor="middle" class="ma-axis-title">${escapeHtml(unit)}</text>${grid}<line x1="${left}" y1="${top + plotH}" x2="${left + plotW}" y2="${top + plotH}" class="ma-axis"/>${bars}</svg></div>`;
  }

  function electricalRows(detail) {
    const result = [];
    (detail?.devices || []).forEach((device) => {
      const buckets = new Map();
      (device.metrics || []).forEach((metric) => {
        const text = `${metric.key || ""} ${metric.name || ""}`;
        if (!/(pv|mppt|string)/i.test(text) || !/(volt|current|amp|power)/i.test(text)) return;
        const match = text.match(/(?:pv|mppt|string)\s*[-_ ]?(\d+)/i) || text.match(/(\d+)\s*(?:pv|mppt|string)/i);
        const input = match ? `Input ${match[1]}` : "PV/DC";
        const key = `${device.deviceSn}|${input}`;
        if (!buckets.has(key)) buckets.set(key, { deviceSn: device.deviceSn, deviceType: device.deviceType, input, voltage: "", current: "", power: "", extras: [] });
        const row = buckets.get(key);
        const formatted = `${metric.value ?? "—"}${metric.unit ? ` ${metric.unit}` : ""}`;
        if (/volt/i.test(text)) row.voltage = formatted;
        else if (/current|amp/i.test(text)) row.current = formatted;
        else if (/power/i.test(text)) row.power = formatted;
        else row.extras.push(`${metric.name || metric.key}: ${formatted}`);
      });
      result.push(...buckets.values());
    });
    return result;
  }

  function allElectricalMetrics(detail) {
    const rows = [];
    (detail?.devices || []).forEach((device) => {
      (device.metrics || []).forEach((metric) => {
        const text = `${metric.key || ""} ${metric.name || ""}`;
        if (/(volt|current|amp|frequency|insulation|resistance|pv|string|mppt|battery|grid|load|temperature|temp)/i.test(text)) {
          rows.push({ deviceSn: device.deviceSn, deviceType: device.deviceType, name: metric.name || metric.key, key: metric.key, value: metric.value, unit: metric.unit });
        }
      });
    });
    return rows;
  }

  function electricalTable(detail) {
    const strings = electricalRows(detail);
    const all = allElectricalMetrics(detail);
    return `<section class="surface monitor-section ma-section" data-monitor-analytics="electrical"><div class="surface-title"><h3>String, MPPT, voltage & current detail</h3><span class="muted">Live values returned by Deye</span></div>${strings.length ? `<div class="ma-table"><div class="ma-table-head"><span>Device</span><span>Input / string</span><span>Voltage</span><span>Current</span><span>Power</span></div>${strings.map((r) => `<div class="ma-table-row"><span><strong>${escapeHtml(r.deviceType || "Device")}</strong><small>${escapeHtml(r.deviceSn)}</small></span><span>${escapeHtml(r.input)}</span><span>${escapeHtml(r.voltage || "—")}</span><span>${escapeHtml(r.current || "—")}</span><span>${escapeHtml(r.power || "—")}</span></div>`).join("")}</div>` : `<p class="monitor-empty">No PV/string voltage-current points were returned for these devices. The full electrical telemetry below still shows every voltage/current point Deye exposes.</p>`}<details class="ma-all-electrical"><summary>All electrical measurements · ${all.length}</summary><div class="device-metric-grid">${all.map((r) => `<div class="device-metric"><span>${escapeHtml(r.name)}</span><strong>${escapeHtml(r.value ?? "—")} ${escapeHtml(r.unit || "")}</strong><small>${escapeHtml(r.deviceType)} · ${escapeHtml(r.deviceSn)} · ${escapeHtml(r.key || "")}</small></div>`).join("")}</div></details></section>`;
  }

  function chartsSection(system, detail) {
    const power = stationPowerRows(detail);
    const daily = dailyRows(detail);
    const capacity = number(system?.kwp ?? detail?.installedCapacityKw);
    return `<section class="surface monitor-section ma-section" data-monitor-analytics="charts"><div class="surface-title"><h3>Performance curves</h3><span class="muted">Time-based power and energy history</span></div><div class="ma-chart-block"><div class="ma-chart-title"><div><h4>Power curve</h4><p>PV, load, grid and BESS power against time</p></div><strong>${power.length ? `${power.length} samples` : "No samples"}</strong></div>${lineChart(power, [{ key: "pv", label: "PV" }, { key: "load", label: "Load" }, { key: "grid", label: "Grid" }, { key: "charge", label: "BESS charge" }, { key: "discharge", label: "BESS discharge" }], "kW", "power")}</div><div class="ma-chart-block"><div class="ma-chart-title"><div><h4>BESS state of charge</h4><p>SOC against time</p></div><strong>${escapeHtml(detail?.batterySoc ?? "—")}% now</strong></div>${lineChart(power, [{ key: "soc", label: "SOC" }], "%", "soc", 0, 100)}</div><div class="ma-chart-block"><div class="ma-chart-title"><div><h4>Daily generation</h4><p>Energy produced per day${capacity !== null ? ` · Installed capacity ${escapeHtml(capacity.toLocaleString("en-ZA", { maximumFractionDigits: 2 }))} kWp` : ""}</p></div><strong>${daily.length} daily values</strong></div>${barChart(daily, "generation", "kWh")}</div></section>`;
  }

  function flattenForExport(system, detail) {
    const rows = [];
    const base = { site: system?.name || detail?.name || "", systemId: system?.id || detail?.systemId || "", stationId: detail?.providerStationId || "" };
    const add = (category, device, timestamp, metric, value, unit = "", status = "", details = "") => rows.push({ category, ...base, deviceSn: device?.deviceSn || "", deviceType: device?.deviceType || "", timestamp: timestamp || "", metric, value: value ?? "", unit, status, details });
    [
      ["PV power", detail?.powerKw, "kW"], ["Generation today", detail?.energyTodayKwh, "kWh"], ["Load power", detail?.consumptionPowerKw, "kW"], ["Grid power", detail?.gridPowerKw, "kW"],
      ["Grid purchase", detail?.purchasePowerKw, "kW"], ["Battery SOC", detail?.batterySoc, "%"], ["Battery power", detail?.batteryPowerKw, "kW"], ["Battery charge", detail?.chargePowerKw, "kW"], ["Battery discharge", detail?.dischargePowerKw, "kW"], ["Irradiance", detail?.irradiance, "W/m²"]
    ].forEach(([metric, value, unit]) => add("station_live", null, detail?.lastSync, metric, value, unit, detail?.status));
    stationPowerRows(detail).forEach((r) => [["PV power", r.pv, "kW"], ["Load power", r.load, "kW"], ["Grid power", r.grid, "kW"], ["BESS charge", r.charge, "kW"], ["BESS discharge", r.discharge, "kW"], ["BESS SOC", r.soc, "%"]].forEach(([metric, value, unit]) => add("station_timeseries", null, r.time?.toISOString?.() || "", metric, value, unit)));
    dailyRows(detail).forEach((r) => [["Generation", r.generation, "kWh"], ["Consumption", r.consumption, "kWh"], ["Grid purchase", r.purchase, "kWh"], ["Battery charge", r.charge, "kWh"], ["Battery discharge", r.discharge, "kWh"]].forEach(([metric, value, unit]) => { if (value !== null) add("station_daily", null, r.label, metric, value, unit); }));
    (detail?.devices || []).forEach((device) => {
      (device.metrics || []).forEach((m) => add("device_live", device, device.collectionTime, m.name || m.key, m.value, m.unit, device.status, m.key));
      (device.history || []).forEach((sample) => {
        const timestamp = sample.collectionTime || sample.time || sample.dateTime || "";
        (sample.itemList || []).forEach((m) => add("device_history", device, timestamp, m.name || m.key, m.value, m.unit, device.status, m.key));
      });
      (device.alerts || []).forEach((a) => add("device_alarm", device, a.startTime, a.name || a.code, a.active ? "Active" : "Cleared", "", a.active ? "Alert" : "Cleared", [a.description, a.reason, a.solution].filter(Boolean).join(" | ")));
    });
    (detail?.alerts || []).filter((a) => !a.deviceSn).forEach((a) => add("station_alarm", null, a.startTime, a.name || a.code, a.active ? "Active" : "Cleared", "", a.active ? "Alert" : "Cleared", [a.description, a.reason, a.solution].filter(Boolean).join(" | ")));
    return rows;
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCsv(system, detail) {
    const rows = flattenForExport(system, detail);
    const columns = ["category", "site", "systemId", "stationId", "deviceSn", "deviceType", "timestamp", "metric", "value", "unit", "status", "details"];
    const csv = [columns.map(csvCell).join(","), ...rows.map((row) => columns.map((key) => csvCell(row[key])).join(","))].join("\r\n");
    download(`${slug(system?.name || detail?.name)}-monitoring-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8");
  }

  function exportJson(system, detail) {
    download(`${slug(system?.name || detail?.name)}-monitoring-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), system, detail }, null, 2), "application/json;charset=utf-8");
  }

  function installStyles() {
    if (document.getElementById("monitoring-analytics-style")) return;
    const style = document.createElement("style");
    style.id = "monitoring-analytics-style";
    style.textContent = `
      .ma-export-actions{display:inline-flex;gap:8px;flex-wrap:wrap;margin-left:8px}.ma-section{overflow:hidden}.ma-chart-block{margin-top:18px;padding-top:18px;border-top:1px solid var(--line,#d8dee8)}.ma-chart-block:first-of-type{margin-top:0;padding-top:0;border-top:0}.ma-chart-title{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:10px}.ma-chart-title h4{margin:0 0 3px}.ma-chart-title p{margin:0;color:var(--muted,#6d7787);font-size:13px}.ma-chart-wrap{width:100%;overflow-x:auto}.ma-chart{width:100%;min-width:700px;height:auto;display:block}.ma-grid{stroke:rgba(120,130,145,.18);stroke-width:1}.ma-axis{stroke:rgba(120,130,145,.5);stroke-width:1}.ma-axis-label,.ma-axis-title{fill:currentColor;opacity:.68;font-size:11px}.ma-line{fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.ma-series-0{stroke:#0f76d8}.ma-series-1{stroke:#7a4cc2}.ma-series-2{stroke:#7d8794}.ma-series-3{stroke:#0a9b72}.ma-series-4{stroke:#d96b32}.ma-chart-legend{display:flex;gap:14px;flex-wrap:wrap;margin:2px 0 6px;font-size:12px}.ma-chart-legend span{display:inline-flex;align-items:center;gap:6px}.ma-legend{width:18px;height:3px;border-radius:2px;display:inline-block}.ma-series-bg-0{background:#0f76d8}.ma-series-bg-1{background:#7a4cc2}.ma-series-bg-2{background:#7d8794}.ma-series-bg-3{background:#0a9b72}.ma-series-bg-4{background:#d96b32}.ma-bar{fill:#0f76d8;opacity:.86}.ma-table{display:grid;gap:0;border:1px solid var(--line,#d8dee8);border-radius:10px;overflow:hidden}.ma-table-head,.ma-table-row{display:grid;grid-template-columns:1.45fr 1fr 1fr 1fr 1fr;gap:12px;align-items:center;padding:10px 12px}.ma-table-head{font-size:11px;text-transform:uppercase;letter-spacing:.04em;background:rgba(120,130,145,.08);font-weight:700}.ma-table-row{border-top:1px solid var(--line,#d8dee8);font-size:13px}.ma-table-row span:first-child{display:flex;flex-direction:column}.ma-table-row small{opacity:.65}.ma-all-electrical{margin-top:14px}.ma-all-electrical summary{cursor:pointer;font-weight:700}.ma-all-electrical .device-metric-grid{margin-top:12px}@media(max-width:800px){.ma-table{overflow-x:auto}.ma-table-head,.ma-table-row{min-width:720px}.ma-chart-title{flex-direction:column}.ma-export-actions{margin-left:0;margin-top:8px}}`;
    document.head.appendChild(style);
  }

  function enhanceCurrentSite() {
    installStyles();
    if (typeof state === "undefined" || state.view !== "monitoring-site") return;
    const systemId = state.monitoringSystem;
    const system = typeof getSystem === "function" ? getSystem(systemId) : null;
    const detail = detailCache.get(systemId) || detailCache.get(String(systemId));
    if (!system || !detail) return;
    const head = document.querySelector(".monitor-site-head");
    const kpis = document.querySelector(".monitor-site-kpis");
    if (!head || !kpis) return;
    if (!head.querySelector(".ma-export-actions")) {
      const right = head.lastElementChild;
      const actions = document.createElement("span");
      actions.className = "ma-export-actions";
      actions.innerHTML = `<button class="button button-muted" type="button" data-monitor-export="csv">Export CSV</button><button class="button button-muted" type="button" data-monitor-export="json">Export JSON</button>`;
      right?.appendChild(actions);
    }
    if (!document.querySelector('[data-monitor-analytics="charts"]')) kpis.insertAdjacentHTML("afterend", chartsSection(system, detail));
    const charts = document.querySelector('[data-monitor-analytics="charts"]');
    if (!document.querySelector('[data-monitor-analytics="electrical"]')) charts?.insertAdjacentHTML("afterend", electricalTable(detail));
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-monitor-export]");
    if (!button) return;
    const systemId = typeof state !== "undefined" ? state.monitoringSystem : "";
    const system = typeof getSystem === "function" ? getSystem(systemId) : null;
    const detail = detailCache.get(systemId) || detailCache.get(String(systemId));
    if (!system || !detail) return;
    if (button.dataset.monitorExport === "csv") exportCsv(system, detail);
    if (button.dataset.monitorExport === "json") exportJson(system, detail);
  });

  new MutationObserver(() => scheduleEnhance()).observe(document.body, { childList: true, subtree: true });
  installStyles();
})();
