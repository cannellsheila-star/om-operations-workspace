const https = require("https");

const HOST = "sg5.fusionsolar.huawei.com";
const BASE_PATH = "/thirdData";
const VERSION = "fusionsolar-range-v1-20260915";
const SESSION_TTL_MS = 25 * 60 * 1000;
const SESSION_RENEW_MARGIN_MS = 60 * 1000;
const MAX_EXACT_RANGE_MS = 3 * 24 * 60 * 60 * 1000;

let cachedSession = null;
let cachedSessionExpiresAt = 0;
let loginPromise = null;

const clean = (value) => String(value ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
const numberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const asArray = (...values) => values.find(Array.isArray) || [];

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
        try { json = text ? JSON.parse(text) : {}; } catch {
          const error = new Error(`FusionSolar returned non-JSON data at ${path} (HTTP ${response.statusCode || 0}).`);
          error.httpStatus = Number(response.statusCode || 0);
          reject(error);
          return;
        }
        const status = Number(response.statusCode || 0);
        if (status < 200 || status >= 300) {
          const error = new Error(json?.message || `FusionSolar HTTP ${status} at ${path}.`);
          error.httpStatus = status;
          reject(error);
          return;
        }
        resolve({ json, headers: response.headers || {} });
      });
    });
    req.on("timeout", () => req.destroy(Object.assign(new Error(`FusionSolar request timed out at ${path}.`), { code: "ETIMEDOUT" })));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function validate(result, path) {
  const payload = result?.json || result || {};
  if (payload.success !== true || Number(payload.failCode || 0) !== 0) {
    const code = payload.failCode ?? "unknown";
    const error = new Error(`${payload.message || `FusionSolar request failed at ${path}`} (FusionSolar code ${code})`);
    error.failCode = code;
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

function invalidateSession() {
  cachedSession = null;
  cachedSessionExpiresAt = 0;
}

async function login(force = false) {
  const userName = clean(process.env.FUSIONSOLAR_USERNAME);
  const systemCode = clean(process.env.FUSIONSOLAR_SYSTEM_CODE);
  if (!userName || !systemCode) return null;
  if (!force && cachedSession && Date.now() < cachedSessionExpiresAt - SESSION_RENEW_MARGIN_MS) return cachedSession;
  if (loginPromise) return loginPromise;

  loginPromise = (async () => {
    const result = await requestJson("/login", { userName, systemCode });
    validate(result, "/login");
    const cookie = cookieHeader(result.headers);
    const token = headerValue(result.headers, "xsrf-token")
      || headerValue(result.headers, "x-xsrf-token")
      || cookieValue(cookie, "XSRF-TOKEN");
    if (!token) throw new Error("FusionSolar login succeeded but no XSRF token was returned.");
    cachedSession = { token, cookie };
    cachedSessionExpiresAt = Date.now() + SESSION_TTL_MS;
    return cachedSession;
  })();

  try { return await loginPromise; }
  finally { loginPromise = null; }
}

async function call(session, path, body = {}) {
  const result = await requestJson(path, body, {
    "XSRF-TOKEN": session.token,
    ...(session.cookie ? { Cookie: session.cookie } : {}),
  });
  return validate(result, path);
}

async function safeCall(session, path, body = {}) {
  try {
    return { ok: true, path, payload: await call(session, path, body) };
  } catch (error) {
    const code = Number(error?.failCode);
    if ([305, 306, 307].includes(code)) {
      try {
        invalidateSession();
        const fresh = await login(true);
        if (fresh) {
          Object.assign(session, fresh);
          return { ok: true, path, payload: await call(session, path, body), sessionRefreshed: true };
        }
      } catch (refreshError) {
        return { ok: false, path, error: String(refreshError.message || refreshError), failCode: refreshError.failCode ?? null };
      }
    }
    return { ok: false, path, error: String(error.message || error), failCode: error.failCode ?? null };
  }
}

function metricMap(row) {
  return row?.dataItemMap || row?.data || row?.kpi || {};
}

function historyRows(payload) {
  return asArray(payload?.data, payload?.data?.list);
}

function metricValue(values, keys) {
  for (const key of keys) {
    const value = numberOrNull(values?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function withinRange(time, from, to) {
  const value = numberOrNull(time);
  return value !== null && value >= from && value <= to;
}

function aggregateStationRows(rows, from, to) {
  const groups = new Map();
  rows.forEach((row) => {
    const time = numberOrNull(row?.collectTime || row?.timeStamp || row?.time);
    if (time === null || !withinRange(time, from, to)) return;
    if (!groups.has(time)) groups.set(time, { time, generationKwh: 0, consumptionKwh: 0, gridKwh: 0, hasGeneration: false, hasConsumption: false, hasGrid: false });
    const target = groups.get(time);
    const values = metricMap(row);
    const generation = metricValue(values, ["PVYield", "pv_yield", "inverterYield", "inverter_yield", "inverter_power", "product_power", "yield"]);
    const consumption = metricValue(values, ["use_power", "consumption_power", "consumption", "self_use_power"]);
    const grid = metricValue(values, ["ongrid_power", "grid_power", "on_grid_power"]);
    if (generation !== null) { target.generationKwh += generation; target.hasGeneration = true; }
    if (consumption !== null) { target.consumptionKwh += consumption; target.hasConsumption = true; }
    if (grid !== null) { target.gridKwh += grid; target.hasGrid = true; }
  });
  return [...groups.values()].sort((a, b) => a.time - b.time).map((row) => ({
    time: row.time,
    generationKwh: row.hasGeneration ? row.generationKwh : null,
    consumptionKwh: row.hasConsumption ? row.consumptionKwh : null,
    gridKwh: row.hasGrid ? row.gridKwh : null,
  }));
}

function aggregateBessRows(rows, from, to) {
  const groups = new Map();
  rows.forEach((row) => {
    const time = numberOrNull(row?.collectTime || row?.timeStamp || row?.time);
    if (time === null || !withinRange(time, from, to)) return;
    if (!groups.has(time)) groups.set(time, { time, socs: [], signedW: 0, hasPower: false, chargeKwh: 0, dischargeKwh: 0, hasCharge: false, hasDischarge: false });
    const target = groups.get(time);
    const values = metricMap(row);
    const soc = metricValue(values, ["battery_soc", "soc", "battery_state_of_capacity"]);
    const signed = metricValue(values, ["ch_discharge_power", "charge_discharge_power"]);
    const charge = metricValue(values, ["charge_cap", "charge_energy", "charged_energy"]);
    const discharge = metricValue(values, ["discharge_cap", "discharge_energy", "discharged_energy"]);
    if (soc !== null && soc >= 0 && soc <= 100) target.socs.push(soc);
    if (signed !== null) { target.signedW += signed; target.hasPower = true; }
    if (charge !== null) { target.chargeKwh += charge; target.hasCharge = true; }
    if (discharge !== null) { target.dischargeKwh += discharge; target.hasDischarge = true; }
  });
  return [...groups.values()].sort((a, b) => a.time - b.time).map((row) => {
    const signedKw = row.hasPower ? row.signedW / 1000 : null;
    return {
      time: row.time,
      soc: row.socs.length ? row.socs.reduce((sum, value) => sum + value, 0) / row.socs.length : null,
      signedPowerKw: signedKw,
      chargePowerKw: signedKw !== null && signedKw > 0 ? signedKw : (signedKw === 0 ? 0 : null),
      dischargePowerKw: signedKw !== null && signedKw < 0 ? Math.abs(signedKw) : (signedKw === 0 ? 0 : null),
      chargeEnergyKwh: row.hasCharge ? row.chargeKwh : null,
      dischargeEnergyKwh: row.hasDischarge ? row.dischargeKwh : null,
    };
  });
}

function normaliseDeviceRows(rows, from, to) {
  return rows.map((row) => {
    const time = numberOrNull(row?.collectTime || row?.timeStamp || row?.time);
    return {
      time,
      devId: String(row?.devId ?? row?.id ?? ""),
      sn: clean(row?.sn || row?.esnCode || row?.deviceSn),
      metrics: metricMap(row),
    };
  }).filter((row) => row.time !== null && withinRange(row.time, from, to)).sort((a, b) => a.time - b.time);
}

async function deviceHistory(session, ids, typeId, from, to) {
  if (!ids.length || !typeId) return { ok: true, path: "", payload: { data: [] }, granularity: "none" };
  const span = to - from;
  if (span <= MAX_EXACT_RANGE_MS && ids.length <= 10) {
    const exact = await safeCall(session, "/getDevHistoryKpi", {
      devIds: ids.join(","),
      devTypeId: Number(typeId),
      startTime: from,
      endTime: to,
    });
    if (exact.ok) return { ...exact, granularity: "5-minute" };
    const midpoint = Math.round((from + to) / 2);
    const legacy = await safeCall(session, "/getDevFiveMinutes", {
      devIds: ids.join(","),
      devTypeId: Number(typeId),
      collectTime: midpoint,
    });
    return { ...legacy, granularity: legacy.ok ? "5-minute-day" : "unavailable", fallbackFrom: exact.error || "" };
  }

  const midpoint = Math.round((from + to) / 2);
  if (span <= 45 * 24 * 60 * 60 * 1000) {
    const daily = await safeCall(session, "/getDevKpiDay", { devIds: ids.join(","), devTypeId: Number(typeId), collectTime: midpoint });
    return { ...daily, granularity: daily.ok ? "daily" : "unavailable" };
  }
  const monthly = await safeCall(session, "/getDevKpiMonth", { devIds: ids.join(","), devTypeId: Number(typeId), collectTime: midpoint });
  return { ...monthly, granularity: monthly.ok ? "monthly" : "unavailable" };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("X-FusionSolar-Range", VERSION);
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed.", connectorVersion: VERSION });

  try {
    const session = await login();
    if (!session) return res.status(200).json({ configured: false, connected: false, provider: "FusionSolar", connectorVersion: VERSION, message: "FusionSolar Northbound credentials are not configured." });

    const stationCodes = clean(req.query?.stationCodes || req.query?.stationCode).split(",").map(clean).filter(Boolean);
    const bessIds = clean(req.query?.bessIds).split(",").map(clean).filter(Boolean).slice(0, 10);
    const deviceId = clean(req.query?.deviceId);
    const deviceType = Number(req.query?.deviceType || 0);
    const from = Number(req.query?.from || 0);
    const to = Number(req.query?.to || 0);
    if (!from || !to || to <= from) return res.status(400).json({ message: "A valid from/to millisecond range is required.", connectorVersion: VERSION });
    if (to - from > 366 * 24 * 60 * 60 * 1000) return res.status(400).json({ message: "FusionSolar monitoring ranges are limited to 366 days.", connectorVersion: VERSION });

    const midpoint = Math.round((from + to) / 2);
    const span = to - from;
    const coverage = [];

    let power = [];
    let daily = [];
    if (stationCodes.length) {
      if (span <= 36 * 60 * 60 * 1000) {
        const hour = await safeCall(session, "/getKpiStationHour", { stationCodes: stationCodes.join(","), collectTime: to });
        coverage.push({ path: "/getKpiStationHour", ok: hour.ok, failCode: hour.failCode ?? null, error: hour.ok ? "" : hour.error });
        if (hour.ok) {
          const hourlyEnergy = aggregateStationRows(historyRows(hour.payload), from, to);
          power = hourlyEnergy.map((row) => ({
            time: row.time,
            pvKw: row.generationKwh,
            loadKw: row.consumptionKwh,
            gridKw: row.gridKwh,
            sourceResolution: "hour-average",
          }));
        }
      }

      const stationSummaryPath = span <= 45 * 24 * 60 * 60 * 1000 ? "/getKpiStationDay" : "/getKpiStationMonth";
      const stationSummary = await safeCall(session, stationSummaryPath, { stationCodes: stationCodes.join(","), collectTime: midpoint });
      coverage.push({ path: stationSummaryPath, ok: stationSummary.ok, failCode: stationSummary.failCode ?? null, error: stationSummary.ok ? "" : stationSummary.error });
      if (stationSummary.ok) daily = aggregateStationRows(historyRows(stationSummary.payload), from, to);
    }

    const bessHistory = bessIds.length ? await deviceHistory(session, bessIds, 41, from, to) : { ok: true, path: "", payload: { data: [] }, granularity: "none" };
    if (bessIds.length) coverage.push({ path: bessHistory.path, devTypeId: 41, ok: bessHistory.ok, failCode: bessHistory.failCode ?? null, error: bessHistory.ok ? "" : bessHistory.error, granularity: bessHistory.granularity });
    const bess = bessHistory.ok ? aggregateBessRows(historyRows(bessHistory.payload), from, to) : [];

    let device = null;
    if (deviceId && deviceType) {
      const result = await deviceHistory(session, [deviceId], deviceType, from, to);
      coverage.push({ path: result.path, devTypeId: deviceType, ok: result.ok, failCode: result.failCode ?? null, error: result.ok ? "" : result.error, granularity: result.granularity });
      device = {
        id: deviceId,
        typeId: deviceType,
        granularity: result.granularity,
        history: result.ok ? normaliseDeviceRows(historyRows(result.payload), from, to) : [],
        error: result.ok ? "" : result.error,
      };
    }

    return res.status(200).json({
      configured: true,
      connected: true,
      provider: "FusionSolar",
      connectorVersion: VERSION,
      fetchedAt: new Date().toISOString(),
      range: { from, to, spanMs: span },
      stationCodes,
      power,
      daily,
      bess,
      bessGranularity: bessHistory.granularity,
      device,
      apiCoverage: coverage,
    });
  } catch (error) {
    return res.status(502).json({ configured: true, connected: false, provider: "FusionSolar", connectorVersion: VERSION, failCode: error?.failCode ?? null, message: String(error.message || "FusionSolar range data could not be loaded.") });
  }
};
