const crypto = require("crypto");

const BASE_URL = "https://eu1-developer.deyecloud.com/v1.0";
const clean = (v) => String(v ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
const num = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
const arr = (...values) => values.find(Array.isArray) || [];

function account() {
  const appId = clean(process.env.DEYE_CLOUD_APP_ID);
  const appSecret = clean(process.env.DEYE_CLOUD_APP_SECRET);
  const email = clean(process.env.DEYE_CLOUD_EMAIL);
  const password = String(process.env.DEYE_CLOUD_PASSWORD ?? "");
  const passwordHash = clean(process.env.DEYE_CLOUD_PASSWORD_SHA256);
  const companyId = clean(process.env.DEYE_CLOUD_COMPANY_ID);
  if (!appId || !appSecret || !email || (!password && !passwordHash)) throw new Error("Deye Cloud account settings are incomplete.");
  return { appId, appSecret, email, password, passwordHash, companyId, baseUrl: clean(process.env.DEYE_CLOUD_BASE_URL) || BASE_URL };
}

function passwordFor(a) {
  if (/^[a-f0-9]{64}$/i.test(a.passwordHash || "")) return a.passwordHash;
  return crypto.createHash("sha256").update(a.password, "utf8").digest("hex");
}

async function call(base, path, body, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(base + path, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: "bearer " + token } : {}) },
      body: JSON.stringify(body || {}),
    });
    const payload = await response.json().catch(() => ({}));
    const code = String(payload.code ?? "");
    if (!response.ok || payload.success === false || (code && code !== "1000000")) throw new Error(String(payload.msg || payload.message || `Deye request failed (${response.status}).`));
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function auth(a) {
  const base = String(a.baseUrl).replace(/\/+$/, "");
  const body = { appSecret: a.appSecret, email: a.email, password: passwordFor(a) };
  if (a.companyId) body.companyId = a.companyId;
  const result = await call(base, "/account/token?appId=" + encodeURIComponent(a.appId), body);
  const token = result.accessToken || result.data?.accessToken;
  if (!token) throw new Error("Deye Cloud did not return an access token.");
  return { base, token };
}

function epoch(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function dateAtZone(seconds, timeZone) {
  const date = new Date(seconds * 1000);
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  }
}

async function stationContext(base, token, stationId) {
  const stationDetail = await call(base, "/station/detail", { stationId: Number(stationId) || stationId }, token).catch(() => ({}));
  const station = stationDetail.stationDetail || stationDetail.data || stationDetail;
  const timezone = clean(station.regionTimezone || station.timezone) || "Africa/Johannesburg";
  const deviceResult = await call(base, "/station/device", { page: 1, size: 200, stationIds: [Number(stationId) || stationId] }, token).catch(() => ({}));
  const direct = arr(deviceResult.deviceListItems, deviceResult.deviceList, deviceResult.devices, deviceResult.data?.deviceListItems, deviceResult.data?.deviceList);
  let devices = direct;
  if (!devices.length) {
    const groups = arr(deviceResult.stationList, deviceResult.data?.stationList, deviceResult.data);
    const group = groups.find((x) => String(x.stationId || x.id || "") === String(stationId)) || groups[0];
    devices = group ? arr(group.deviceListItems, group.deviceList, group.devices) : [];
  }
  return {
    station: { id: stationId, name: station.name || "", timezone, installedCapacity: num(station.installedCapacity), locationAddress: station.locationAddress || "" },
    devices: devices.map((d) => ({ deviceSn: clean(d.deviceSn || d.sn || d.serialNumber), deviceType: clean(d.deviceType || d.type) || "INVERTER", productId: clean(d.productId), connectStatus: d.connectStatus ?? d.deviceState ?? null, collectionTime: d.collectionTime ?? d.updateTime ?? null })).filter((d) => d.deviceSn),
  };
}

