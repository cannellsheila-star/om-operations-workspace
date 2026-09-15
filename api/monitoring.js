const crypto = require("crypto");

const DEYE_BASE_URL = "https://eu1-developer.deyecloud.com/v1.0";
const CONFIG_SUPPORTED_TYPES = new Set(["INVERTER", "MICRO_INVERTER", "MICRO_STORAGE_IN_ONE"]);
const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const first = (object, keys) => keys.map((key) => object?.[key]).find((value) => value !== undefined && value !== null && value !== "");
const stationId = (station) => String(first(station, ["stationId", "station_id", "id"]) || "");
const stationName = (station) => String(first(station, ["stationName", "station_name", "name", "plantName"]) || "");
const clean = (value) => String(value ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
const toKw = (value) => {
  const number = numeric(value);
  return number === null ? null : number / 1000;
};

function individualAccount() {
  const appId = clean(process.env.DEYE_CLOUD_APP_ID);
  const email = clean(process.env.DEYE_CLOUD_EMAIL);
  const appSecret = clean(process.env.DEYE_CLOUD_APP_SECRET);
  const password = String(process.env.DEYE_CLOUD_PASSWORD ?? "");
  const passwordHash = clean(process.env.DEYE_CLOUD_PASSWORD_SHA256);
  if (!appId && !email && !appSecret && !password && !passwordHash) return null;
  return {
    label: clean(process.env.DEYE_CLOUD_LABEL) || "Deye Cloud",
    appId,
    appSecret,
    email,
    companyId: clean(process.env.DEYE_CLOUD_COMPANY_ID),
    password,
    passwordHash,
    baseUrl: clean(process.env.DEYE_CLOUD_BASE_URL),
  };
}

function configuredAccounts() {
  const direct = individualAccount();
  if (direct) return [direct];
  if (!process.env.DEYE_CLOUD_ACCOUNTS) return [];
  try {
    const parsed = JSON.parse(process.env.DEYE_CLOUD_ACCOUNTS);
    const list = Array.isArray(parsed) ? parsed : parsed.accounts;
    if (!Array.isArray(list)) throw new Error();
    return list.filter((account) => account && typeof account === "object").map((account) => ({
      ...account,
      appId: clean(account.appId),
      appSecret: clean(account.appSecret),
      email: clean(account.email),
      companyId: clean(account.companyId),
      password: String(account.password ?? ""),
      passwordHash: clean(account.passwordHash || account.passwordSha256),
      baseUrl: clean(account.baseUrl),
      label: clean(account.label) || "Deye Cloud",
    }));
  } catch {
    throw new Error("DEYE_CLOUD_ACCOUNTS must be a valid JSON list.");
  }
}

function passwordFor(account) {
  const supplied = clean(account.passwordHash || account.passwordSha256);
  if (/^[a-f0-9]{64}$/i.test(supplied)) return supplied;
  if (!account.password) throw new Error("A Deye Cloud password is missing.");
  return crypto.createHash("sha256").update(String(account.password), "utf8").digest("hex");
}

async function callDeye(url, body, token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "bearer " + String(token).replace(/^bearer\s+/i, "") } : {}),
      },
      body: JSON.stringify(body || {}),
    });
    const payload = await response.json().catch(() => ({}));
    const code = String(payload.code ?? "");
    if (!response.ok || payload.success === false || (code && code !== "1000000")) {
      const detail = String(payload.msg || payload.message || "Deye Cloud request failed (" + response.status + ").");
      const error = new Error(detail);
      error.code = code;
      error.status = response.status;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function safeCall(base, path, body, token) {
  try {
    const data = await callDeye(base + path, body, token);
    return { ok: true, path, data };
  } catch (error) {
    return { ok: false, path, error: String(error.message || error), code: String(error.code || "") };
  }
}

function batches(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function asArray(...candidates) {
  return candidates.find(Array.isArray) || [];
}

function dateAtZone(date, timeZone) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "Africa/Johannesburg",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Johannesburg",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }
}

function deviceConnectionState(device, latest) {
  const raw = first(latest, ["deviceState", "connectStatus", "connectionStatus"]) ?? first(device, ["connectStatus", "deviceState", "connectionStatus"]);
  const value = String(raw ?? "").toLowerCase();
  if (["1", "online", "normal"].includes(value)) return "Online";
  if (["2", "alert", "warning", "fault"].includes(value)) return "Alert";
  if (["0", "3", "offline", "offlien", "disconnected"].includes(value)) return "Offline";
  return "Unknown";
}

function normaliseDeviceShell(device) {
  return {
    deviceSn: clean(first(device, ["deviceSn", "sn", "serialNumber"])),
    deviceId: first(device, ["deviceId", "id"]) ?? null,
    deviceType: clean(first(device, ["deviceType", "type"])) || "UNKNOWN",
    productId: clean(first(device, ["productId", "product_id"])),
    collectionTime: first(device, ["collectionTime", "updateTime", "lastUpdateTime"]) ?? null,
    connectStatus: first(device, ["connectStatus", "deviceState", "connectionStatus"]) ?? null,
  };
}

function normaliseMetric(item) {
  if (!item || typeof item !== "object") return null;
  return {
    key: String(item.key ?? item.name ?? ""),
    name: String(item.name ?? item.key ?? ""),
    value: item.value ?? null,
    unit: String(item.unit ?? ""),
  };
}

function metricNumber(metrics, keys) {
  const wanted = keys.map((key) => key.toLowerCase().replace(/[^a-z0-9]/g, ""));
  for (const metric of metrics) {
    const key = String(metric.key || metric.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (wanted.includes(key)) {
      const value = numeric(metric.value);
      if (value !== null) return value;
    }
  }
  return null;
}

function normaliseAlert(item, source, deviceSn = "") {
  const start = numeric(first(item, ["alertStartTime", "startTime", "startTimestamp", "createTime"])) || 0;
  const end = numeric(first(item, ["alertEndTime", "endTime", "endTimestamp", "recoverTime"])) || 0;
  const rawStatus = first(item, ["status", "alertStatus", "state"]);
  const statusString = String(rawStatus ?? "").toLowerCase();
  const explicitlyOpen = rawStatus === 1 || statusString === "1" || ["open", "active", "ongoing"].includes(statusString);
  const explicitlyClosed = rawStatus === 0 || statusString === "0" || ["closed", "resolved", "recovered"].includes(statusString);
  const active = explicitlyOpen || (!explicitlyClosed && (!end || end <= start));
  return {
    source,
    deviceSn: deviceSn || clean(first(item, ["deviceSn"])),
    id: String(first(item, ["alertId", "id"]) || [source, deviceSn, first(item, ["alertCode", "protocolName", "alertName"]), start].filter(Boolean).join(":")),
    code: String(first(item, ["alertCode", "protocolName", "code"]) || ""),
    name: String(first(item, ["alertName", "name", "title"]) || "Deye Cloud alert"),
    description: String(first(item, ["description", "desc", "message"]) || ""),
    reason: String(first(item, ["reason", "cause"]) || ""),
    solution: String(first(item, ["solution", "suggestion"]) || ""),
    level: numeric(first(item, ["level", "severity"])) ?? null,
    impact: numeric(first(item, ["impact"])) ?? null,
    status: rawStatus ?? null,
    active,
    startTime: start || null,
    endTime: end || null,
  };
}

function extractStationHistory(historyResponse) {
  if (!historyResponse?.ok) return [];
  return asArray(historyResponse.data.stationDataItems, historyResponse.data.data?.stationDataItems, historyResponse.data.data);
}

function energyTodayFromHistory(historyResponse, station) {
  const rows = extractStationHistory(historyResponse);
  const generationValues = rows.map((row) => numeric(first(row, ["generationValue", "generation", "generationEnergy", "energy"]))).filter((value) => value !== null);
  if (generationValues.length) return generationValues.at(-1);
  return numeric(first(station, ["todayGeneration", "dayGeneration", "todayEnergy", "energyToday"]));
}

function deviceSummary(devices) {
  const summary = { total: devices.length, online: 0, offline: 0, alert: 0, unknown: 0, types: {} };
  devices.forEach((device) => {
    const state = device.status || deviceConnectionState(device, {});
    if (state === "Online") summary.online += 1;
    else if (state === "Offline") summary.offline += 1;
    else if (state === "Alert") summary.alert += 1;
    else summary.unknown += 1;
    summary.types[device.deviceType || "UNKNOWN"] = (summary.types[device.deviceType || "UNKNOWN"] || 0) + 1;
  });
  return summary;
}

function stationStatus(station, devices, activeAlerts) {
  const summary = deviceSummary(devices);
  if (summary.total && summary.offline === summary.total) return "Non-operational";
  if (summary.offline > 0 || summary.alert > 0 || activeAlerts.length) return "Attention required";
  const raw = String(first(station, ["connectionStatus", "status", "state"]) || "").toLowerCase();
  if (["all_offline", "offline", "abnormal", "fault", "disconnected"].includes(raw)) return "Non-operational";
  if (["partial_offline"].includes(raw)) return "Attention required";
  if (summary.total && summary.online === summary.total) return "Operational";
  if (["normal", "online", "1"].includes(raw)) return "Operational";
  return "Unknown";
}

function stationDeviceItems(station) {
  return asArray(station.deviceListItems, station.deviceList, station.devices).map((item) => {
    const shell = normaliseDeviceShell(item);
    return { ...shell, status: deviceConnectionState(shell, {}) };
  }).filter((item) => item.deviceSn);
}

function stationMapId(account, station) {
  const id = stationId(station);
  const name = stationName(station);
  const mapped = account.systemMap?.[id] ?? account.systemMap?.[name];
  return typeof mapped === "string" ? mapped : String(mapped?.systemId || id);
}

async function getStationHistory(base, token, station, granularity = 2, daysBack = 0) {
  const timeZone = clean(station.regionTimezone) || "Africa/Johannesburg";
  const startDate = new Date(Date.now() - Math.max(0, daysBack) * 86400000);
  const startAt = dateAtZone(startDate, timeZone);
  const endAt = dateAtZone(new Date(Date.now() + 86400000), timeZone);
  return safeCall(base, "/station/history", {
    stationId: Number(stationId(station)) || stationId(station),
    granularity,
    startAt,
    ...(granularity === 1 ? {} : { endAt }),
  }, token);
}

async function getStationAlerts(base, token, station, days = 7) {
  const endTimestamp = Math.floor(Date.now() / 1000);
  const startTimestamp = endTimestamp - days * 86400;
  return safeCall(base, "/station/alertList", {
    stationId: Number(stationId(station)) || stationId(station),
    startTimestamp,
    endTimestamp,
    page: 1,
    size: 200,
  }, token);
}

async function listStationsWithDevices(base, token) {
  const stations = [];
  for (let page = 1; page <= 10; page += 1) {
    const result = await callDeye(base + "/station/listWithDevice", { page, size: 50 }, token);
    const batch = asArray(result.stationList, result.data?.stationList, result.data);
    stations.push(...batch);
    const total = numeric(result.stationTotal ?? result.total);
    if (!batch.length || batch.length < 50 || (total !== null && stations.length >= total)) break;
  }
  return stations;
}

async function buildStationPortfolio(account, base, token, station) {
  const id = stationId(station);
  const devices = stationDeviceItems(station);
  const [latestResult, historyResult, alertResult] = await Promise.all([
    safeCall(base, "/station/latest", { stationId: Number(id) || id }, token),
    getStationHistory(base, token, station, 2),
    getStationAlerts(base, token, station, 7),
  ]);
  const latest = latestResult.ok ? (latestResult.data.data || latestResult.data) : {};
  const rawAlerts = alertResult.ok ? asArray(alertResult.data.stationAlertItems, alertResult.data.alertList, alertResult.data.data?.stationAlertItems) : [];
  const alerts = rawAlerts.map((item) => normaliseAlert(item, "station"));
  const activeAlerts = alerts.filter((alert) => alert.active);
  const summary = deviceSummary(devices);
  const generationPower = first(latest, ["generationPower", "power", "currentPower", "pvPower"]) ?? first(station, ["generationPower", "power", "currentPower", "pvPower"]);
  const lastSync = first(latest, ["lastUpdateTime", "lastSync", "updateTime"]) ?? first(station, ["lastUpdateTime", "lastSync", "updateTime"]);
  return {
    systemId: stationMapId(account, station),
    name: stationName(station),
    provider: "Deye Cloud",
    providerAccount: String(account.label || "Deye Cloud"),
    providerStationId: id,
    stationTimezone: clean(station.regionTimezone) || "",
    locationAddress: clean(station.locationAddress) || "",
    installedCapacityKw: numeric(station.installedCapacity),
    status: stationStatus(station, devices, activeAlerts),
    powerKw: toKw(generationPower),
    energyTodayKwh: energyTodayFromHistory(historyResult, station),
    consumptionPowerKw: toKw(first(latest, ["consumptionPower"])),
    gridPowerKw: toKw(first(latest, ["gridPower"])),
    purchasePowerKw: toKw(first(latest, ["purchasePower"])),
    wirePowerKw: toKw(first(latest, ["wirePower"])),
    batterySoc: numeric(first(latest, ["batterySOC", "batterySoc", "soc"])),
    batteryPowerKw: toKw(first(latest, ["batteryPower"])),
    chargePowerKw: toKw(first(latest, ["chargePower"])),
    dischargePowerKw: toKw(first(latest, ["dischargePower"])),
    irradiance: numeric(first(latest, ["irradiateIntensity", "irradiance"])),
    availability: summary.total ? (summary.online / summary.total) * 100 : null,
    lastSync: lastSync ? String(lastSync) : "",
    deviceSummary: summary,
    devices,
    alerts,
    activeAlerts,
    apiCoverage: [latestResult, historyResult, alertResult].map((item) => ({ path: item.path, ok: item.ok, error: item.ok ? "" : item.error })),
  };
}

function stationDevicesFromResponse(response, stationIdValue) {
  if (!response?.ok) return [];
  const direct = asArray(response.data.deviceListItems, response.data.deviceList, response.data.devices, response.data.data?.deviceListItems, response.data.data?.deviceList);
  if (direct.length) return direct;
  const groups = asArray(response.data.stationList, response.data.data?.stationList, response.data.data);
  const group = groups.find((item) => String(first(item, ["stationId", "id"]) || "") === String(stationIdValue)) || groups[0];
  return group ? asArray(group.deviceListItems, group.deviceList, group.devices) : [];
}

async function latestForDevices(base, token, deviceSns, coverage) {
  const map = new Map();
  for (const group of batches(deviceSns, 10)) {
    const result = await safeCall(base, "/device/latest", { deviceList: group }, token);
    coverage.push({ path: result.path, ok: result.ok, error: result.ok ? "" : result.error, batch: group.length });
    if (!result.ok) continue;
    const list = asArray(result.data.deviceDataList, result.data.data?.deviceDataList, result.data.data);
    list.forEach((item) => map.set(clean(item.deviceSn), item));
  }
  return map;
}

function usefulHistoryMeasurePoints(points, metrics) {
  const all = [...new Set([...(points || []), ...(metrics || []).map((metric) => metric.key)].filter(Boolean))];
  const patterns = [
    /soc/i, /generation/i, /production/i, /pv.*power/i, /active.*power/i, /battery.*power/i,
    /charge.*power/i, /discharge.*power/i, /grid.*power/i, /load.*power/i, /total.*energy/i,
    /today.*energy/i, /day.*energy/i, /voltage/i, /current/i, /temperature/i, /frequency/i,
    /fault/i, /warning/i, /alarm/i, /insulation/i,
  ];
  const selected = all.filter((point) => patterns.some((pattern) => pattern.test(String(point))));
  return (selected.length ? selected : all).slice(0, 80);
}

async function buildDeviceDetail(base, token, device, latestMap, timeZone) {
  const shell = normaliseDeviceShell(device);
  const latest = latestMap.get(shell.deviceSn) || {};
  const metrics = asArray(latest.dataList, latest.data?.dataList).map(normaliseMetric).filter(Boolean);
  const coverage = [];
  const endTimestamp = Math.floor(Date.now() / 1000);
  const startTimestamp = endTimestamp - 7 * 86400;
  const primaryCalls = [
    safeCall(base, "/device/measurePoints", { deviceSn: shell.deviceSn, deviceType: shell.deviceType }, token),
    safeCall(base, "/device/alertList", { deviceSn: shell.deviceSn, startTimestamp, endTimestamp, page: 1, size: 100 }, token),
  ];
  if (CONFIG_SUPPORTED_TYPES.has(shell.deviceType)) {
    primaryCalls.push(
      safeCall(base, "/config/system", { deviceSn: shell.deviceSn }, token),
      safeCall(base, "/config/battery", { deviceSn: shell.deviceSn }, token),
      safeCall(base, "/config/tou", { deviceSn: shell.deviceSn }, token),
    );
  }
  const primaryResults = await Promise.all(primaryCalls);
  const measureResult = primaryResults[0];
  const alertResult = primaryResults[1];
  const configResults = primaryResults.slice(2);
  primaryResults.forEach((item) => coverage.push({ path: item.path, ok: item.ok, error: item.ok ? "" : item.error }));
  const measurePoints = measureResult.ok ? asArray(measureResult.data.measurePoints, measureResult.data.data?.measurePoints) : [];
  const alerts = alertResult.ok ? asArray(alertResult.data.alertList, alertResult.data.data?.alertList).map((item) => normaliseAlert(item, "device", shell.deviceSn)) : [];
  const historyPoints = usefulHistoryMeasurePoints(measurePoints, metrics);
  const today = dateAtZone(new Date(), timeZone);
  const historyResult = historyPoints.length ? await safeCall(base, "/device/history", {
    deviceSn: shell.deviceSn,
    granularity: 1,
    startAt: today,
    measurePoints: historyPoints,
  }, token) : { ok: false, path: "/device/history", error: "No history measure points were returned for this device." };
  coverage.push({ path: historyResult.path, ok: historyResult.ok, error: historyResult.ok ? "" : historyResult.error });
  let config = {};
  if (CONFIG_SUPPORTED_TYPES.has(shell.deviceType)) {
    const [systemResult, batteryResult, touResult] = configResults;
    config = {
      system: systemResult?.ok ? systemResult.data : null,
      battery: batteryResult?.ok ? batteryResult.data : null,
      tou: touResult?.ok ? touResult.data : null,
    };
  }
  const status = deviceConnectionState(shell, latest);
  return {
    ...shell,
    status,
    collectionTime: first(latest, ["collectionTime", "updateTime"]) ?? shell.collectionTime,
    deviceState: first(latest, ["deviceState"]) ?? shell.connectStatus,
    metrics,
    measurePoints,
    metricSummary: {
      batterySoc: metricNumber(metrics, ["SOC", "Battery SOC", "BMS SOC"]),
      pvPowerW: metricNumber(metrics, ["PV Power", "Total PV Power", "DC Power"]),
      loadPowerW: metricNumber(metrics, ["Load Power", "UPS Load Power", "Total Load Power"]),
      gridPowerW: metricNumber(metrics, ["Grid Power", "Total Grid Power"]),
      batteryPowerW: metricNumber(metrics, ["Battery Power", "Batt Power"]),
      chargePowerW: metricNumber(metrics, ["Charge Power", "Battery Charge Power"]),
      dischargePowerW: metricNumber(metrics, ["Discharge Power", "Battery Discharge Power"]),
    },
    alerts,
    activeAlerts: alerts.filter((alert) => alert.active),
    history: historyResult.ok ? asArray(historyResult.data.dataList, historyResult.data.data?.dataList) : [],
    config,
    apiCoverage: coverage,
  };
}

async function readStationDetail(account, base, token, requestedStationId) {
  const coverage = [];
  const stationListResult = await safeCall(base, "/station/listWithDevice", { page: 1, size: 50 }, token);
  coverage.push({ path: stationListResult.path, ok: stationListResult.ok, error: stationListResult.ok ? "" : stationListResult.error });
  const stationList = stationListResult.ok ? asArray(stationListResult.data.stationList, stationListResult.data.data?.stationList, stationListResult.data.data) : [];
  let station = stationList.find((item) => stationId(item) === String(requestedStationId));
  if (!station) station = { id: requestedStationId, name: String(requestedStationId) };
  const id = stationId(station) || String(requestedStationId);
  const [stationLatestResult, stationHistoryResult, stationPowerHistoryResult, stationAlertResult, stationDeviceResult] = await Promise.all([
    safeCall(base, "/station/latest", { stationId: Number(id) || id }, token),
    getStationHistory(base, token, station, 2, 6),
    safeCall(base, "/station/history/power", { stationId: Number(id) || id, startTimestamp: Math.floor(Date.now() / 1000) - 86400, endTimestamp: Math.floor(Date.now() / 1000) }, token),
    getStationAlerts(base, token, station, 30),
    safeCall(base, "/station/device", { page: 1, size: 200, stationIds: [Number(id) || id] }, token),
  ]);
  [stationLatestResult, stationHistoryResult, stationPowerHistoryResult, stationAlertResult, stationDeviceResult]
    .forEach((item) => coverage.push({ path: item.path, ok: item.ok, error: item.ok ? "" : item.error }));
  const deviceRaw = stationDevicesFromResponse(stationDeviceResult, id);
  const fallbackDevices = stationDeviceItems(station);
  const devices = (deviceRaw.length ? deviceRaw : fallbackDevices).map(normaliseDeviceShell).filter((item) => item.deviceSn);
  const latestMap = await latestForDevices(base, token, devices.map((device) => device.deviceSn), coverage);
  const timeZone = clean(station.regionTimezone) || "Africa/Johannesburg";
  const detailedDevices = [];
  const concurrency = 6;
  for (let index = 0; index < devices.length; index += concurrency) {
    const group = devices.slice(index, index + concurrency);
    const results = await Promise.all(group.map((device) => buildDeviceDetail(base, token, device, latestMap, timeZone)));
    detailedDevices.push(...results);
  }
  const latest = stationLatestResult.ok ? (stationLatestResult.data.data || stationLatestResult.data) : {};
  const stationAlerts = stationAlertResult.ok ? asArray(stationAlertResult.data.stationAlertItems, stationAlertResult.data.alertList, stationAlertResult.data.data?.stationAlertItems).map((item) => normaliseAlert(item, "station")) : [];
  const allActiveAlerts = [...stationAlerts.filter((alert) => alert.active), ...detailedDevices.flatMap((device) => device.activeAlerts)];
  const summary = deviceSummary(detailedDevices);
  const history = extractStationHistory(stationHistoryResult);
  const powerHistory = stationPowerHistoryResult.ok ? asArray(stationPowerHistoryResult.data.stationDataItems, stationPowerHistoryResult.data.data?.stationDataItems, stationPowerHistoryResult.data.data) : [];
  return {
    systemId: stationMapId(account, station),
    name: stationName(station),
    provider: "Deye Cloud",
    providerAccount: String(account.label || "Deye Cloud"),
    providerStationId: id,
    stationTimezone: timeZone,
    locationAddress: clean(station.locationAddress) || "",
    installedCapacityKw: numeric(station.installedCapacity),
    status: stationStatus(station, detailedDevices, allActiveAlerts),
    powerKw: toKw(first(latest, ["generationPower"])),
    energyTodayKwh: energyTodayFromHistory(stationHistoryResult, station),
    consumptionPowerKw: toKw(first(latest, ["consumptionPower"])),
    gridPowerKw: toKw(first(latest, ["gridPower"])),
    purchasePowerKw: toKw(first(latest, ["purchasePower"])),
    wirePowerKw: toKw(first(latest, ["wirePower"])),
    batterySoc: numeric(first(latest, ["batterySOC"])),
    batteryPowerKw: toKw(first(latest, ["batteryPower"])),
    chargePowerKw: toKw(first(latest, ["chargePower"])),
    dischargePowerKw: toKw(first(latest, ["dischargePower"])),
    irradiance: numeric(first(latest, ["irradiateIntensity"])),
    lastSync: String(first(latest, ["lastUpdateTime"]) || ""),
    availability: summary.total ? (summary.online / summary.total) * 100 : null,
    deviceSummary: summary,
    devices: detailedDevices,
    alerts: [...stationAlerts, ...detailedDevices.flatMap((device) => device.alerts)],
    activeAlerts: allActiveAlerts,
    history,
    powerHistory,
    apiCoverage: [...coverage, ...detailedDevices.flatMap((device) => device.apiCoverage.map((entry) => ({ ...entry, deviceSn: device.deviceSn })))],
  };
}

async function authenticate(account) {
  if (!account.appId || !account.appSecret || !account.email) throw new Error("Deye Cloud account settings are incomplete.");
  const base = String(account.baseUrl || DEYE_BASE_URL).replace(/\/+$/, "");
  const auth = { appSecret: account.appSecret, email: account.email, password: passwordFor(account) };
  if (account.companyId !== undefined && account.companyId !== null && account.companyId !== "") auth.companyId = account.companyId;
  try {
    const tokenResult = await callDeye(base + "/account/token?appId=" + encodeURIComponent(account.appId), auth);
    const token = tokenResult.accessToken || tokenResult.data?.accessToken;
    if (!token) throw new Error("Deye Cloud did not return an access token.");
    return { base, token };
  } catch (error) {
    if (String(error.message || "").toLowerCase().includes("appid")) {
      throw new Error("Deye Cloud rejected App ID ending " + account.appId.slice(-4) + " (length " + account.appId.length + ") at " + base + ": " + error.message);
    }
    throw error;
  }
}

async function readAccount(account, requestedStationId) {
  const { base, token } = await authenticate(account);
  if (requestedStationId) {
    const detail = await readStationDetail(account, base, token, requestedStationId);
    return { label: String(account.label || "Deye Cloud"), detail, systems: [detail] };
  }
  const stations = await listStationsWithDevices(base, token);
  const systems = [];
  const concurrency = 5;
  for (let index = 0; index < stations.length; index += concurrency) {
    const group = stations.slice(index, index + concurrency);
    const results = await Promise.all(group.filter((station) => stationId(station)).map((station) => buildStationPortfolio(account, base, token, station)));
    systems.push(...results);
  }
  return { label: String(account.label || "Deye Cloud"), systems };
}

module.exports = async function monitoring(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed." });
  try {
    const accounts = configuredAccounts();
    if (!accounts.length) {
      return res.status(200).json({ configured: false, provider: "Deye Cloud", systems: [], message: "Deye Cloud is ready for secure connection. Add the account settings in Vercel to bring in all stations." });
    }
    const requestedStationId = clean(req.query?.stationId);
    const results = await Promise.allSettled(accounts.map((account) => readAccount(account, requestedStationId)));
    const connected = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
    if (!connected.length) throw results.find((result) => result.status === "rejected")?.reason || new Error("Deye Cloud could not be reached.");
    const failed = results.length - connected.length;
    if (requestedStationId) {
      const detail = connected.map((account) => account.detail).find((item) => String(item?.providerStationId) === requestedStationId) || connected[0]?.detail;
      if (!detail) return res.status(404).json({ message: "Deye Cloud station was not found." });
      return res.status(200).json({ configured: true, provider: "Deye Cloud", fetchedAt: new Date().toISOString(), detail, message: "Detailed station, device, alarm, configuration and history data loaded from Deye Cloud." });
    }
    return res.status(200).json({
      configured: true,
      provider: "Deye Cloud",
      fetchedAt: new Date().toISOString(),
      accounts: connected.map((account) => ({ label: account.label, systems: account.systems.length })),
      systems: connected.flatMap((account) => account.systems),
      message: String(connected.length) + " Deye Cloud account" + (connected.length === 1 ? "" : "s") + " connected" + (failed ? "; " + String(failed) + " could not be reached" : "") + ".",
    });
  } catch (error) {
    return res.status(502).json({ message: error.message || "Deye Cloud could not be reached." });
  }
};
