(() => {
  const previousOnAction = window.onAction || onAction;
  const fusion = window.fusionSolarMonitoring || (window.fusionSolarMonitoring = {
    status: "idle", data: null, message: "", detailCache: new Map(), pending: new Map(), selectedPlant: new Map(),
  });
  if (!(fusion.detailCache instanceof Map)) fusion.detailCache = new Map();
  if (!(fusion.selectedPlant instanceof Map)) fusion.selectedPlant = new Map();

  const rangeState = new Map();
  const rangeCache = new Map();
  const deviceCache = new Map();
  const supportedHistoryTypes = new Set([1, 10, 17, 38, 39, 41, 47, 60001, 60003, 60043, 60014, 60010, 23070]);
  const colors = ["#0f76d8", "#7a4cc2", "#7d8794", "#0a9b72", "#d96b32", "#bd3b77"];

  window.monitoringStandard = window.monitoringStandard || { providers: new Map(), version: "1" };
  window.monitoringStandard.providers.set("FusionSolar", { layout: "site-kpis-range-power-energy-bess-devices", deviceDrilldown: true });
  window.monitoringStandard.providers.set("Deye", window.monitoringStandard.providers.get("Deye") || { layout: "site-kpis-range-power-energy-bess-devices", deviceDrilldown: true });

  const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const num = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const norm = (value) => String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  const slug = (value) => String(value || "site").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";
  const fmt = (value, unit = "", digits = 2) => {
    const n = num(value);
    return n === null ? "—" : `${n.toLocaleString("en-ZA", { maximumFractionDigits: digits })}${unit ? ` ${unit}` : ""}`;
  };

  function parseTime(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    const d = Number.isFinite(n) ? new Date(n < 100000000000 ? n * 1000 : n) : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  function fullDateTime(value) {
    const d = value instanceof Date ? value : parseTime(value);
    if (!d) return "—";
    const p = (x) => String(x).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function parseInput(text) {
    const match = String(text || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
    if (!match) return null;
    const [, dd, mm, yyyy, hh, min] = match;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), 0, 0);
    if (d.getFullYear() !== Number(yyyy) || d.getMonth() !== Number(mm) - 1 || d.getDate() !== Number(dd) || d.getHours() !== Number(hh) || d.getMinutes() !== Number(min)) return null;
    return d;
  }

  function installStyles() {
    if (document.getElementById("fusion-standard-style")) return;
    const style = document.createElement("style");
    style.id = "fusion-standard-style";
    style.textContent = `
      .fsstd-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:16px}.fsstd-head h2{margin:2px 0 5px}.fsstd-controls{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.fsstd-select{min-width:260px;height:38px;padding:0 10px;border:1px solid var(--line,#d8dee8);border-radius:7px;background:var(--surface,#fff);color:inherit}.fsstd-kpis{display:grid;grid-template-columns:repeat(6,minmax(130px,1fr));gap:10px;margin-bottom:18px}.fsstd-kpi{padding:14px;background:var(--surface,#fff);border:1px solid var(--line,#e3e5eb);border-radius:8px;display:grid;gap:5px}.fsstd-kpi span,.fsstd-kpi small{font-size:11px;opacity:.66}.fsstd-kpi strong{font-size:20px}.fsstd-bess-list{display:grid;gap:8px}.fsstd-bess-row{display:grid;grid-template-columns:minmax(180px,1.5fr) 110px 140px 120px 120px;gap:12px;align-items:center;padding:11px 12px;border:1px solid var(--line,#e3e5eb);border-radius:8px;font-size:12px}.fsstd-provider{display:inline-flex;padding:4px 8px;border-radius:999px;background:rgba(15,118,216,.09);font-size:11px}.fsstd-device-note{font-size:12px;opacity:.66}.fsstd-device-title{display:flex;justify-content:space-between;gap:10px;align-items:center}.fsstd-device-title span{font-size:11px;opacity:.6}.fsstd-api-note{padding:9px 11px;border:1px dashed var(--line,#d8dee8);border-radius:7px;font-size:12px;opacity:.72;margin-top:10px}.fsstd-empty{padding:18px;border:1px dashed var(--line,#d8dee8);border-radius:8px;opacity:.65}.fsstd-mini-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin:12px 0}.fsstd-mini{border:1px solid var(--line,#d8dee8);border-radius:8px;padding:10px}.fsstd-mini span{display:block;font-size:11px;opacity:.62}.fsstd-mini strong{font-size:16px}.fsstd-history-table{display:grid;border:1px solid var(--line,#d8dee8);border-radius:8px;overflow:hidden}.fsstd-history-row{display:grid;grid-template-columns:1.4fr 1fr .7fr;gap:10px;padding:8px 10px;border-top:1px solid var(--line,#d8dee8);font-size:12px}.fsstd-history-row:first-child{border-top:0;font-weight:700;background:rgba(120,130,145,.08)}
      @media(max-width:1050px){.fsstd-kpis{grid-template-columns:repeat(3,minmax(120px,1fr))}.fsstd-bess-row{grid-template-columns:1fr 1fr 1fr}.fsstd-bess-row>:nth-child(n+4){display:none}}@media(max-width:700px){.fsstd-kpis{grid-template-columns:repeat(2,minmax(110px,1fr))}.fsstd-select{min-width:100%}}
    `;
    document.head.appendChild(style);
  }

  function mappedPlants(system) {
    const wanted = new Set((system?.fusionSolarPlants || []).map(norm));
    return (fusion.data?.systems || []).filter((plant) => wanted.has(norm(plant.name)));
  }
  function selectedCode(systemId) { return fusion.selectedPlant.get(systemId) || "all"; }
  function selectedCodes(systemId, detail) {
    const selected = selectedCode(systemId);
    return selected === "all" ? (detail?.providerStationIds || []) : [selected];
  }
  function selectedPlants(systemId, detail) {
    const selected = selectedCode(systemId);
    return selected === "all" ? (detail?.plants || []) : (detail?.plants || []).filter((plant) => plant.providerStationId === selected);
  }
  function selectedBess(systemId, detail) {
    const selected = selectedCode(systemId);
    return selected === "all" ? (detail?.bessDevices || []) : (detail?.bessDevices || []).filter((device) => device.stationCode === selected);
  }
  function selectedDevices(systemId, detail) {
    const selected = selectedCode(systemId);
    const devices = (detail?.devices || []).filter((device) => supportedHistoryTypes.has(Number(device.typeId)));
    return selected === "all" ? devices : devices.filter((device) => device.stationCode === selected);
  }

  function sum(items, key) {
    const values = items.map((item) => num(item?.[key])).filter((value) => value !== null);
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
  }
  function currentMetrics(systemId, detail) {
    const selected = selectedCode(systemId);
    if (selected === "all") return detail?.aggregate || {};
    const plant = (detail?.plants || []).find((item) => item.providerStationId === selected) || {};
    const bess = selectedBess(systemId, detail);
    const socs = bess.map((item) => num(item.soc)).filter((value) => value !== null && value >= 0 && value <= 100);
    const signed = bess.map((item) => num(item.signedPowerKw)).filter((value) => value !== null);
    return {
      ...plant,
      batterySoc: socs.length ? socs.reduce((a, b) => a + b, 0) / socs.length : null,
      chargePowerKw: signed.length ? signed.filter((v) => v > 0).reduce((a, b) => a + b, 0) : null,
      dischargePowerKw: signed.length ? signed.filter((v) => v < 0).reduce((a, b) => a + Math.abs(b), 0) : null,
      chargeTodayKwh: sum(bess, "chargeTodayKwh"),
      dischargeTodayKwh: sum(bess, "dischargeTodayKwh"),
    };
  }

  function defaultRange(systemId) {
    let state = rangeState.get(systemId);
    if (state) return state;
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    state = { from, to, loading: false, error: "", data: null, selectedDevice: "", deviceData: null, deviceLoading: false };
    rangeState.set(systemId, state);
    return state;
  }

  function chart(rows, series, opts = {}) {
    if (!rows.length) return `<div class="fsstd-empty">${esc(opts.empty || "No data returned for this selected range.")}</div>`;
    const width = 980, height = 330, left = 58, right = opts.rightAxis ? 58 : 18, top = 20, bottom = 48;
    const plotW = width - left - right, plotH = height - top - bottom;
    const leftValues = rows.flatMap((row) => series.filter((s) => !s.rightAxis).map((s) => num(row[s.key])).filter((v) => v !== null));
    let min = opts.min ?? Math.min(0, ...(leftValues.length ? leftValues : [0]));
    let max = opts.max ?? Math.max(...(leftValues.length ? leftValues : [1]));
    if (max === min) max = min + 1;
    const rightValues = rows.flatMap((row) => series.filter((s) => s.rightAxis).map((s) => num(row[s.key])).filter((v) => v !== null));
    let rmin = opts.rightMin ?? Math.min(0, ...(rightValues.length ? rightValues : [0]));
    let rmax = opts.rightMax ?? Math.max(...(rightValues.length ? rightValues : [1]));
    if (rmax === rmin) rmax = rmin + 1;
    const x = (i) => left + (rows.length === 1 ? plotW / 2 : (i / (rows.length - 1)) * plotW);
    const y = (v) => top + (1 - (v - min) / (max - min)) * plotH;
    const yr = (v) => top + (1 - (v - rmin) / (rmax - rmin)) * plotH;
    const grid = Array.from({ length: 5 }, (_, i) => {
      const ratio = i / 4, gy = top + ratio * plotH, lv = max - ratio * (max - min), rv = rmax - ratio * (rmax - rmin);
      return `<line x1="${left}" y1="${gy}" x2="${left + plotW}" y2="${gy}" class="mw-gridline"/><text x="${left - 8}" y="${gy + 4}" text-anchor="end" class="mw-axistext">${esc(lv.toLocaleString("en-ZA", { maximumFractionDigits: 1 }))}</text>${opts.rightAxis ? `<text x="${left + plotW + 8}" y="${gy + 4}" class="mw-axistext">${esc(rv.toLocaleString("en-ZA", { maximumFractionDigits: 1 }))}</text>` : ""}`;
    }).join("");
    const tickIndexes = [...new Set([0, Math.floor((rows.length - 1) * .25), Math.floor((rows.length - 1) * .5), Math.floor((rows.length - 1) * .75), rows.length - 1])];
    const ticks = tickIndexes.map((i) => `<text x="${x(i)}" y="${height - 14}" text-anchor="middle" class="mw-axistext">${esc(fullDateTime(rows[i].time))}</text>`).join("");
    const paths = series.map((s, si) => {
      const points = rows.map((row, i) => { const value = num(row[s.key]); return value === null ? null : [x(i), s.rightAxis ? yr(value) : y(value)]; }).filter(Boolean);
      return points.length ? `<polyline points="${points.map((p) => p.join(",")).join(" ")}" class="mw-line mw-series-${si % 6}"/>` : "";
    }).join("");
    const legend = series.map((s, i) => `<span><i style="background:${colors[i % colors.length]}"></i>${esc(s.label)}</span>`).join("");
    const data = encodeURIComponent(JSON.stringify(rows.map((row) => ({ time: row.time?.toISOString?.() || row.time, values: series.map((s) => ({ label: s.label, value: num(row[s.key]), unit: s.unit || opts.unit || "" })) }))));
    return `<div class="mw-chart-wrap" data-fsstd-chart="${data}"><div class="mw-legend">${legend}</div><svg class="mw-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet"><text x="15" y="${top + plotH / 2}" transform="rotate(-90 15 ${top + plotH / 2})" text-anchor="middle" class="mw-axistext">${esc(opts.unit || "")}</text>${opts.rightAxis ? `<text x="${width - 10}" y="${top + plotH / 2}" transform="rotate(90 ${width - 10} ${top + plotH / 2})" text-anchor="middle" class="mw-axistext">${esc(opts.rightUnit || "")}</text>` : ""}${grid}<line x1="${left}" y1="${top + plotH}" x2="${left + plotW}" y2="${top + plotH}" class="mw-axis"/>${paths}${ticks}</svg><div class="mw-tooltip" hidden></div></div>`;
  }

  function attachHover(root = document) {
    root.querySelectorAll("[data-fsstd-chart]").forEach((wrap) => {
      if (wrap.dataset.hoverReady) return;
      wrap.dataset.hoverReady = "1";
      let data = [];
      try { data = JSON.parse(decodeURIComponent(wrap.dataset.fsstdChart || "")); } catch {}
      const svg = wrap.querySelector("svg"), tip = wrap.querySelector(".mw-tooltip");
      if (!svg || !tip || !data.length) return;
      svg.addEventListener("pointermove", (event) => {
        const rect = svg.getBoundingClientRect();
        const leftPx = rect.width * (58 / 980), rightPx = rect.width * (18 / 980), plot = Math.max(1, rect.width - leftPx - rightPx);
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left - leftPx) / plot));
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

  function deviceTypeName(typeId) {
    const names = { 1:"String inverter", 10:"EMI", 17:"Grid meter", 38:"Residential inverter", 39:"Battery", 41:"ESS", 47:"Power sensor", 60001:"Mains", 60003:"Genset", 60043:"SSU group", 60014:"Lithium battery rack", 60010:"AC distribution", 23070:"EMMA" };
    return names[Number(typeId)] || `Device type ${typeId}`;
  }
  function deviceLabel(devices, device) {
    const type = Number(device.typeId);
    const same = devices.filter((item) => Number(item.typeId) === type);
    const index = same.findIndex((item) => String(item.id) === String(device.id)) + 1;
    const name = deviceTypeName(type);
    return same.length > 1 ? `${name} ${index}` : name;
  }

  function metricUnit(key) {
    const k = String(key || "").toLowerCase();
    if (k === "battery_soc" || k.endsWith("_soc") || k.includes("state_of_charge")) return "%";
    if (/^pv\d+_u$/.test(k) || ["a_u","b_u","c_u","ab_u","bc_u","ca_u","battery_voltage","dc_voltage"].includes(k) || k.endsWith("_voltage")) return "V";
    if (/^pv\d+_i$/.test(k) || ["a_i","b_i","c_i","battery_current","dc_current"].includes(k) || k.endsWith("_current")) return "A";
    if (k === "ch_discharge_power") return "W";
    if (k.includes("power")) return "kW";
    if (k.includes("freq")) return "Hz";
    if (k.includes("temp")) return "°C";
    if (k.includes("cap") || k.includes("energy") || k.includes("yield")) return "kWh";
    return "";
  }
  function metricLabel(key) {
    return String(key || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/Pv(\d+)/g, "PV$1");
  }
  function deviceGroups(history) {
    const keys = [...new Set(history.flatMap((row) => Object.keys(row.metrics || {})))];
    const defs = keys.map((key) => ({ key, label: metricLabel(key), unit: metricUnit(key), text: String(key).toLowerCase() }));
    const groupDefs = [
      { title:"PV / string voltage", unit:"V", match:(d) => /^pv\d+_u$/.test(d.text) },
      { title:"PV / string current", unit:"A", match:(d) => /^pv\d+_i$/.test(d.text) },
      { title:"AC / grid voltage", unit:"V", match:(d) => ["a_u","b_u","c_u","ab_u","bc_u","ca_u"].includes(d.text) || d.text.includes("grid_voltage") },
      { title:"AC / grid current", unit:"A", match:(d) => ["a_i","b_i","c_i"].includes(d.text) || d.text.includes("grid_current") },
      { title:"Power", unit:"kW", match:(d) => d.text.includes("power") && d.text !== "ch_discharge_power" },
      { title:"BESS SOC", unit:"%", match:(d) => d.text.includes("soc") },
      { title:"BESS charge / discharge power", unit:"W", match:(d) => d.text === "ch_discharge_power" },
      { title:"Temperature", unit:"°C", match:(d) => d.text.includes("temp") },
      { title:"Frequency", unit:"Hz", match:(d) => d.text.includes("freq") },
      { title:"Energy", unit:"kWh", match:(d) => d.text.includes("cap") || d.text.includes("energy") || d.text.includes("yield") },
    ];
    return groupDefs.map((group) => ({ ...group, defs: defs.filter(group.match) })).filter((group) => group.defs.length);
  }

  function graphDeviceGroup(history, group) {
    const defs = group.defs.slice(0, 6);
    const rows = history.map((row) => {
      const out = { time: parseTime(row.time) };
      defs.forEach((def) => { out[def.key] = num(row.metrics?.[def.key]); });
      return out;
    }).filter((row) => row.time);
    return chart(rows, defs.map((def) => ({ key:def.key, label:def.label, unit:def.unit })), { unit:group.unit });
  }

  function csvCell(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
  function download(name, text) {
    const blob = new Blob([text], { type:"text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function ensurePortfolio() {
    if (fusion.data?.systems?.length) return fusion.data;
    fusion.status = "loading";
    const response = await fetch("/api/fusionsolar", { cache:"no-store", headers:{ Accept:"application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.connected === false) throw new Error(payload.message || "FusionSolar could not be loaded.");
    fusion.data = payload; fusion.status = "ready"; fusion.message = payload.message || "FusionSolar connected.";
    return payload;
  }

  async function loadDetail(systemId, force = false) {
    const system = getSystem(systemId);
    if (!system) throw new Error("System not found.");
    await ensurePortfolio();
    if (!force && fusion.detailCache.has(systemId)) return fusion.detailCache.get(systemId);
    const plants = mappedPlants(system);
    const codes = plants.map((plant) => plant.providerStationId).filter(Boolean);
    if (!codes.length) throw new Error(`No FusionSolar plants are mapped to ${system.name}.`);
    const response = await fetch(`/api/fusionsolar?stationCodes=${encodeURIComponent(codes.join(","))}`, { cache:"no-store", headers:{ Accept:"application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.detail) throw new Error(payload.message || "FusionSolar site detail could not be loaded.");
    fusion.detailCache.set(systemId, payload.detail);
    return payload.detail;
  }

  async function loadRange(systemId, from, to, force = false) {
    const detail = fusion.detailCache.get(systemId);
    if (!detail) return;
    const state = defaultRange(systemId);
    state.from = from; state.to = to; state.loading = true; state.error = ""; state.deviceData = null; state.selectedDevice = "";
    renderSite(systemId);
    const codes = selectedCodes(systemId, detail);
    const bessIds = selectedBess(systemId, detail).map((item) => item.id).filter(Boolean).slice(0,10);
    const key = `${systemId}|${codes.join(",")}|${from.getTime()}|${to.getTime()}`;
    if (!force && rangeCache.has(key)) {
      state.data = rangeCache.get(key); state.loading = false; renderSite(systemId); return;
    }
    try {
      const qs = new URLSearchParams({ from:String(from.getTime()), to:String(to.getTime()) });
      if (codes.length) qs.set("stationCodes", codes.join(","));
      if (bessIds.length) qs.set("bessIds", bessIds.join(","));
      const response = await fetch(`/api/fusionsolar-range?${qs}`, { cache:"no-store", headers:{ Accept:"application/json" } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.connected === false) throw new Error(payload.message || "FusionSolar range data could not be loaded.");
      rangeCache.set(key, payload); state.data = payload;
    } catch (error) { state.error = error.message || String(error); state.data = null; }
    finally { state.loading = false; renderSite(systemId); }
  }

  async function loadDevice(systemId, deviceId, deviceType) {
    const state = defaultRange(systemId);
    state.selectedDevice = String(deviceId); state.deviceLoading = true; state.deviceData = null; renderSite(systemId);
    const key = `${systemId}|${deviceId}|${deviceType}|${state.from.getTime()}|${state.to.getTime()}`;
    if (deviceCache.has(key)) { state.deviceData = deviceCache.get(key); state.deviceLoading = false; renderSite(systemId); return; }
    try {
      const qs = new URLSearchParams({ from:String(state.from.getTime()), to:String(state.to.getTime()), deviceId:String(deviceId), deviceType:String(deviceType) });
      const response = await fetch(`/api/fusionsolar-range?${qs}`, { cache:"no-store", headers:{ Accept:"application/json" } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.connected === false) throw new Error(payload.message || "Device history could not be loaded.");
      deviceCache.set(key, payload.device); state.deviceData = payload.device;
    } catch (error) { state.deviceData = { error:error.message || String(error), history:[] }; }
    finally { state.deviceLoading = false; renderSite(systemId); }
  }

  function renderDevicePanel(systemId, detail, state) {
    if (!state.selectedDevice) return `<div id="fsstd-device-panel" class="mw-device-panel"><p class="monitor-empty">Choose an inverter, ESS, meter or other supported device above.</p></div>`;
    if (state.deviceLoading) return `<div id="fsstd-device-panel" class="mw-device-panel"><div class="mw-loading">Loading device history…</div></div>`;
    const device = selectedDevices(systemId, detail).find((item) => String(item.id) === String(state.selectedDevice));
    const payload = state.deviceData;
    if (!device || !payload) return `<div id="fsstd-device-panel" class="mw-device-panel"><div class="mw-error">Device history was not returned.</div></div>`;
    if (payload.error) return `<div id="fsstd-device-panel" class="mw-device-panel"><div class="mw-error">${esc(payload.error)}</div></div>`;
    const history = payload.history || [];
    const groups = deviceGroups(history);
    const latest = history.at(-1)?.metrics || {};
    const summaryKeys = Object.keys(latest).filter((key) => /(soc|power|volt|_u$|current|_i$|freq|temp)/i.test(key)).slice(0,8);
    return `<div id="fsstd-device-panel" class="mw-device-panel"><div class="mw-device-head"><div><p class="eyebrow">DEVICE DRILLDOWN</p><h3>${esc(device.name || deviceLabel(selectedDevices(systemId, detail), device))}</h3><p class="fsstd-device-note">${esc(deviceTypeName(device.typeId))} · ${esc(device.model || "Model not returned")} · SN ${esc(device.sn || "—")} · ${esc(payload.granularity || "history")}</p></div><button class="button button-muted" type="button" data-fsstd-export-device>Export device range</button></div>${summaryKeys.length ? `<div class="fsstd-mini-grid">${summaryKeys.map((key) => `<div class="fsstd-mini"><span>${esc(metricLabel(key))}</span><strong>${esc(fmt(latest[key], metricUnit(key)))}</strong></div>`).join("")}</div>` : ""}<div class="mw-chart-grid">${groups.map((group) => `<section class="surface mw-chart-card"><h3>${esc(group.title)}</h3><p>${esc(group.defs.map((d) => d.label).slice(0,6).join(" · "))}</p>${graphDeviceGroup(history, group)}</section>`).join("") || `<div class="fsstd-empty">No graphable historical measurements were returned for this device and range.</div>`}</div><section class="surface mw-chart-card"><div class="mw-section-head"><div><h3>All returned measurements</h3><p>Latest values from the selected historical range.</p></div></div><div class="fsstd-history-table"><div class="fsstd-history-row"><span>Measurement</span><span>Value</span><span>Unit</span></div>${Object.entries(latest).map(([key,value]) => `<div class="fsstd-history-row"><span>${esc(metricLabel(key))}</span><strong>${esc(fmt(value, metricUnit(key)))}</strong><span>${esc(metricUnit(key))}</span></div>`).join("") || `<div class="fsstd-history-row"><span>No measurements returned</span><span>—</span><span>—</span></div>`}</div></section></div>`;
  }

  function renderCharts(systemId, detail, state) {
    if (state.loading) return `<div class="surface mw-loading">Loading selected monitoring range…</div>`;
    if (state.error) return `<div class="mw-error">${esc(state.error)}</div>`;
    if (!state.data) return `<div class="surface mw-loading">Loading standard monitoring graphs…</div>`;
    const power = (state.data.power || []).map((row) => ({ time:parseTime(row.time), pv:num(row.pvKw), load:num(row.loadKw), grid:num(row.gridKw) })).filter((r) => r.time);
    const daily = (state.data.daily || []).map((row) => ({ time:parseTime(row.time), generation:num(row.generationKwh), consumption:num(row.consumptionKwh), grid:num(row.gridKwh) })).filter((r) => r.time);
    const bess = (state.data.bess || []).map((row) => ({ time:parseTime(row.time), soc:num(row.soc), charge:num(row.chargePowerKw), discharge:num(row.dischargePowerKw) })).filter((r) => r.time);
    const devices = selectedDevices(systemId, detail);
    return `<div class="mw-grid"><section class="surface mw-chart-card"><h3>Power — kW</h3><p>FusionSolar hourly plant yield is shown as average PV kW for the hour. Load/grid appear only where Huawei returns those plant counters.</p>${chart(power, [{ key:"pv", label:"PV", unit:"kW" }, { key:"load", label:"Load", unit:"kW" }, { key:"grid", label:"Grid", unit:"kW" }], { unit:"kW", empty:"Huawei did not return hourly plant data for this range. For longer ranges, use the Energy graph below." })}</section><section class="surface mw-chart-card"><h3>Energy — kWh</h3><p>Daily or monthly plant energy across the selected range, depending on range length.</p>${chart(daily, [{ key:"generation", label:"Generation", unit:"kWh" }, { key:"consumption", label:"Consumption", unit:"kWh" }, { key:"grid", label:"Grid", unit:"kWh" }], { unit:"kWh" })}</section><section class="surface mw-chart-card"><h3>BESS — SOC, charge and discharge</h3><p>Huawei type 41 ESS history. SOC is on the left axis; charge/discharge power is on the right axis.</p>${chart(bess, [{ key:"soc", label:"SOC", unit:"%" }, { key:"charge", label:"Charge", unit:"kW", rightAxis:true }, { key:"discharge", label:"Discharge", unit:"kW", rightAxis:true }], { unit:"%", min:0, max:100, rightAxis:true, rightUnit:"kW", empty:"No BESS history applies to this plant selection or range." })}</section><section class="surface mw-chart-card"><div class="mw-section-head"><div><h3>Devices</h3><p>Same standard drilldown used for monitored systems: select a device for its strings, voltages, currents, power, SOC, temperature and other Huawei data points.</p></div><span class="muted">${devices.length} supported devices</span></div><div class="mw-device-list">${devices.map((device) => `<button class="mw-device ${state.selectedDevice === String(device.id) ? "active" : ""}" type="button" data-fsstd-device="${esc(device.id)}" data-fsstd-device-type="${esc(device.typeId)}"><strong>${esc(deviceLabel(devices, device))}</strong><small>${esc(device.name || device.model || "Huawei device")}</small><span class="mw-device-meta"><span>SN ${esc(device.sn || "—")}</span><span>${esc(device.stationCode || "")}</span></span></button>`).join("") || `<div class="fsstd-empty">No devices with supported Huawei historical data were returned for this plant selection.</div>`}</div>${renderDevicePanel(systemId, detail, state)}</section></div>`;
  }

  function renderSite(systemId) {
    installStyles();
    if (state.view !== "monitoring-site" || state.monitoringSystem !== systemId) return;
    const system = getSystem(systemId), detail = fusion.detailCache.get(systemId);
    if (!system) return;
    if (!detail) return;
    const range = defaultRange(systemId), metrics = currentMetrics(systemId, detail), plants = selectedPlants(systemId, detail), bess = selectedBess(systemId, detail);
    const selected = selectedCode(systemId);
    appView.innerHTML = `<div class="fsstd-head"><div><p class="eyebrow">${esc(system.id)} · STANDARD SITE MONITORING</p><h2>${esc(system.name)}</h2><p class="muted"><span class="fsstd-provider">FusionSolar Northbound</span> ${esc(selected === "all" ? `${detail.plants.length} plants combined` : plants[0]?.name || "Selected plant")}</p></div><div class="fsstd-controls"><select class="fsstd-select" id="fsstd-plant-select" data-system-id="${esc(systemId)}"><option value="all" ${selected === "all" ? "selected" : ""}>All plants combined</option>${(detail.plants || []).map((plant) => `<option value="${esc(plant.providerStationId)}" ${selected === plant.providerStationId ? "selected" : ""}>${esc(plant.name)}</option>`).join("")}</select><button class="button button-muted" type="button" data-action="refresh-fusionsolar-standard" data-id="${esc(systemId)}">Refresh site</button></div></div><div class="fsstd-kpis"><div class="fsstd-kpi"><span>PV power now</span><strong>${fmt(metrics.powerKw,"kW")}</strong><small>Live Huawei KPI</small></div><div class="fsstd-kpi"><span>Generation today</span><strong>${fmt(metrics.energyTodayKwh,"kWh")}</strong><small>Daily energy</small></div><div class="fsstd-kpi"><span>Installed PV</span><strong>${fmt(metrics.installedCapacityKw,"kWp")}</strong><small>Mapped plant capacity</small></div><div class="fsstd-kpi"><span>BESS SOC</span><strong>${fmt(metrics.batterySoc,"%",1)}</strong><small>Type 41 ESS</small></div><div class="fsstd-kpi"><span>Charge</span><strong>${fmt(metrics.chargePowerKw,"kW")}</strong><small>Live BESS charge</small></div><div class="fsstd-kpi"><span>Discharge</span><strong>${fmt(metrics.dischargePowerKw,"kW")}</strong><small>Live BESS discharge</small></div></div><div class="mw-shell"><section class="surface mw-toolbar"><div class="mw-field"><label>From</label><input id="fsstd-from" value="${esc(fullDateTime(range.from))}" placeholder="dd/mm/yyyy hh:mm" inputmode="numeric" /></div><div class="mw-field"><label>To</label><input id="fsstd-to" value="${esc(fullDateTime(range.to))}" placeholder="dd/mm/yyyy hh:mm" inputmode="numeric" /></div><div class="mw-toolbar-actions"><button class="button button-primary" type="button" data-fsstd-apply>Apply range</button><button class="button button-muted" type="button" data-fsstd-24h>Last 24h</button><button class="button button-muted" type="button" data-fsstd-7d>Last 7 days</button><button class="button button-muted" type="button" data-fsstd-export-range ${range.data ? "" : "disabled"}>Export selected range</button></div><span class="mw-range-note">dd/mm/yyyy hh:mm · Huawei returns 5-minute BESS/device history for ranges up to 3 days</span></section>${renderCharts(systemId, detail, range)}${bess.length ? `<section class="surface mw-chart-card"><div class="mw-section-head"><div><h3>Current BESS equipment</h3><p>Live type 41 LUNA ESS values returned directly by FusionSolar.</p></div><span class="muted">${bess.length} ESS device${bess.length === 1 ? "" : "s"}</span></div><div class="fsstd-bess-list">${bess.map((device) => `<div class="fsstd-bess-row"><strong>${esc(device.name || device.model || "ESS")}</strong><span>SOC ${fmt(device.soc,"%",1)}</span><span>${num(device.signedPowerKw) > 0 ? `Charging ${fmt(device.signedPowerKw,"kW")}` : num(device.signedPowerKw) < 0 ? `Discharging ${fmt(Math.abs(device.signedPowerKw),"kW")}` : "Idle"}</span><span>Charged ${fmt(device.chargeTodayKwh,"kWh")}</span><span>Discharged ${fmt(device.dischargeTodayKwh,"kWh")}</span></div>`).join("")}</div></section>` : ""}</div>`;
    attachHover(appView);
  }

  async function openSite(systemId, force = false) {
    const system = getSystem(systemId);
    if (!system || !Array.isArray(system.fusionSolarPlants) || !system.fusionSolarPlants.length) return previousOnAction("open-monitoring-site", systemId);
    state.view = "monitoring-site"; state.monitoringSystem = systemId; pageHeader("Monitoring", "O&M / SITE MONITORING"); backButton.hidden = false;
    appView.innerHTML = `<div class="monitor-site-loading"><span class="monitor-spinner"></span><div><h2>${esc(system.name)}</h2><p>Loading FusionSolar site monitoring…</p></div></div>`;
    try {
      const detail = await loadDetail(systemId, force);
      if (state.view !== "monitoring-site" || state.monitoringSystem !== systemId) return;
      renderSite(systemId);
      const range = defaultRange(systemId);
      if (force || !range.data) await loadRange(systemId, range.from, range.to, force);
    } catch (error) {
      if (state.view === "monitoring-site" && state.monitoringSystem === systemId) appView.innerHTML = `<div class="monitor-site-error"><h2>${esc(system.name)}</h2><p>${esc(error.message || error)}</p><button class="button button-primary" type="button" data-action="refresh-fusionsolar-standard" data-id="${esc(systemId)}">Try again</button></div>`;
    }
  }

  function exportRange(systemId) {
    const system = getSystem(systemId), range = defaultRange(systemId), data = range.data;
    if (!data) return;
    const rows = [["category","timestamp","metric","value","unit"]];
    (data.power || []).forEach((row) => [["PV average",row.pvKw,"kW"],["Load average",row.loadKw,"kW"],["Grid average",row.gridKw,"kW"]].forEach(([name,value,unit]) => { if (value !== null && value !== undefined) rows.push(["power",fullDateTime(row.time),name,value,unit]); }));
    (data.daily || []).forEach((row) => [["Generation",row.generationKwh,"kWh"],["Consumption",row.consumptionKwh,"kWh"],["Grid",row.gridKwh,"kWh"]].forEach(([name,value,unit]) => { if (value !== null && value !== undefined) rows.push(["energy",fullDateTime(row.time),name,value,unit]); }));
    (data.bess || []).forEach((row) => [["SOC",row.soc,"%"],["Charge",row.chargePowerKw,"kW"],["Discharge",row.dischargePowerKw,"kW"]].forEach(([name,value,unit]) => { if (value !== null && value !== undefined) rows.push(["bess",fullDateTime(row.time),name,value,unit]); }));
    download(`${slug(system?.name)}-monitoring-${fullDateTime(range.from).replace(/[\/: ]/g,"-")}-to-${fullDateTime(range.to).replace(/[\/: ]/g,"-")}.csv`, rows.map((row) => row.map(csvCell).join(",")).join("\r\n"));
  }

  function exportDevice(systemId) {
    const system = getSystem(systemId), state = defaultRange(systemId), payload = state.deviceData;
    if (!payload?.history?.length) return;
    const device = selectedDevices(systemId, fusion.detailCache.get(systemId)).find((item) => String(item.id) === String(state.selectedDevice));
    const rows = [["timestamp","device","measurement","value","unit"]];
    payload.history.forEach((sample) => Object.entries(sample.metrics || {}).forEach(([key,value]) => rows.push([fullDateTime(sample.time), device?.name || device?.id || state.selectedDevice, metricLabel(key), value, metricUnit(key)])));
    download(`${slug(system?.name)}-${slug(device?.name || "device")}-${state.selectedDevice}.csv`, rows.map((row) => row.map(csvCell).join(",")).join("\r\n"));
  }

  window.onAction = onAction = function onActionWithStandardFusion(action, id) {
    const system = getSystem(id);
    const isFusion = Boolean(system && Array.isArray(system.fusionSolarPlants) && system.fusionSolarPlants.length);
    if (isFusion && ["open-monitoring-site", "view-monitoring"].includes(action)) return openSite(id, false);
    if (isFusion && ["refresh-fusionsolar-standard", "refresh-fusionsolar-site"].includes(action)) return openSite(id, true);
    return previousOnAction(action, id);
  };

  document.addEventListener("change", (event) => {
    const select = event.target.closest?.("#fsstd-plant-select");
    if (!select) return;
    const systemId = select.dataset.systemId;
    fusion.selectedPlant.set(systemId, select.value || "all");
    const range = defaultRange(systemId); range.data = null; range.selectedDevice = ""; range.deviceData = null;
    renderSite(systemId);
    loadRange(systemId, range.from, range.to, true);
  });

  document.addEventListener("click", (event) => {
    if (state.view !== "monitoring-site") return;
    const systemId = state.monitoringSystem;
    const system = getSystem(systemId);
    if (!system || !Array.isArray(system.fusionSolarPlants) || !system.fusionSolarPlants.length) return;
    const device = event.target.closest?.("[data-fsstd-device]");
    if (device) { loadDevice(systemId, device.dataset.fsstdDevice, device.dataset.fsstdDeviceType); return; }
    if (event.target.closest?.("[data-fsstd-apply]")) {
      const from = parseInput(document.getElementById("fsstd-from")?.value), to = parseInput(document.getElementById("fsstd-to")?.value);
      if (!from || !to) { showToast("Use date/time format dd/mm/yyyy hh:mm."); return; }
      if (to <= from) { showToast("The end date/time must be after the start date/time."); return; }
      loadRange(systemId, from, to, true); return;
    }
    if (event.target.closest?.("[data-fsstd-24h]")) { const to = new Date(), from = new Date(to.getTime() - 86400000); loadRange(systemId, from, to, true); return; }
    if (event.target.closest?.("[data-fsstd-7d]")) { const to = new Date(), from = new Date(to.getTime() - 7 * 86400000); loadRange(systemId, from, to, true); return; }
    if (event.target.closest?.("[data-fsstd-export-range]")) { exportRange(systemId); return; }
    if (event.target.closest?.("[data-fsstd-export-device]")) { exportDevice(systemId); return; }
  }, true);

  installStyles();
})();
