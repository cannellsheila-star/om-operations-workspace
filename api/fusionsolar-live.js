const https = require("https");

const HOST = "sg5.fusionsolar.huawei.com";
const BASE_PATH = "/thirdData";
const VERSION = "fusionsolar-live-v1-20260916";
const RETRY_DELAYS = [0, 1800, 3600, 5400];

const clean = (value) => String(value ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const asArray = (...values) => values.find(Array.isArray) || [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function requestJson(path, body = {}, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {});
    const req = https.request({
      hostname: HOST,
      port: 443,
      path: BASE_PATH + path,
      method: "POST",
      timeout: 25000,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, */*",
        "Content-Length": Buffer.byteLength(payload),
        "User-Agent": "BlueEnergy-OandM/1.0",
        ...headers,
      },
    }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => {
        let json = {};
        try { json = text ? JSON.parse(text) : {}; }
        catch {
          const error = new Error(`FusionSolar returned non-JSON data at ${path}.`);
          error.httpStatus = Number(response.statusCode || 0);
          reject(error);
          return;
        }
        if (Number(response.statusCode || 0) < 200 || Number(response.statusCode || 0) >= 300) {
          const error = new Error(json?.message || `FusionSolar HTTP ${response.statusCode || 0} at ${path}.`);
          error.httpStatus = Number(response.statusCode || 0);
          reject(error);
          return;
        }
        resolve({ json, headers: response.headers || {} });
      });
    });
    req.on("timeout", () => req.destroy(new Error(`FusionSolar request timed out at ${path}.`)));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function validate(result, path) {
  const payload = result?.json || result || {};
  if (payload.success !== true || Number(payload.failCode || 0) !== 0) {
    const error = new Error(`${payload.message || `FusionSolar request failed at ${path}`} (FusionSolar code ${payload.failCode ?? "unknown"})`);
    error.failCode = payload.failCode ?? null;
    throw error;
  }
  return payload;
}

function cookieHeader(headers) {
  const raw = headers?.["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.map((item) => String(item).split(";")[0]).join("; ");
}
function headerValue(headers, name) {
  const value = headers?.[String(name).toLowerCase()];
  return Array.isArray(value) ? (value[0] || "") : clean(value);
}
function cookieValue(cookie, name) {
  const match = String(cookie || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`, "i"));
  return match ? decodeURIComponent(match[1]) : "";
}

async function login() {
  const userName = clean(process.env.FUSIONSOLAR_USERNAME);
  const systemCode = clean(process.env.FUSIONSOLAR_SYSTEM_CODE);
  if (!userName || !systemCode) return null;
  const result = await requestJson("/login", { userName, systemCode });
  validate(result, "/login");
  const cookie = cookieHeader(result.headers);
  const token = headerValue(result.headers, "xsrf-token") || headerValue(result.headers, "x-xsrf-token") || cookieValue(cookie, "XSRF-TOKEN");
  if (!token) throw new Error("FusionSolar login succeeded but no XSRF token was returned.");
  return { token, cookie };
}

async function call(session, path, body = {}) {
  const result = await requestJson(path, body, {
    "XSRF-TOKEN": session.token,
    ...(session.cookie ? { Cookie: session.cookie } : {}),
  });
  return validate(result, path);
}

async function callWithThrottleRetry(session, path, body = {}) {
  let lastError = null;
  for (let i = 0; i < RETRY_DELAYS.length; i += 1) {
    if (RETRY_DELAYS[i]) await sleep(RETRY_DELAYS[i]);
    try {
      return await call(session, path, body);
    } catch (error) {
      lastError = error;
      if (Number(error?.failCode) !== 407) throw error;
    }
  }
  throw lastError;
}

function metricMap(row) { return row?.dataItemMap || row?.data || row?.kpi || {}; }
function metricValue(values, keys) {
  for (const key of keys) {
    const value = num(values?.[key]);
    if (value !== null) return value;
  }
  return null;
}
function deviceShell(device) {
  return {
    id: String(device.id ?? device.devId ?? ""),
    stationCode: clean(device.stationCode || device.plantCode),
    typeId: Number(device.devTypeId ?? device.typeId ?? 0),
  };
}
function rowId(row) { return String(row?.devId ?? row?.id ?? ""); }
function scaleMeterPower(value) {
  const n = num(value);
  if (n === null) return null;
  return Math.abs(n) > 10000 ? n / 1000 : n;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("X-FusionSolar-Live", VERSION);
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed.", connectorVersion: VERSION });

  try {
    const stationCodes = clean(req.query?.stationCodes).split(",").map(clean).filter(Boolean);
    if (!stationCodes.length) return res.status(400).json({ message: "stationCodes is required.", connectorVersion: VERSION });
    const session = await login();
    if (!session) return res.status(200).json({ configured: false, connected: false, connectorVersion: VERSION, byStation: {} });

    const devListPayload = await callWithThrottleRetry(session, "/getDevList", { stationCodes: stationCodes.join(",") });
    const devices = asArray(devListPayload?.data, devListPayload?.data?.list).map(deviceShell).filter((d) => d.id && d.stationCode);
    const byId = new Map(devices.map((d) => [d.id, d]));
    const typeIds = [1, 17, 41];
    const realtimeRows = [];
    const coverage = [{ path: "/getDevList", ok: true, deviceCount: devices.length }];

    for (const typeId of typeIds) {
      const ids = devices.filter((d) => d.typeId === typeId).map((d) => d.id);
      if (!ids.length) continue;
      try {
        const payload = await callWithThrottleRetry(session, "/getDevRealKpi", { devIds: ids.join(","), devTypeId: typeId });
        const rows = asArray(payload?.data, payload?.data?.list);
        realtimeRows.push(...rows);
        coverage.push({ path: "/getDevRealKpi", devTypeId: typeId, ok: true, rowCount: rows.length });
      } catch (error) {
        coverage.push({ path: "/getDevRealKpi", devTypeId: typeId, ok: false, failCode: error?.failCode ?? null, error: String(error.message || error) });
      }
      await sleep(750);
    }

    const byStation = {};
    for (const code of stationCodes) byStation[code] = { pvKw: null, loadKw: null, gridImportKw: null, gridExportKw: null, gridNetKw: null, soc: null, chargeKw: null, dischargeKw: null, sampledAt: new Date().toISOString() };
    const working = new Map(stationCodes.map((code) => [code, { pv: 0, hasPv: false, grid: 0, hasGrid: false, socs: [], charge: 0, discharge: 0, hasBessPower: false }]));

    for (const row of realtimeRows) {
      const device = byId.get(rowId(row));
      if (!device || !working.has(device.stationCode)) continue;
      const target = working.get(device.stationCode);
      const values = metricMap(row);
      if (device.typeId === 1) {
        const power = metricValue(values, ["active_power", "real_power", "pv_power"]);
        if (power !== null) { target.pv += power; target.hasPv = true; }
      } else if (device.typeId === 17) {
        const grid = scaleMeterPower(metricValue(values, ["active_power", "grid_power", "on_grid_power"]));
        if (grid !== null) { target.grid += grid; target.hasGrid = true; }
      } else if (device.typeId === 41) {
        const soc = metricValue(values, ["battery_soc", "soc", "battery_state_of_capacity"]);
        const signedW = metricValue(values, ["ch_discharge_power", "charge_discharge_power"]);
        if (soc !== null && soc >= 0 && soc <= 100) target.socs.push(soc);
        if (signedW !== null) {
          const signedKw = signedW / 1000;
          if (signedKw > 0) target.charge += signedKw;
          if (signedKw < 0) target.discharge += Math.abs(signedKw);
          target.hasBessPower = true;
        }
      }
    }

    for (const [code, data] of working.entries()) {
      const pvKw = data.hasPv ? data.pv : null;
      const gridNetKw = data.hasGrid ? data.grid : null;
      const gridImportKw = gridNetKw === null ? null : Math.max(-gridNetKw, 0);
      const gridExportKw = gridNetKw === null ? null : Math.max(gridNetKw, 0);
      const chargeKw = data.hasBessPower ? data.charge : null;
      const dischargeKw = data.hasBessPower ? data.discharge : null;
      const soc = data.socs.length ? data.socs.reduce((a, b) => a + b, 0) / data.socs.length : null;
      const loadKw = pvKw !== null && gridImportKw !== null && gridExportKw !== null
        ? pvKw + gridImportKw + (dischargeKw || 0) - gridExportKw - (chargeKw || 0)
        : null;
      byStation[code] = { pvKw, loadKw, gridImportKw, gridExportKw, gridNetKw, soc, chargeKw, dischargeKw, sampledAt: new Date().toISOString() };
    }

    return res.status(200).json({ configured: true, connected: true, provider: "FusionSolar", connectorVersion: VERSION, byStation, coverage });
  } catch (error) {
    return res.status(502).json({ configured: true, connected: false, provider: "FusionSolar", connectorVersion: VERSION, failCode: error?.failCode ?? null, message: String(error.message || "FusionSolar live data could not be loaded.") });
  }
};