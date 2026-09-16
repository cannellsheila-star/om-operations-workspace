(() => {
  const baseDetailCache = new Map();
  const siteRangeCache = new Map();
  const deviceRangeCache = new Map();
  const originalFetch = window.fetch.bind(window);
  let timer = null;

  const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const n = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
  const slug = (v) => String(v || "site").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";

  function parseTime(value) {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    const date = Number.isFinite(numeric) ? new Date(numeric < 100000000000 ? numeric * 1000 : numeric) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function fullDateTime(value) {
    const d = value instanceof Date ? value : parseTime(value);
    if (!d) return String(value || "-");
    const p = (x) => String(x).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function formatInput(date) { return fullDateTime(date); }
  function parseInput(text) {
    const match = String(text || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
    if (!match) return null;
    const [, dd, mm, yyyy, hh, min] = match;
    const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), 0, 0);
    if (date.getFullYear() !== Number(yyyy) || date.getMonth() !== Number(mm) - 1 || date.getDate() !== Number(dd) || date.getHours() !== Number(hh) || date.getMinutes() !== Number(min)) return null;
    return date;
  }
  function fmt(value, unit = "", digits = 2) {
    const valueNumber = n(value);
    return valueNumber === null ? "-" : `${valueNumber.toLocaleString("en-ZA", { maximumFractionDigits: digits })}${unit ? ` ${unit}` : ""}`;
  }
  function stationPowerRows(data) {
    return (data?.power || []).map((r) => ({
      time: parseTime(r.timeStamp || r.dateTime || r.time),
      pv: n(r.generationPower) === null ? null : n(r.generationPower) / 1000,
      load: n(r.consumptionPower) === null ? null : n(r.consumptionPower) / 1000,
      grid: n(r.gridPower) === null ? null : n(r.gridPower) / 1000,
      charge: n(r.chargePower) === null ? null : n(r.chargePower) / 1000,
      discharge: n(r.dischargePower) === null ? null : n(r.dischargePower) / 1000,
      batteryPower: n(r.batteryPower) === null ? null : n(r.batteryPower) / 1000,
      soc: n(r.batterySOC),
    })).filter((r) => r.time).sort((a, b) => a.time - b.time);
  }
  function dailyRows(data) {
    return (data?.daily || []).map((r) => ({
      date: r.timeStamp ? parseTime(r.timeStamp) : new Date(Number(r.year || 0), Math.max(0, Number(r.month || 1) - 1), Number(r.day || 1)),
      generation: n(r.generationValue), consumption: n(r.consumptionValue), purchase: n(r.purchaseValue), charge: n(r.chargeValue), discharge: n(r.dischargeValue),
    })).filter((r) => r.date && !Number.isNaN(r.date.getTime()));
  }

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const raw = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      const url = new URL(raw, location.href);
      if (url.pathname === "/api/monitoring" && url.searchParams.get("stationId")) {
        response.clone().json().then((payload) => {
          if (!payload?.detail) return;
          const systemId = typeof state !== "undefined" ? state.monitoringSystem : "";
          if (systemId) baseDetailCache.set(systemId, payload.detail);
          schedule();
        }).catch(() => {});
      }
    } catch {}
    return response;
  };

  function schedule() { clearTimeout(timer); timer = setTimeout(enhance, 40); }

  function defaultRange(systemId) {
    const existing = siteRangeCache.get(systemId);
    if (existing?.from && existing?.to) return existing;
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    const next = { from, to, loading: false, data: null, error: "", selectedDevice: "" };
    siteRangeCache.set(systemId, next);
    return next;
  }

  function removeLegacySections() {
    document.querySelectorAll('[data-monitor-analytics="charts"], [data-monitor-analytics="electrical"]').forEach((el) => el.remove());
    document.querySelectorAll(".surface.monitor-section").forEach((section) => {
      const heading = section.querySelector("h3")?.textContent?.trim();
      if (["Station power history", "Device-level monitoring"].includes(heading)) section.remove();
    });
    document.querySelectorAll(".ma-export-actions").forEach((el) => el.remove());
  }

  function installStyles() {
    if (document.getElementById("monitor-workspace-style")) return;
    const style = document.createElement("style");
    style.id = "monitor-workspace-style";
    style.textContent = `
      .mw-shell{display:grid;gap:18px;margin:18px 0}.mw-toolbar{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;padding:16px}.mw-field{display:grid;gap:6px;min-width:210px}.mw-field label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;font-weight:700;opacity:.68}.mw-field input{height:38px;border:1px solid var(--line,#d8dee8);border-radius:7px;padding:0 10px;background:var(--surface,#fff);color:inherit}.mw-toolbar-actions{display:flex;gap:8px;flex-wrap:wrap}.mw-range-note{font-size:12px;opacity:.68;margin-left:auto;align-self:center}.mw-loading{padding:28px;text-align:center}.mw-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:16px}.mw-chart-card{grid-column:span 12;padding:18px}.mw-chart-card h3{margin:0 0 3px}.mw-chart-card p{margin:0 0 12px;font-size:12px;opacity:.68}.mw-chart-wrap{position:relative;overflow-x:auto}.mw-chart{width:100%;min-width:760px;display:block}.mw-tooltip{position:absolute;pointer-events:none;z-index:5;min-width:190px;max-width:270px;padding:9px 10px;border-radius:8px;background:rgba(20,28,39,.94);color:#fff;font-size:12px;line-height:1.45;box-shadow:0 7px 20px rgba(0,0,0,.2);transform:translate(10px,-50%)}.mw-tooltip strong{display:block;margin-bottom:3px}.mw-legend{display:flex;gap:12px;flex-wrap:wrap;margin:0 0 8px;font-size:12px}.mw-legend span{display:inline-flex;gap:6px;align-items:center}.mw-legend i{width:16px;height:3px;border-radius:2px}.mw-device-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.mw-device{display:grid;gap:5px;text-align:left;border:1px solid var(--line,#d8dee8);border-radius:9px;padding:12px;background:transparent;color:inherit;cursor:pointer}.mw-device:hover,.mw-device.active{border-color:#0f76d8;box-shadow:0 0 0 1px #0f76d8 inset}.mw-device small{opacity:.65}.mw-device-meta{display:flex;justify-content:space-between;gap:10px}.mw-device-panel{margin-top:16px}.mw-device-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.mw-device-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0}.mw-mini{border:1px solid var(--line,#d8dee8);border-radius:8px;padding:10px}.mw-mini span{display:block;font-size:11px;opacity:.64}.mw-mini strong{font-size:17px}.mw-chart-grid{display:grid;grid-template-columns:1fr;gap:14px}.mw-device-table{display:grid;gap:0;border:1px solid var(--line,#d8dee8);border-radius:9px;overflow:hidden}.mw-device-row{display:grid;grid-template-columns:1.4fr 1fr .7fr;gap:10px;padding:9px 11px;border-top:1px solid var(--line,#d8dee8);font-size:12px}.mw-device-row:first-child{border-top:0;background:rgba(120,130,145,.08);font-weight:700}.mw-error{padding:16px;border:1px solid #d97706;border-radius:8px}.mw-series-0{stroke:#0f76d8}.mw-series-1{stroke:#7a4cc2}.mw-series-2{stroke:#7d8794}.mw-series-3{stroke:#0a9b72}.mw-series-4{stroke:#d96b32}.mw-series-5{stroke:#bd3b77}.mw-line{fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.mw-gridline{stroke:rgba(120,130,145,.18);stroke-width:1}.mw-axis{stroke:rgba(120,130,145,.5);stroke-width:1}.mw-axistext{fill:currentColor;opacity:.68;font-size:11px}.mw-hover{stroke:rgba(20,28,39,.5);stroke-width:1;stroke-dasharray:4 3}.mw-point{fill:currentColor;opacity:0}.mw-point:hover{opacity:1}.mw-bar{fill:#0f76d8;opacity:.85}.mw-section-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:12px}.mw-section-head h3{margin:0}.mw-section-head p{margin:3px 0 0;font-size:12px;opacity:.67}@media(max-width:760px){.mw-range-note{width:100%;margin-left:0}.mw-device-row{grid-template-columns:1fr}.mw-chart{min-width:650px}}
    `;
    document.head.appendChild(style);
  }

  const colors = ["#0f76d8", "#7a4cc2", "#7d8794", "#0a9b72", "#d96b32", "#bd3b77"];
  function chart(rows, series, opts = {}) {
    if (!rows.length) return `<p class="monitor-empty">No data returned for this selected range.</p>`;
    const width = 980, height = 330, left = 58, right = opts.rightAxis ? 58 : 18, top = 20, bottom = 48;
    const plotW = width - left - right, plotH = height - top - bottom;
    const values = rows.flatMap((r) => series.filter((s) => !s.rightAxis).map((s) => n(r[s.key])).filter((v) => v !== null));
    let min = opts.min ?? Math.min(0, ...(values.length ? values : [0]));
    let max = opts.max ?? Math.max(...(values.length ? values : [1]));
    if (max === min) max = min + 1;
    const rightValues = rows.flatMap((r) => series.filter((s) => s.rightAxis).map((s) => n(r[s.key])).filter((v) => v !== null));
    let rightMin = opts.rightMin ?? Math.min(0, ...(rightValues.length ? rightValues : [0]));
    let rightMax = opts.rightMax ?? Math.max(...(rightValues.length ? rightValues : [1]));
    if (rightMax === rightMin) rightMax = rightMin + 1;
    const x = (i) => left + (rows.length === 1 ? plotW / 2 : i / (rows.length - 1) * plotW);
    const y = (v) => top + (1 - (v - min) / (max - min)) * plotH;
    const yr = (v) => top + (1 - (v - rightMin) / (rightMax - rightMin)) * plotH;
    const grid = Array.from({ length: 5 }, (_, i) => {
      const ratio = i / 4, gy = top + ratio * plotH, value = max - ratio * (max - min);
      const rightValue = rightMax - ratio * (rightMax - rightMin);
      return `<line x1="${left}" y1="${gy}" x2="${left + plotW}" y2="${gy}" class="mw-gridline"/><text x="${left - 8}" y="${gy + 4}" text-anchor="end" class="mw-axistext">${esc(value.toLocaleString("en-ZA", { maximumFractionDigits: 1 }))}</text>${opts.rightAxis ? `<text x="${left + plotW + 8}" y="${gy + 4}" class="mw-axistext">${esc(rightValue.toLocaleString("en-ZA", { maximumFractionDigits: 1 }))}</text>` : ""}`;
    }).join("");
    const tickIdx = [...new Set([0, Math.floor((rows.length - 1) * .25), Math.floor((rows.length - 1) * .5), Math.floor((rows.length - 1) * .75), rows.length - 1])];
    const ticks = tickIdx.map((i) => `<text x="${x(i)}" y="${height - 14}" text-anchor="middle" class="mw-axistext">${esc(fullDateTime(rows[i].time))}</text>`).join("");
    const paths = series.map((s, si) => {
      const points = rows.map((r, i) => { const v = n(r[s.key]); return v === null ? null : [x(i), s.rightAxis ? yr(v) : y(v)]; }).filter(Boolean);
      if (!points.length) return "";
      return `<polyline points="${points.map((p) => p.join(",")).join(" ")}" class="mw-line mw-series-${si % 6}"/>`;
    }).join("");
    const hitPoints = rows.map((r, i) => `<circle cx="${x(i)}" cy="${top + plotH / 2}" r="9" class="mw-point" data-chart-point="${i}"/>`).join("");
    const legend = series.map((s, i) => `<span><i style="background:${colors[i % colors.length]}"></i>${esc(s.label)}</span>`).join("");
    const data = encodeURIComponent(JSON.stringify(rows.map((r) => ({ time: r.time?.toISOString?.() || r.time, values: series.map((s) => ({ label: s.label, value: n(r[s.key]), unit: s.unit || opts.unit || "" })) }))));
    return `<div class="mw-chart-wrap" data-mw-chart="${data}"><div class="mw-legend">${legend}</div><svg class="mw-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet"><text x="15" y="${top + plotH / 2}" transform="rotate(-90 15 ${top + plotH / 2})" text-anchor="middle" class="mw-axistext">${esc(opts.unit || "")}</text>${opts.rightAxis ? `<text x="${width - 10}" y="${top + plotH / 2}" transform="rotate(90 ${width - 10} ${top + plotH / 2})" text-anchor="middle" class="mw-axistext">${esc(opts.rightUnit || "")}</text>` : ""}${grid}<line x1="${left}" y1="${top + plotH}" x2="${left + plotW}" y2="${top + plotH}" class="mw-axis"/>${paths}${ticks}${hitPoints}</svg><div class="mw-tooltip" hidden></div></div>`;
  }

  function dailyChart(rows) {
    if (!rows.length) return `<p class="monitor-empty">No daily kWh data returned for this selected range.</p>`;
    const width = 980, height = 320, left = 58, right = 18, top = 20, bottom = 54, plotW = width - left - right, plotH = height - top - bottom;
    const max = Math.max(1, ...rows.flatMap((r) => [r.generation, r.consumption, r.purchase].map((v) => n(v) || 0)));
    const slot = plotW / rows.length, groupW = Math.min(slot * .8, 58), barW = Math.max(3, groupW / 3);
    const grid = Array.from({ length: 5 }, (_, i) => { const ratio = i / 4, gy = top + ratio * plotH, val = max - ratio * max; return `<line x1="${left}" y1="${gy}" x2="${left + plotW}" y2="${gy}" class="mw-gridline"/><text x="${left - 8}" y="${gy + 4}" text-anchor="end" class="mw-axistext">${Math.round(val)}</text>`; }).join("");
    const bars = rows.map((r, i) => {
      const x0 = left + i * slot + (slot - groupW) / 2;
      const vals = [r.generation || 0, r.consumption || 0, r.purchase || 0];
      const rects = vals.map((value, j) => { const h = value / max * plotH; return `<rect x="${x0 + j * barW}" y="${top + plotH - h}" width="${barW - 1}" height="${h}" fill="${colors[j]}" opacity=".86"/>`; }).join("");
      const label = rows.length <= 16 || i % Math.ceil(rows.length / 12) === 0 || i === rows.length - 1 ? `<text x="${x0 + groupW / 2}" y="${height - 16}" text-anchor="middle" class="mw-axistext">${esc(fullDateTime(r.date).slice(0,10))}</text>` : "";
      return `<g data-daily-index="${i}">${rects}${label}<rect x="${left + i * slot}" y="${top}" width="${slot}" height="${plotH}" fill="transparent"/></g>`;
    }).join("");
    const data = encodeURIComponent(JSON.stringify(rows.map((r) => ({ time: r.date?.toISOString?.() || r.date, values: [{ label: "Generation", value: r.generation, unit: "kWh" }, { label: "Consumption", value: r.consumption, unit: "kWh" }, { label: "Grid purchase", value: r.purchase, unit: "kWh" }, { label: "BESS charge", value: r.charge, unit: "kWh" }, { label: "BESS discharge", value: r.discharge, unit: "kWh" }] }))));
    return `<div class="mw-chart-wrap" data-mw-chart="${data}"><div class="mw-legend"><span><i style="background:${colors[0]}"></i>Generation</span><span><i style="background:${colors[1]}"></i>Consumption</span><span><i style="background:${colors[2]}"></i>Grid purchase</span></div><svg class="mw-chart" viewBox="0 0 ${width} ${height}"><text x="15" y="${top + plotH / 2}" transform="rotate(-90 15 ${top + plotH / 2})" text-anchor="middle" class="mw-axistext">kWh</text>${grid}${bars}</svg><div class="mw-tooltip" hidden></div></div>`;
  }

  function attachChartHover(root = document) {
    root.querySelectorAll("[data-mw-chart]").forEach((wrap) => {
      if (wrap.dataset.hoverReady) return;
      wrap.dataset.hoverReady = "1";
      let data = [];
      try { data = JSON.parse(decodeURIComponent(wrap.dataset.mwChart || "")); } catch {}
      const svg = wrap.querySelector("svg"), tip = wrap.querySelector(".mw-tooltip");
      if (!svg || !tip || !data.length) return;
      svg.addEventListener("pointermove", (event) => {
        const rect = svg.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const index = Math.round(ratio * (data.length - 1));
        const row = data[index];
        if (!row) return;
        tip.innerHTML = `<strong>${esc(fullDateTime(row.time))}</strong>${row.values.filter((v) => v.value !== null && v.value !== undefined).map((v) => `<div>${esc(v.label)}: <b>${esc(fmt(v.value, v.unit, 2))}</b></div>`).join("")}`;
        tip.hidden = false;
        tip.style.left = `${Math.min(rect.width - 220, Math.max(0, event.clientX - rect.left))}px`;
        tip.style.top = `${Math.max(34, event.clientY - rect.top)}px`;
      });
      svg.addEventListener("pointerleave", () => { tip.hidden = true; });
    });
  }

  function deviceLabel(devices, device) {
    const same = devices.filter((d) => d.deviceType === device.deviceType);
    const index = same.findIndex((d) => d.deviceSn === device.deviceSn) + 1;
    const base = String(device.deviceType || "Device").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    return same.length > 1 ? `${base} ${index}` : base;
  }

  function stationWorkspace(system, range) {
    if (range.loading) return `<div class="surface mw-loading">Loading selected monitoring range…</div>`;
    if (range.error) return `<div class="mw-error">${esc(range.error)}</div>`;
    if (!range.data) return `<div class="surface mw-loading">Select a range and click Apply.</div>`;
    const power = stationPowerRows(range.data), daily = dailyRows(range.data), devices = range.data.devices || [];
    return `<div class="mw-grid"><section class="surface mw-chart-card"><h3>Power - kW</h3><p>PV, load, grid and BESS power across the selected time range.</p>${chart(power, [{ key:"pv", label:"PV", unit:"kW" }, { key:"load", label:"Load", unit:"kW" }, { key:"grid", label:"Grid", unit:"kW" }, { key:"batteryPower", label:"BESS", unit:"kW" }], { unit:"kW" })}</section><section class="surface mw-chart-card"><h3>Energy - kWh</h3><p>Daily generation, consumption and grid purchase. Hover for the full date and values.</p>${dailyChart(daily)}</section><section class="surface mw-chart-card"><h3>BESS - SOC, charge and discharge</h3><p>SOC on the left axis; charge and discharge power on the right axis.</p>${chart(power, [{ key:"soc", label:"SOC", unit:"%" }, { key:"charge", label:"Charge", unit:"kW", rightAxis:true }, { key:"discharge", label:"Discharge", unit:"kW", rightAxis:true }], { unit:"%", min:0, max:100, rightAxis:true, rightUnit:"kW" })}</section><section class="surface mw-chart-card"><div class="mw-section-head"><div><h3>Devices</h3><p>Select a device to drill into its strings, voltage, current, power and every measurement point available from Deye.</p></div><span class="muted">${devices.length} devices</span></div><div class="mw-device-list">${devices.map((d) => `<button class="mw-device ${range.selectedDevice === d.deviceSn ? "active" : ""}" data-mw-device="${esc(d.deviceSn)}" data-mw-device-type="${esc(d.deviceType)}"><strong>${esc(deviceLabel(devices, d))}</strong><small>SN ${esc(d.deviceSn)}</small><span class="mw-device-meta"><span>${esc(d.productId || "Product not returned")}</span><span>${String(d.connectStatus) === "1" ? "Online" : String(d.connectStatus) === "2" ? "Alert" : String(d.connectStatus) === "0" || String(d.connectStatus) === "3" ? "Offline" : "Status unknown"}</span></span></button>`).join("")}</div><div id="mw-device-panel" class="mw-device-panel">${range.selectedDevice ? `<div class="mw-loading">Loading device history…</div>` : `<p class="monitor-empty">Choose an inverter, BESS, meter or other device above.</p>`}</div></section></div>`;
  }

  function normalizeHistory(device) {
    const latestMap = new Map((device?.latest?.metrics || []).map((m) => [String(m.key || m.name), m]));
    const rows = (device?.history || []).map((sample) => {
      const time = parseTime(sample.time || sample.collectionTime || sample.dateTime || sample.timeStamp);
      const values = {};
      const items = Array.isArray(sample.itemList) ? sample.itemList : [];
      items.forEach((item) => { if (item && typeof item === "object") Object.entries(item).forEach(([key, value]) => { values[key] = n(value) ?? value; }); });
      return { time, values };
    }).filter((r) => r.time).sort((a, b) => a.time - b.time);
    return { rows, latestMap };
  }

  function inferUnit(metric) {
    const unit = String(metric?.unit || "").trim();
    if (unit) return unit;
    const text = `${metric?.key || ""} ${metric?.name || ""}`.toLowerCase();
    if (/soc|percent|capacity.*rate/.test(text)) return "%";
    if (/volt/.test(text)) return "V";
    if (/current|amp/.test(text)) return "A";
    if (/frequency/.test(text)) return "Hz";
    if (/temp/.test(text)) return "°C";
    if (/power/.test(text)) return "W";
    return "";
  }

  function metricGroups(device) {
    const { rows, latestMap } = normalizeHistory(device);
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r.values)))];
    const defs = keys.map((key) => { const live = latestMap.get(key) || { key, name:key, unit:"" }; return { key, label: live.name || key, unit: inferUnit(live), text: `${key} ${live.name || ""}`.toLowerCase() }; });
    const groups = [
      { title:"PV / string voltage", match:(d) => /(pv|string|mppt)/.test(d.text) && d.unit === "V", unit:"V" },
      { title:"PV / string current", match:(d) => /(pv|string|mppt)/.test(d.text) && d.unit === "A", unit:"A" },
      { title:"PV / string power", match:(d) => /(pv|string|mppt)/.test(d.text) && /^(W|kW)$/.test(d.unit), unit:"W" },
      { title:"Grid / AC voltage", match:(d) => /(grid|ac|phase|utility|mains)/.test(d.text) && d.unit === "V", unit:"V" },
      { title:"Grid / load current", match:(d) => /(grid|ac|phase|load|ups|utility|mains)/.test(d.text) && d.unit === "A", unit:"A" },
      { title:"Battery voltage", match:(d) => /(battery|bms|batt)/.test(d.text) && d.unit === "V", unit:"V" },
      { title:"Battery current", match:(d) => /(battery|bms|batt|charge|discharge)/.test(d.text) && d.unit === "A", unit:"A" },
      { title:"Temperature", match:(d) => d.unit === "°C" || /temperature|temp/.test(d.text), unit:"°C" },
      { title:"Frequency", match:(d) => d.unit === "Hz" || /frequency/.test(d.text), unit:"Hz" },
    ];
    return { rows, defs, groups: groups.map((g) => ({ ...g, defs: defs.filter(g.match) })).filter((g) => g.defs.length) };
  }

  function renderDevice(range, payload) {
    const panel = document.getElementById("mw-device-panel");
    if (!panel) return;
    if (!payload?.device) { panel.innerHTML = `<div class="mw-error">No device history was returned.</div>`; return; }
    const device = payload.device, devices = range.data?.devices || [], label = deviceLabel(devices, device);
    const { rows, groups } = metricGroups(device);
    const latest = device.latest?.metrics || [];
    const summaryMetrics = latest.filter((m) => /(soc|power|voltage|current|frequency|temperature|temp)/i.test(`${m.key} ${m.name}`)).slice(0, 8);
    panel.innerHTML = `<div class="mw-device-head"><div><h3>${esc(label)}</h3><p class="muted">SN ${esc(device.deviceSn)} | ${esc(device.deviceType)} | ${device.measurePoints?.length || 0} available measurement points</p></div><button class="button button-muted" type="button" data-mw-export-device>Export device range</button></div>${summaryMetrics.length ? `<div class="mw-device-kpis">${summaryMetrics.map((m) => `<div class="mw-mini"><span>${esc(m.name || m.key)}</span><strong>${esc(m.value ?? "-")} ${esc(m.unit || "")}</strong></div>`).join("")}</div>` : ""}<div class="mw-chart-grid">${groups.map((g) => { const chartRows = rows.map((r) => ({ time:r.time, ...Object.fromEntries(g.defs.map((d) => [d.key, r.values[d.key]])) })); return `<section class="surface mw-chart-card"><h3>${esc(g.title)}</h3><p>${g.defs.length} measurement${g.defs.length === 1 ? "" : "s"} across the selected date/time range.</p>${chart(chartRows, g.defs.slice(0, 6).map((d) => ({ key:d.key, label:d.label, unit:g.unit })), { unit:g.unit })}</section>`; }).join("") || `<p class="monitor-empty">Deye returned device history, but no graphable voltage/current/string groups were identified for this device type.</p>`}</div><details style="margin-top:14px"><summary><strong>All current device measurements | ${latest.length}</strong></summary><div class="mw-device-table" style="margin-top:10px"><div class="mw-device-row"><span>Measurement</span><span>Value</span><span>Key</span></div>${latest.map((m) => `<div class="mw-device-row"><span>${esc(m.name || m.key)}</span><span>${esc(m.value ?? "-")} ${esc(m.unit || "")}</span><span>${esc(m.key || "")}</span></div>`).join("")}</div></details>`;
    attachChartHover(panel);
  }

  async function loadSiteRange(systemId, from, to) {
    const range = defaultRange(systemId);
    range.from = from; range.to = to; range.loading = true; range.error = ""; range.data = null; range.selectedDevice = "";
    renderRangeArea(systemId);
    const detail = baseDetailCache.get(systemId);
    if (!detail?.providerStationId) { range.loading = false; range.error = "No Deye station ID is available for this system."; renderRangeArea(systemId); return; }
    try {
      const url = `/api/monitoring-range?stationId=${encodeURIComponent(detail.providerStationId)}&from=${Math.floor(from.getTime()/1000)}&to=${Math.floor(to.getTime()/1000)}`;
      const response = await originalFetch(url, { headers:{ Accept:"application/json" }, cache:"no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Selected monitoring range could not be loaded.");
      range.data = payload; range.loading = false;
    } catch (error) { range.loading = false; range.error = error.message || "Selected monitoring range could not be loaded."; }
    renderRangeArea(systemId);
  }

  async function loadDevice(systemId, sn, type) {
    const range = defaultRange(systemId), detail = baseDetailCache.get(systemId);
    range.selectedDevice = sn; renderRangeArea(systemId);
    const key = `${systemId}|${sn}|${range.from.getTime()}|${range.to.getTime()}`;
    if (deviceRangeCache.has(key)) { renderDevice(range, deviceRangeCache.get(key)); return; }
    try {
      const url = `/api/monitoring-range?stationId=${encodeURIComponent(detail.providerStationId)}&from=${Math.floor(range.from.getTime()/1000)}&to=${Math.floor(range.to.getTime()/1000)}&deviceSn=${encodeURIComponent(sn)}&deviceType=${encodeURIComponent(type || "")}`;
      const response = await originalFetch(url, { headers:{ Accept:"application/json" }, cache:"no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Device history could not be loaded.");
      deviceRangeCache.set(key, payload); renderDevice(range, payload);
    } catch (error) { const panel = document.getElementById("mw-device-panel"); if (panel) panel.innerHTML = `<div class="mw-error">${esc(error.message || "Device history could not be loaded.")}</div>`; }
  }

  function csvCell(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
  function download(name, text) { const blob = new Blob([text], { type:"text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function exportRange(systemId) {
    const system = getSystem(systemId), range = defaultRange(systemId), data = range.data;
    if (!data) return;
    const rows = [["category","timestamp","metric","value","unit"]];
    stationPowerRows(data).forEach((r) => [["PV",r.pv,"kW"],["Load",r.load,"kW"],["Grid",r.grid,"kW"],["BESS power",r.batteryPower,"kW"],["BESS charge",r.charge,"kW"],["BESS discharge",r.discharge,"kW"],["BESS SOC",r.soc,"%"]].forEach(([m,v,u]) => { if (v !== null) rows.push(["station_power", fullDateTime(r.time), m, v, u]); }));
    dailyRows(data).forEach((r) => [["Generation",r.generation,"kWh"],["Consumption",r.consumption,"kWh"],["Grid purchase",r.purchase,"kWh"],["BESS charge",r.charge,"kWh"],["BESS discharge",r.discharge,"kWh"]].forEach(([m,v,u]) => { if (v !== null) rows.push(["station_daily", fullDateTime(r.date), m, v, u]); }));
    download(`${slug(system?.name)}-${fullDateTime(range.from).replace(/[\/: ]/g,"-")}-to-${fullDateTime(range.to).replace(/[\/: ]/g,"-")}.csv`, rows.map((r) => r.map(csvCell).join(",")).join("\r\n"));
  }

  function renderRangeArea(systemId) {
    const system = getSystem(systemId), range = defaultRange(systemId), host = document.getElementById("mw-host");
    if (!host || !system) return;
    host.innerHTML = `<section class="surface mw-toolbar"><div class="mw-field"><label>From</label><input id="mw-from" value="${esc(formatInput(range.from))}" placeholder="dd/mm/yyyy hh:mm" inputmode="numeric" /></div><div class="mw-field"><label>To</label><input id="mw-to" value="${esc(formatInput(range.to))}" placeholder="dd/mm/yyyy hh:mm" inputmode="numeric" /></div><div class="mw-toolbar-actions"><button class="button button-primary" type="button" data-mw-apply>Apply range</button><button class="button button-muted" type="button" data-mw-24h>Last 24h</button><button class="button button-muted" type="button" data-mw-7d>Last 7 days</button><button class="button button-muted" type="button" data-mw-export-range ${range.data ? "" : "disabled"}>Export selected range</button></div><span class="mw-range-note">${esc(range.data?.station?.timezone || baseDetailCache.get(systemId)?.stationTimezone || "Station time")} | hover graphs for dd/mm/yyyy hh:mm</span></section>${stationWorkspace(system, range)}`;
    attachChartHover(host);
    if (range.selectedDevice) {
      const match = [...deviceRangeCache.entries()].find(([key]) => key.startsWith(`${systemId}|${range.selectedDevice}|${range.from.getTime()}|${range.to.getTime()}`));
      if (match) renderDevice(range, match[1]);
    }
  }

  function enhance() {
    installStyles();
    if (typeof state === "undefined" || state.view !== "monitoring-site" || !state.monitoringSystem) return;
    const systemId = state.monitoringSystem;
    removeLegacySections();
    const kpis = document.querySelector(".monitor-site-kpis");
    if (!kpis) return;
    let host = document.getElementById("mw-host");
    if (!host) { host = document.createElement("div"); host.id = "mw-host"; host.className = "mw-shell"; kpis.insertAdjacentElement("afterend", host); }
    renderRangeArea(systemId);
    const range = defaultRange(systemId);
    if (!range.loading && !range.data && !range.error && baseDetailCache.get(systemId)) loadSiteRange(systemId, range.from, range.to);
  }

  document.addEventListener("click", (event) => {
    if (typeof state === "undefined" || state.view !== "monitoring-site") return;
    const systemId = state.monitoringSystem, range = defaultRange(systemId);
    const device = event.target.closest?.("[data-mw-device]");
    if (device) { loadDevice(systemId, device.dataset.mwDevice, device.dataset.mwDeviceType); return; }
    if (event.target.closest?.("[data-mw-apply]")) {
      const from = parseInput(document.getElementById("mw-from")?.value), to = parseInput(document.getElementById("mw-to")?.value);
      if (!from || !to) { showToast("Use date/time format dd/mm/yyyy hh:mm."); return; }
      if (to <= from) { showToast("The end date/time must be after the start date/time."); return; }
      loadSiteRange(systemId, from, to); return;
    }
    if (event.target.closest?.("[data-mw-24h]")) { const to = new Date(), from = new Date(to.getTime() - 86400000); loadSiteRange(systemId, from, to); return; }
    if (event.target.closest?.("[data-mw-7d]")) { const to = new Date(), from = new Date(to.getTime() - 7 * 86400000); loadSiteRange(systemId, from, to); return; }
    if (event.target.closest?.("[data-mw-export-range]")) { exportRange(systemId); return; }
    if (event.target.closest?.("[data-mw-export-device]")) {
      const match = [...deviceRangeCache.entries()].find(([key]) => key.startsWith(`${systemId}|${range.selectedDevice}|${range.from.getTime()}|${range.to.getTime()}`));
      if (!match) return;
      const payload = match[1], deviceData = payload.device, rows = [["timestamp","device","measurement","value","unit"]];
      const latestMap = new Map((deviceData.latest?.metrics || []).map((m) => [String(m.key || m.name), m]));
      normalizeHistory(deviceData).rows.forEach((r) => Object.entries(r.values).forEach(([key,value]) => { const m = latestMap.get(key) || {}; rows.push([fullDateTime(r.time), deviceData.deviceSn, m.name || key, value, m.unit || inferUnit({ key, name:m.name, unit:m.unit })]); }));
      download(`${slug(getSystem(systemId)?.name)}-${slug(deviceData.deviceType)}-${deviceData.deviceSn}.csv`, rows.map((r) => r.map(csvCell).join(",")).join("\r\n"));
    }
  });

  new MutationObserver(schedule).observe(document.body, { childList:true, subtree:true });
  installStyles();
  schedule();
})();
