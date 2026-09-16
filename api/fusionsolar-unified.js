const https = require("https");
const crypto = require("crypto");

const HOST = "sg5.fusionsolar.huawei.com";
const BASE_PATH = "/thirdData";
const VERSION = "fusionsolar-unified-v1-20260916";
const SESSION_PATH = "om-workspace/fusionsolar/session.json";
const SESSION_TTL_MS = 25 * 60 * 1000;
const SESSION_RENEW_MARGIN_MS = 60 * 1000;
const MAX_EXACT_RANGE_MS = 3 * 24 * 60 * 60 * 1000;
const PLANT_CACHE_MS = 5 * 60 * 1000;
const STATION_CACHE_MS = 2 * 60 * 1000;

let cachedSession = null;
let cachedSessionExpiresAt = 0;
let loginPromise = null;
let cachedPlants = null;
let cachedPlantsAt = 0;
const stationCache = new Map();

const clean = (value) => String(value ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
const numberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const asArray = (...values) => values.find(Array.isArray) || [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function credentialFingerprint() {
  const user = clean(process.env.FUSIONSOLAR_USERNAME);
  const code = clean(process.env.FUSIONSOLAR_SYSTEM_CODE);
  return crypto.createHash("sha256").update(`${user}\n${code}`).digest("hex").slice(0, 24);
}

async function readSharedSession() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const { get } = await import("@vercel/blob");
    const result = await get(SESSION_PATH, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return null;
    const text = await new Response(result.stream).text();
    if (!text) return null;
    const record = JSON.parse(text);
    if (!record?.token || !record?.expiresAt) return null;
    if (record.fingerprint !== credentialFingerprint()) return null;
    if (Date.now() >= Number(record.expiresAt) - SESSION_RENEW_MARGIN_MS) return null;
    return { token: clean(record.token), cookie: clean(record.cookie), expiresAt: Number(record.expiresAt) };
  } catch {
    return null;
  }
}

async function writeSharedSession(session, expiresAt) {
  if (!process.env.BLOB_READ_WRITE_TOKEN || !session?.token) return;
  try {
    const { put } = await import("@vercel/blob");
    await put(SESSION_PATH, JSON.stringify({
      version: 1,
      token: session.token,
      cookie: session.cookie || "",
      expiresAt,
      fingerprint: credentialFingerprint(),
      updatedAt: new Date().toISOString(),
    }), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  } catch {
    // Local in-memory session still works if shared storage is temporarily unavailable.
  }
}

async function clearSharedSession() {
  cachedSession = null;
  cachedSessionExpiresAt = 0;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    const { put } = await import("@vercel/blob");
    await put(SESSION_PATH, JSON.stringify({ version: 1, expired: true, expiresAt: 0, fingerprint: credentialFingerprint(), updatedAt: new Date().toISOString() }), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  } catch {}
}

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

async function recoverSharedSession() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await delay(450 + attempt * 250);
    const shared = await readSharedSession();
    if (shared) {
      cachedSession = { token: shared.token, cookie: shared.cookie || "" };
      cachedSessionExpiresAt = shared.expiresAt;
      return cachedSession;
    }
  }
  return null;
}