async function dailyHistory(base, token, stationId, from, to, timezone) {
  const out = [];
  let cursor = from;
  while (cursor < to) {
    const chunkEnd = Math.min(to, cursor + 30 * 86400);
    const startAt = dateAtZone(cursor, timezone);
    const endAt = dateAtZone(chunkEnd + 86400, timezone);
    const result = await call(base, "/station/history", { stationId: Number(stationId) || stationId, granularity: 2, startAt, endAt }, token).catch(() => ({}));
    out.push(...arr(result.stationDataItems, result.data?.stationDataItems, result.data));
    cursor = chunkEnd + 1;
  }
  const seen = new Set();
  return out.filter((row) => {
    const key = row.timeStamp || `${row.year || ""}-${row.month || ""}-${row.day || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function deviceLatest(base, token, deviceSn) {
  const result = await call(base, "/device/latest", { deviceList: [deviceSn] }, token).catch(() => ({}));
  const item = arr(result.deviceDataList, result.data?.deviceDataList, result.data)[0] || {};
  return { collectionTime: item.collectionTime || item.updateTime || null, metrics: arr(item.dataList, item.data?.dataList).map((m) => ({ key: String(m.key ?? m.name ?? ""), name: String(m.name ?? m.key ?? ""), value: m.value ?? null, unit: String(m.unit ?? "") })) };
}

async function deviceHistory(base, token, deviceSn, deviceType, measurePoints, from, to) {
  const rows = [];
  let cursor = from;
  while (cursor < to) {
    const chunkEnd = Math.min(to, cursor + (5 * 86400) - 1);
    const result = await call(base, "/device/historyRaw", { deviceSn, ...(deviceType ? { deviceType } : {}), startTimestamp: cursor, endTimestamp: chunkEnd, measurePoints }, token).catch(() => ({}));
    rows.push(...arr(result.dataList, result.data?.dataList, result.data));
    cursor = chunkEnd + 1;
  }
  return rows;
}

module.exports = async function monitoringRange(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed." });
  try {
    const stationId = clean(req.query?.stationId);
    if (!stationId) return res.status(400).json({ message: "stationId is required." });
    const now = Math.floor(Date.now() / 1000);
    const from = epoch(req.query?.from, now - 86400);
    const to = epoch(req.query?.to, now);
    if (to <= from) return res.status(400).json({ message: "The end date/time must be after the start date/time." });
    if (to - from > 366 * 86400) return res.status(400).json({ message: "Station power history is limited to a maximum range of 12 months." });

    const a = account();
    const { base, token } = await auth(a);
    const context = await stationContext(base, token, stationId);
    const [powerResult, daily] = await Promise.all([
      call(base, "/station/history/power", { stationId: Number(stationId) || stationId, startTimestamp: from, endTimestamp: to }, token),
      dailyHistory(base, token, stationId, from, to, context.station.timezone),
    ]);
    const power = arr(powerResult.stationDataItems, powerResult.data?.stationDataItems, powerResult.data);

    const deviceSn = clean(req.query?.deviceSn);
    if (!deviceSn) {
      return res.status(200).json({ fetchedAt: new Date().toISOString(), from, to, station: context.station, devices: context.devices, power, daily });
    }

    const requestedType = clean(req.query?.deviceType);
    const shell = context.devices.find((d) => d.deviceSn === deviceSn) || { deviceSn, deviceType: requestedType || "INVERTER" };
    const deviceType = requestedType || shell.deviceType || "INVERTER";
    const [pointsResult, latest] = await Promise.all([
      call(base, "/device/measurePoints", { deviceSn, deviceType }, token).catch(() => ({})),
      deviceLatest(base, token, deviceSn),
    ]);
    const measurePoints = arr(pointsResult.measurePoints, pointsResult.data?.measurePoints);
    const history = measurePoints.length ? await deviceHistory(base, token, deviceSn, deviceType, measurePoints, from, to) : [];

    return res.status(200).json({ fetchedAt: new Date().toISOString(), from, to, station: context.station, devices: context.devices, power, daily, device: { ...shell, deviceType, measurePoints, latest, history } });
  } catch (error) {
    return res.status(502).json({ message: error.message || "Deye monitoring range could not be loaded." });
  }
};
