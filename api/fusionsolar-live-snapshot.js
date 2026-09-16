const https = require("https");
const crypto = require("crypto");

const HOST = "sg5.fusionsolar.huawei.com";
const BASE_PATH = "/thirdData";
const VERSION = "fusion-live-snapshot-v2-20260916";
const CACHE_PATH = "om-workspace/fusionsolar/live-snapshot.json";
const SESSION_PATH = "om-workspace/fusionsolar/live-snapshot-session.json";
const SESSION_TTL_MS = 25 * 60 * 1000;
const SESSION_MARGIN_MS = 60 * 1000;
const INVENTORY_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_REALTIME_INTERVAL_MS = 70 * 1000;
const DEVICE_TYPES = [1, 17, 41];

let memoryCache = null;
let memorySession = null;
let memorySessionExpiresAt = 0;

const clean = (value) => String(value ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
const numberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const asArray = (...values) => values.find(Array.isArray) || [];

function fingerprint() {
  const user = clean(process.env.FUSIONSOLAR_USERNAME);
  const code = clean(process.env.FUSIONSOLAR_SYSTEM_CODE);
  return crypto.createHash("sha256").update(`${user}\n${code}`).digest("hex").slice(0, 24);
}

async function readBlob(path) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const { get } = await import("@vercel/blob");
    const result = await get(path, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return null;
    const text = await new Response(result.stream).text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function writeBlob(path, value) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    const { put } = await import("@vercel/blob");
    await put(path, JSON.stringify(value), {
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
      timeout: 20000,
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
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          const error = new Error(`FusionSolar returned non-JSON data at ${path}.`);
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
  const payload = result?.json || {};
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

async function createSession() {
  const userName = clean(process.env.FUSIONSOLAR_USERNAME);
  const systemCode = clean(process.env.FUSIONSOLAR_SYSTEM_CODE);
  if (!userName || !systemCode) return null;

  const result = await requestJson("/login", { userName, systemCode });
  validate(result, "/login");
  const cookie = cookieHeader(result.headers);
  const token = headerValue(result.headers, "xsrf-token") || headerValue(result.headers, "x-xsrf-token") || cookieValue(cookie, "XSRF-TOKEN");
  if (!token) throw new Error("FusionSolar login succeeded but no session token was returned.");

  memorySession = { token, cookie };
  memorySessionExpiresAt = Date.now() + SESSION_TTL_MS;
  await writeBlob(SESSION_PATH, {
    token,
    cookie,
    expiresAt: memorySessionExpiresAt,
    fingerprint: fingerprint(),
    updatedAt: new Date().toISOString(),
  });
  return memorySession;
}

async function login(force = false) {
  const userName = clean(process.env.FUSIONSOLAR_USERNAME);
  const systemCode = clean(process.env.FUSIONSOLAR_SYSTEM_CODE);
  if (!userName || !systemCode) return null;

  if (!force && memorySession && Date.now() < memorySessionExpiresAt - SESSION_MARGIN_MS) {
    return memorySession;
  }

  if (!force) {
    const stored = await readBlob(SESSION_PATH);
    if (stored?.token && stored.fingerprint === fingerprint() && Date.now() < Number(stored.expiresAt || 0) - SESSION_MARGIN_MS) {
      memorySession = { token: clean(stored.token), cookie: clean(stored.cookie) };
      memorySessionExpiresAt = Number(stored.expiresAt);
      return memorySession;
    }
  }

  return createSession();
}

async function call(session, path, body = {}) {
  const result = await requestJson(path, body, {
    "XSRF-TOKEN": session.token,
    ...(session.cookie ? { Cookie: session.cookie } : {}),
  });
  return validate(result, path);
}

async function safeCall(sessionRef, path, body = {}) {
  try {
    return { ok: true, payload: await call(sessionRef.current, path, body), path };
  } catch (error) {
    if (Number(error?.failCode) === 305) {
      try {
        sessionRef.current = await login(true);
        return { ok: true, payload: await call(sessionRef.current, path, body), path, relogged: true };
      } catch (retryError) {
        return { ok: false, error: String(retryError.message || retryError), failCode: retryError.failCode ?? null, path, relogged: true };
      }
    }
    return { ok: false, error: String(error.message || error), failCode: error.failCode ?? null, path };
  }
}

function deviceShell(device) {
  return {
    id: String(device?.id ?? device?.devId ?? ""),
    typeId: Number(device?.devTypeId ?? device?.typeId ?? 0),
    stationCode: clean(device?.stationCode || device?.plantCode),
    name: clean(device?.devName || device?.name),
  };
}

function metricMap(row) {
  return row?.dataItemMap || row?.data || row?.kpi || {};
}

function metricValue(values, keys) {
  for (const key of keys) {
    const value = numberOrNull(values?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function scaleMeterPower(value) {
  const parsed = numberOrNull(value);
  if (parsed === null) return null;
  return Math.abs(parsed) > 10000 ? parsed / 1000 : parsed;
}

function emptyCache() {
  return { version: 2, inventoryAt: 0, devices: [], realtime: {}, updatedAt: null };
}

async function loadCache() {
  if (memoryCache) return memoryCache;
  memoryCache = await readBlob(CACHE_PATH) || emptyCache();
  if (!memoryCache.realtime || typeof memoryCache.realtime !== "object") memoryCache.realtime = {};
  return memoryCache;
}

async function saveCache(cache) {
  cache.updatedAt = new Date().toISOString();
  cache.version = 2;
  memoryCache = cache;
  await writeBlob(CACHE_PATH, cache);
}

function nextRealtimeType(cache, devices) {
  const available = DEVICE_TYPES.filter((typeId) => devices.some((device) => device.typeId === typeId));
  if (!available.length) return null;
  const now = Date.now();
  const eligible = available.filter((typeId) => now - Number(cache.realtime?.[typeId]?.at || 0) >= MIN_REALTIME_INTERVAL_MS);
  if (!eligible.length) return null;
  return eligible.sort((a, b) => Number(cache.realtime?.[a]?.at || 0) - Number(cache.realtime?.[b]?.at || 0))[0];
}

function aggregateSites(stationCodes, devices, cache) {
  const byId = new Map(devices.map((device) => [String(device.id), device]));
  const sites = Object.fromEntries(stationCodes.map((code) => [code, {
    stationCode: code,
    pvKw: null,
    loadKw: null,
    importKw: null,
    exportKw: null,
    soc: null,
    chargeKw: null,
    dischargeKw: null,
    sampleAt: null,
  }]));

  const pvTotals = new Map();
  const gridTotals = new Map();
  const socValues = new Map();
  const chargeTotals = new Map();
  const dischargeTotals = new Map();
  const sampleTimes = new Map();

  for (const typeId of DEVICE_TYPES) {
    const record = cache.realtime?.[typeId];
    if (!record?.rows?.length) continue;

    for (const row of record.rows) {
      const device = byId.get(String(row?.devId ?? row?.id ?? ""));
      if (!device || !sites[device.stationCode]) continue;
      const values = metricMap(row);
      sampleTimes.set(device.stationCode, Math.max(sampleTimes.get(device.stationCode) || 0, Number(record.at || 0)));

      if (typeId === 1) {
        const value = metricValue(values, ["active_power", "real_power", "pv_power"]);
        if (value !== null) pvTotals.set(device.stationCode, (pvTotals.get(device.stationCode) || 0) + value);
      }

      if (typeId === 17) {
        const value = scaleMeterPower(metricValue(values, ["active_power", "grid_power", "on_grid_power"]));
        if (value !== null) gridTotals.set(device.stationCode, (gridTotals.get(device.stationCode) || 0) + value);
      }

      if (typeId === 41) {
        const soc = metricValue(values, ["battery_soc", "soc", "battery_state_of_capacity"]);
        if (soc !== null && soc >= 0 && soc <= 100) {
          if (!socValues.has(device.stationCode)) socValues.set(device.stationCode, []);
          socValues.get(device.stationCode).push(soc);
        }

        const signed = metricValue(values, ["ch_discharge_power", "charge_discharge_power"]);
        if (signed !== null) {
          const kw = signed / 1000;
          if (kw > 0) chargeTotals.set(device.stationCode, (chargeTotals.get(device.stationCode) || 0) + kw);
          if (kw < 0) dischargeTotals.set(device.stationCode, (dischargeTotals.get(device.stationCode) || 0) + Math.abs(kw));
        }
      }
    }
  }

  for (const code of stationCodes) {
    const site = sites[code];
    if (pvTotals.has(code)) site.pvKw = pvTotals.get(code);

    if (gridTotals.has(code)) {
      const net = gridTotals.get(code);
      site.importKw = Math.max(-net, 0);
      site.exportKw = Math.max(net, 0);
    }

    if (socValues.has(code)) {
      const values = socValues.get(code);
      site.soc = values.reduce((a, b) => a + b, 0) / values.length;
    }
    if (chargeTotals.has(code)) site.chargeKw = chargeTotals.get(code);
    if (dischargeTotals.has(code)) site.dischargeKw = dischargeTotals.get(code);

    site.sampleAt = sampleTimes.get(code) ? new Date(sampleTimes.get(code)).toISOString() : null;

    if (site.pvKw !== null && site.importKw !== null && site.exportKw !== null) {
      site.loadKw = Math.max(
        0,
        site.pvKw + site.importKw + (site.dischargeKw || 0) - site.exportKw - (site.chargeKw || 0)
      );
    }
  }

  return sites;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("X-Fusion-Live-Snapshot", VERSION);
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed." });

  const stationCodes = clean(req.query?.stationCodes).split(",").map(clean).filter(Boolean);
  if (!stationCodes.length) return res.status(400).json({ message: "stationCodes is required." });

  const cache = await loadCache();
  const coverage = [];
  const sessionRef = { current: null };

  try {
    sessionRef.current = await login();
  } catch (error) {
    coverage.push({ path: "/login", ok: false, failCode: error.failCode ?? null, error: String(error.message || error) });
  }

  if (sessionRef.current) {
    const inventoryAge = Date.now() - Number(cache.inventoryAt || 0);
    if (!cache.devices?.length || inventoryAge > INVENTORY_TTL_MS) {
      const devList = await safeCall(sessionRef, "/getDevList", { stationCodes: stationCodes.join(",") });
      coverage.push({
        path: "/getDevList",
        ok: devList.ok,
        failCode: devList.failCode ?? null,
        relogged: Boolean(devList.relogged),
        error: devList.ok ? "" : devList.error,
      });
      if (devList.ok) {
        cache.devices = asArray(devList.payload?.data, devList.payload?.data?.list)
          .map(deviceShell)
          .filter((device) => device.id && device.stationCode);
        cache.inventoryAt = Date.now();
      }
    }

    const devices = (cache.devices || []).filter((device) => stationCodes.includes(device.stationCode));
    const typeId = nextRealtimeType(cache, devices);
    if (typeId) {
      const ids = devices.filter((device) => device.typeId === typeId).map((device) => device.id).slice(0, 100);
      if (ids.length) {
        const realtime = await safeCall(sessionRef, "/getDevRealKpi", { devIds: ids.join(","), devTypeId: typeId });
        coverage.push({
          path: "/getDevRealKpi",
          devTypeId: typeId,
          ok: realtime.ok,
          failCode: realtime.failCode ?? null,
          relogged: Boolean(realtime.relogged),
          error: realtime.ok ? "" : realtime.error,
        });
        if (realtime.ok) {
          cache.realtime[typeId] = {
            at: Date.now(),
            rows: asArray(realtime.payload?.data, realtime.payload?.data?.list),
          };
        }
      }
    }

    await saveCache(cache);
  }

  const devices = (cache.devices || []).filter((device) => stationCodes.includes(device.stationCode));
  const sites = aggregateSites(stationCodes, devices, cache);
  const timestamps = Object.values(cache.realtime || {})
    .map((item) => Number(item?.at || 0))
    .filter(Boolean);
  const newest = timestamps.length ? Math.max(...timestamps) : 0;

  return res.status(200).json({
    configured: Boolean(process.env.FUSIONSOLAR_USERNAME && process.env.FUSIONSOLAR_SYSTEM_CODE),
    connected: Boolean(sessionRef.current),
    provider: "FusionSolar",
    connectorVersion: VERSION,
    fetchedAt: new Date().toISOString(),
    cacheUpdatedAt: cache.updatedAt || null,
    newestLiveSampleAt: newest ? new Date(newest).toISOString() : null,
    devicesCached: devices.length,
    sites,
    apiCoverage: coverage,
  });
};