async function login(force = false) {
  const userName = clean(process.env.FUSIONSOLAR_USERNAME);
  const systemCode = clean(process.env.FUSIONSOLAR_SYSTEM_CODE);
  if (!userName || !systemCode) return null;

  if (!force && cachedSession && Date.now() < cachedSessionExpiresAt - SESSION_RENEW_MARGIN_MS) return cachedSession;
  if (!force) {
    const shared = await readSharedSession();
    if (shared) {
      cachedSession = { token: shared.token, cookie: shared.cookie || "" };
      cachedSessionExpiresAt = shared.expiresAt;
      return cachedSession;
    }
  }
  if (loginPromise) return loginPromise;

  loginPromise = (async () => {
    try {
      const result = await requestJson("/login", { userName, systemCode });
      validate(result, "/login");
      const cookie = cookieHeader(result.headers);
      const token = headerValue(result.headers, "xsrf-token") || headerValue(result.headers, "x-xsrf-token") || cookieValue(cookie, "XSRF-TOKEN");
      if (!token) throw new Error("FusionSolar login succeeded but no XSRF token was returned.");
      cachedSession = { token, cookie };
      cachedSessionExpiresAt = Date.now() + SESSION_TTL_MS;
      await writeSharedSession(cachedSession, cachedSessionExpiresAt);
      return cachedSession;
    } catch (error) {
      // If another invocation logged in at the same time, Huawei can return 407.
      // Re-use the shared session that the winning invocation just persisted.
      if (Number(error?.failCode) === 407) {
        const recovered = await recoverSharedSession();
        if (recovered) return recovered;
      }
      throw error;
    }
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
        await clearSharedSession();
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

function metricMap(row) { return row?.dataItemMap || row?.data || row?.kpi || {}; }
function historyRows(payload) { return asArray(payload?.data, payload?.data?.list); }
function metricValue(values, keys) {
  for (const key of keys) {
    const value = numberOrNull(values?.[key]);
    if (value !== null) return value;
  }
  return null;
}
function plantCode(plant) { return clean(plant?.plantCode || plant?.stationCode || plant?.code); }
function plantName(plant) { return clean(plant?.plantName || plant?.stationName || plant?.name) || plantCode(plant); }
function plantCapacity(plant) { return numberOrNull(plant?.capacity ?? plant?.installedCapacity ?? plant?.installed_capacity); }

async function getPlantList(session) {
  if (cachedPlants?.length && Date.now() - cachedPlantsAt < PLANT_CACHE_MS) return { plants: cachedPlants, cached: true, endpoint: "/stations" };
  const modern = await safeCall(session, "/stations", { pageNo: 1 });
  if (modern.ok) {
    const data = modern.payload.data || {};
    const plants = [...asArray(data.list, data.stationList, data)];
    const pageCount = Math.max(1, Number(data.pageCount || 1));
    for (let pageNo = 2; pageNo <= Math.min(pageCount, 100); pageNo += 1) {
      const page = await call(session, "/stations", { pageNo });
      const pageData = page.data || {};
      plants.push(...asArray(pageData.list, pageData.stationList, pageData));
    }
    cachedPlants = plants; cachedPlantsAt = Date.now();
    return { plants, cached: false, endpoint: "/stations" };
  }
  const legacy = await call(session, "/getStationList", {});
  const plants = asArray(legacy.data, legacy.data?.list);
  cachedPlants = plants; cachedPlantsAt = Date.now();
  return { plants, cached: false, endpoint: "/getStationList", fallbackReason: modern.error || "" };
}

function normaliseStationMetrics(payload, code) {
  const rows = asArray(payload?.data, payload?.data?.list);
  const row = rows.find((item) => clean(item?.stationCode || item?.plantCode) === clean(code)) || {};
  const values = metricMap(row);
  const health = String(values.real_health_state ?? values.health_state ?? "");
  return {
    raw: values,
    powerKw: metricValue(values, ["active_power", "real_power", "pv_power"]),
    energyTodayKwh: metricValue(values, ["day_power", "day_energy", "daily_power"]),
    energyMonthKwh: metricValue(values, ["month_power", "month_energy"]),
    energyTotalKwh: metricValue(values, ["total_power", "total_energy"]),
    status: health === "3" ? "Operational" : health === "2" ? "Attention required" : health === "1" ? "Non-operational" : "Unknown",
  };
}

async function stationRealtime(session, codes) {
  const key = codes.slice().sort().join(",");
  const cached = stationCache.get(key);
  if (cached && Date.now() - cached.at < STATION_CACHE_MS) return { ok: true, payload: cached.payload, cached: true };
  const result = await safeCall(session, "/getStationRealKpi", { stationCodes: codes.join(",") });
  if (result.ok) stationCache.set(key, { at: Date.now(), payload: result.payload });
  return result;
}

function deviceShell(device) {
  return {
    id: String(device.id ?? device.devId ?? ""),
    sn: clean(device.esnCode || device.sn || device.deviceSn),
    name: clean(device.devName || device.name),
    typeId: Number(device.devTypeId ?? device.typeId ?? 0),
    typeName: clean(device.devTypeName || device.typeName),
    model: clean(device.invType || device.model || device.devModel),
    stationCode: clean(device.stationCode || device.plantCode),
    raw: device,
  };
}

function batteryMetrics(devices, rows) {
  const byId = new Map(devices.map((d) => [String(d.id), d]));
  return rows.map((row) => {
    const id = String(row?.devId ?? row?.id ?? "");
    const device = byId.get(id);
    if (!device || device.typeId !== 41) return null;
    const values = metricMap(row);
    const signedW = metricValue(values, ["ch_discharge_power", "charge_discharge_power"]);
    const signedPowerKw = signedW === null ? null : signedW / 1000;
    return {
      id: device.id,
      sn: device.sn,
      name: device.name || device.model || `ESS ${device.id}`,
      model: device.model,
      stationCode: device.stationCode,
      typeId: device.typeId,
      soc: metricValue(values, ["battery_soc", "soc", "battery_state_of_capacity"]),
      soh: metricValue(values, ["battery_soh", "soh"]),
      signedPowerKw,
      chargePowerKw: signedPowerKw !== null && signedPowerKw > 0 ? signedPowerKw : (signedPowerKw === 0 ? 0 : null),
      dischargePowerKw: signedPowerKw !== null && signedPowerKw < 0 ? Math.abs(signedPowerKw) : (signedPowerKw === 0 ? 0 : null),
      chargeTodayKwh: metricValue(values, ["charge_cap", "charged_energy", "charge_energy"]),
      dischargeTodayKwh: metricValue(values, ["discharge_cap", "discharged_energy", "discharge_energy"]),
      raw: values,
    };
  }).filter(Boolean);
}

function sum(values) {
  const nums = values.map(numberOrNull).filter((value) => value !== null);
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
}
function avg(values) {
  const nums = values.map(numberOrNull).filter((value) => value !== null);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}
function worstStatus(statuses) {
  if (statuses.includes("Non-operational")) return "Non-operational";
  if (statuses.includes("Attention required")) return "Attention required";
  if (statuses.includes("Operational")) return "Operational";
  return "Unknown";
}

async function portfolio(session) {
  const list = await getPlantList(session);
  const codes = list.plants.map(plantCode).filter(Boolean);
  const real = codes.length ? await stationRealtime(session, codes.slice(0, 100)) : { ok: true, payload: { data: [] } };
  const systems = list.plants.map((plant) => {
    const code = plantCode(plant);
    const metrics = normaliseStationMetrics(real.ok ? real.payload : {}, code);
    return {
      systemId: `huawei:${code}`,
      provider: "FusionSolar",
      providerStationId: code,
      name: plantName(plant),
      installedCapacityKw: plantCapacity(plant),
      locationAddress: clean(plant.plantAddress || plant.stationAddr || plant.address),
      status: metrics.status,
      powerKw: metrics.powerKw,
      energyTodayKwh: metrics.energyTodayKwh,
      energyMonthKwh: metrics.energyMonthKwh,
      energyTotalKwh: metrics.energyTotalKwh,
      rawPlant: plant,
      rawRealtime: metrics.raw,
    };
  });
  return { systems, endpoint: list.endpoint, fallbackReason: list.fallbackReason || "", apiCoverage: [{ path: list.endpoint, ok: true }, { path: "/getStationRealKpi", ok: Boolean(real.ok), error: real.ok ? "" : real.error }] };
}

async function detail(session, requestedCodes) {
  const list = await getPlantList(session);
  const wanted = new Set(requestedCodes.map(clean).filter(Boolean));
  const selectedPlants = list.plants.filter((p) => wanted.has(plantCode(p)));
  const codes = selectedPlants.map(plantCode);
  if (!codes.length) throw new Error("None of the requested FusionSolar plants were found in the Northbound account.");
  const stationCodes = codes.join(",");

  const [real, devList, alarms] = await Promise.all([
    stationRealtime(session, codes),
    safeCall(session, "/getDevList", { stationCodes }),
    safeCall(session, "/getAlarmList", { stationCodes }),
  ]);
  const devices = devList.ok ? asArray(devList.payload?.data, devList.payload?.data?.list).map(deviceShell) : [];
  const ess = devices.filter((d) => d.typeId === 41 && d.id).slice(0, 100);
  let bessRows = [];
  let bessRealtime = { ok: true, path: "/getDevRealKpi", payload: { data: [] } };
  if (ess.length) {
    bessRealtime = await safeCall(session, "/getDevRealKpi", { devIds: ess.map((d) => d.id).join(","), devTypeId: 41 });
    if (bessRealtime.ok) bessRows = asArray(bessRealtime.payload?.data, bessRealtime.payload?.data?.list);
  }
  const bessDevices = batteryMetrics(devices, bessRows);
  const plants = selectedPlants.map((plant) => {
    const code = plantCode(plant);
    const metrics = normaliseStationMetrics(real.ok ? real.payload : {}, code);
    return { providerStationId: code, name: plantName(plant), installedCapacityKw: plantCapacity(plant), locationAddress: clean(plant.plantAddress || plant.stationAddr || plant.address), ...metrics };
  });
  const alarmRows = alarms.ok ? asArray(alarms.payload?.data, alarms.payload?.data?.list) : [];
  const aggregate = {
    powerKw: sum(plants.map((x) => x.powerKw)),
    energyTodayKwh: sum(plants.map((x) => x.energyTodayKwh)),
    energyMonthKwh: sum(plants.map((x) => x.energyMonthKwh)),
    energyTotalKwh: sum(plants.map((x) => x.energyTotalKwh)),
    installedCapacityKw: sum(plants.map((x) => x.installedCapacityKw)),
    status: worstStatus(plants.map((x) => x.status)),
    batterySoc: avg(bessDevices.map((x) => x.soc)),
    batterySoh: avg(bessDevices.map((x) => x.soh)),
    chargePowerKw: sum(bessDevices.filter((x) => numberOrNull(x.signedPowerKw) > 0).map((x) => x.signedPowerKw)),
    dischargePowerKw: sum(bessDevices.filter((x) => numberOrNull(x.signedPowerKw) < 0).map((x) => Math.abs(x.signedPowerKw))),
    chargeTodayKwh: sum(bessDevices.map((x) => x.chargeTodayKwh)),
    dischargeTodayKwh: sum(bessDevices.map((x) => x.dischargeTodayKwh)),
    bessDeviceCount: bessDevices.length,
    deviceCount: devices.length,
    alarmCount: alarmRows.length,
  };
  return {
    provider: "FusionSolar",
    providerStationIds: codes,
    plants,
    aggregate,
    bessDevices,
    devices,
    deviceRealtime: bessRows,
    alarms: alarmRows,
    history: { hour: [], day: [], coverage: [] },
    apiCoverage: [
      { path: "/getStationRealKpi", ok: Boolean(real.ok), error: real.ok ? "" : real.error },
      { path: "/getDevList", ok: Boolean(devList.ok), error: devList.ok ? "" : devList.error },
      { path: "/getAlarmList", ok: Boolean(alarms.ok), error: alarms.ok ? "" : alarms.error },
      { path: "/getDevRealKpi", devTypeId: 41, ok: Boolean(bessRealtime.ok), error: bessRealtime.ok ? "" : bessRealtime.error },
    ],
  };
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
    const target = groups.get(time), values = metricMap(row);
    const generation = metricValue(values, ["PVYield", "pv_yield", "inverterYield", "inverter_yield", "inverter_power", "product_power", "yield"]);
    const consumption = metricValue(values, ["use_power", "consumption_power", "consumption", "self_use_power"]);
    const grid = metricValue(values, ["ongrid_power", "grid_power", "on_grid_power"]);
    if (generation !== null) { target.generationKwh += generation; target.hasGeneration = true; }
    if (consumption !== null) { target.consumptionKwh += consumption; target.hasConsumption = true; }
    if (grid !== null) { target.gridKwh += grid; target.hasGrid = true; }
  });
  return [...groups.values()].sort((a, b) => a.time - b.time).map((r) => ({ time: r.time, generationKwh: r.hasGeneration ? r.generationKwh : null, consumptionKwh: r.hasConsumption ? r.consumptionKwh : null, gridKwh: r.hasGrid ? r.gridKwh : null }));
}
function aggregateBessRows(rows, from, to) {
  const groups = new Map();
  rows.forEach((row) => {
    const time = numberOrNull(row?.collectTime || row?.timeStamp || row?.time);
    if (time === null || !withinRange(time, from, to)) return;
    if (!groups.has(time)) groups.set(time, { time, socs: [], signedW: 0, hasPower: false, chargeKwh: 0, dischargeKwh: 0, hasCharge: false, hasDischarge: false });
    const target = groups.get(time), values = metricMap(row);
    const soc = metricValue(values, ["battery_soc", "soc", "battery_state_of_capacity"]);
    const signed = metricValue(values, ["ch_discharge_power", "charge_discharge_power"]);
    const charge = metricValue(values, ["charge_cap", "charge_energy", "charged_energy"]);
    const discharge = metricValue(values, ["discharge_cap", "discharge_energy", "discharged_energy"]);
    if (soc !== null && soc >= 0 && soc <= 100) target.socs.push(soc);
    if (signed !== null) { target.signedW += signed; target.hasPower = true; }
    if (charge !== null) { target.chargeKwh += charge; target.hasCharge = true; }
    if (discharge !== null) { target.dischargeKwh += discharge; target.hasDischarge = true; }
  });
  return [...groups.values()].sort((a, b) => a.time - b.time).map((r) => {
    const signedKw = r.hasPower ? r.signedW / 1000 : null;
    return { time: r.time, soc: r.socs.length ? r.socs.reduce((a, b) => a + b, 0) / r.socs.length : null, signedPowerKw: signedKw, chargePowerKw: signedKw !== null && signedKw > 0 ? signedKw : (signedKw === 0 ? 0 : null), dischargePowerKw: signedKw !== null && signedKw < 0 ? Math.abs(signedKw) : (signedKw === 0 ? 0 : null), chargeEnergyKwh: r.hasCharge ? r.chargeKwh : null, dischargeEnergyKwh: r.hasDischarge ? r.dischargeKwh : null };
  });
}
function normaliseDeviceRows(rows, from, to) {
  return rows.map((row) => ({ time: numberOrNull(row?.collectTime || row?.timeStamp || row?.time), devId: String(row?.devId ?? row?.id ?? ""), sn: clean(row?.sn || row?.esnCode || row?.deviceSn), metrics: metricMap(row) }))
    .filter((r) => r.time !== null && withinRange(r.time, from, to)).sort((a, b) => a.time - b.time);
}
async function deviceHistory(session, ids, typeId, from, to) {
  if (!ids.length || !typeId) return { ok: true, path: "", payload: { data: [] }, granularity: "none" };
  const span = to - from;
  if (span <= MAX_EXACT_RANGE_MS && ids.length <= 10) {
    const exact = await safeCall(session, "/getDevHistoryKpi", { devIds: ids.join(","), devTypeId: Number(typeId), startTime: from, endTime: to });
    if (exact.ok) return { ...exact, granularity: "5-minute" };
    const legacy = await safeCall(session, "/getDevFiveMinutes", { devIds: ids.join(","), devTypeId: Number(typeId), collectTime: Math.round((from + to) / 2) });
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

async function range(session, req) {
  const stationCodes = clean(req.query?.stationCodes || req.query?.stationCode).split(",").map(clean).filter(Boolean);
  const bessIds = clean(req.query?.bessIds).split(",").map(clean).filter(Boolean).slice(0, 10);
  const deviceIds = clean(req.query?.deviceId).split(",").map(clean).filter(Boolean).slice(0, 10);
  const deviceType = Number(req.query?.deviceType || 0);
  const from = Number(req.query?.from || 0), to = Number(req.query?.to || 0);
  if (!from || !to || to <= from) throw Object.assign(new Error("A valid from/to millisecond range is required."), { httpStatus: 400 });
  if (to - from > 366 * 86400000) throw Object.assign(new Error("FusionSolar monitoring ranges are limited to 366 days."), { httpStatus: 400 });
  const span = to - from, midpoint = Math.round((from + to) / 2), coverage = [];
  let power = [], daily = [];
  if (stationCodes.length) {
    if (span <= 36 * 60 * 60 * 1000) {
      const hour = await safeCall(session, "/getKpiStationHour", { stationCodes: stationCodes.join(","), collectTime: to });
      coverage.push({ path: "/getKpiStationHour", ok: hour.ok, failCode: hour.failCode ?? null, error: hour.ok ? "" : hour.error });
      if (hour.ok) power = aggregateStationRows(historyRows(hour.payload), from, to).map((r) => ({ time: r.time, pvKw: r.generationKwh, loadKw: r.consumptionKwh, gridKw: r.gridKwh, sourceResolution: "hour-average" }));
    }
    const summaryPath = span <= 45 * 86400000 ? "/getKpiStationDay" : "/getKpiStationMonth";
    const summary = await safeCall(session, summaryPath, { stationCodes: stationCodes.join(","), collectTime: midpoint });
    coverage.push({ path: summaryPath, ok: summary.ok, failCode: summary.failCode ?? null, error: summary.ok ? "" : summary.error });
    if (summary.ok) daily = aggregateStationRows(historyRows(summary.payload), from, to);
  }
  const bessHistory = bessIds.length ? await deviceHistory(session, bessIds, 41, from, to) : { ok: true, path: "", payload: { data: [] }, granularity: "none" };
  if (bessIds.length) coverage.push({ path: bessHistory.path, devTypeId: 41, ok: bessHistory.ok, failCode: bessHistory.failCode ?? null, error: bessHistory.ok ? "" : bessHistory.error, granularity: bessHistory.granularity });
  const bess = bessHistory.ok ? aggregateBessRows(historyRows(bessHistory.payload), from, to) : [];
  let device = null;
  if (deviceIds.length && deviceType) {
    const result = await deviceHistory(session, deviceIds, deviceType, from, to);
    coverage.push({ path: result.path, devTypeId: deviceType, ok: result.ok, failCode: result.failCode ?? null, error: result.ok ? "" : result.error, granularity: result.granularity });
    device = { id: deviceIds.join(","), ids: deviceIds, typeId: deviceType, granularity: result.granularity, history: result.ok ? normaliseDeviceRows(historyRows(result.payload), from, to) : [], error: result.ok ? "" : result.error };
  }
  return { range: { from, to, spanMs: span }, stationCodes, power, daily, bess, bessGranularity: bessHistory.granularity, device, apiCoverage: coverage };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("X-FusionSolar-Unified", VERSION);
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed.", connectorVersion: VERSION });

  try {
    const session = await login();
    if (!session) return res.status(200).json({ configured: false, connected: false, provider: "FusionSolar", connectorVersion: VERSION, message: "FusionSolar Northbound credentials are not configured." });

    const from = Number(req.query?.from || 0), to = Number(req.query?.to || 0);
    if (from && to) {
      const data = await range(session, req);
      return res.status(200).json({ configured: true, connected: true, provider: "FusionSolar", connectorVersion: VERSION, fetchedAt: new Date().toISOString(), ...data });
    }

    const requestedCodes = clean(req.query?.stationCodes || req.query?.stationCode).split(",").map(clean).filter(Boolean);
    if (requestedCodes.length) {
      const siteDetail = await detail(session, requestedCodes);
      return res.status(200).json({ configured: true, connected: true, provider: "FusionSolar", connectorVersion: VERSION, fetchedAt: new Date().toISOString(), detail: siteDetail });
    }

    const data = await portfolio(session);
    return res.status(200).json({ configured: true, connected: true, provider: "FusionSolar", connectorVersion: VERSION, fetchedAt: new Date().toISOString(), message: `${data.systems.length} FusionSolar plant${data.systems.length === 1 ? "" : "s"} returned from SG5.`, ...data });
  } catch (error) {
    const status = Number(error?.httpStatus) || 502;
    return res.status(status).json({ configured: true, connected: false, provider: "FusionSolar", connectorVersion: VERSION, failCode: error?.failCode ?? null, message: String(error?.message || "FusionSolar data could not be loaded.") });
  }
};
