const https = require("https");

const HOST = "sg5.fusionsolar.huawei.com";
const BASE_PATH = "/thirdData";
const VERSION = "fusionsolar-site-v2-20260915";

const clean = (value) => String(value ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
const numberOrNull = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const asArray = (...values) => values.find(Array.isArray) || [];

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
        try { json = text ? JSON.parse(text) : {}; } catch {
          const error = new Error(`FusionSolar returned non-JSON data at ${path} (HTTP ${response.statusCode || 0}).`);
          error.httpStatus = response.statusCode || 0;
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

function headerValue(headers, name) {
  const value = headers?.[String(name).toLowerCase()];
  return Array.isArray(value) ? (value[0] || "") : clean(value);
}

function cookieHeader(headers) {
  const raw = headers?.["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.map((item) => String(item).split(";")[0]).join("; ");
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
  const token = headerValue(result.headers, "xsrf-token")
    || headerValue(result.headers, "x-xsrf-token")
    || cookieValue(cookie, "XSRF-TOKEN");
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

async function safeCall(session, path, body = {}) {
  try {
    return { ok: true, path, payload: await call(session, path, body) };
  } catch (error) {
    return { ok: false, path, error: String(error.message || error), failCode: error.failCode ?? null };
  }
}

function plantCode(plant) {
  return clean(plant?.plantCode || plant?.stationCode || plant?.code);
}

function plantName(plant) {
  return clean(plant?.plantName || plant?.stationName || plant?.name) || plantCode(plant);
}

function plantCapacity(plant) {
  return numberOrNull(plant?.capacity ?? plant?.installedCapacity ?? plant?.installed_capacity);
}

async function getPlantList(session) {
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
    return { plants, endpoint: "/stations" };
  }
  const legacy = await call(session, "/getStationList", {});
  return { plants: asArray(legacy.data, legacy.data?.list), endpoint: "/getStationList", fallbackReason: modern.error };
}

function metricMap(row) {
  return row?.dataItemMap || row?.data || row?.kpi || {};
}

function stationRow(payload, code) {
  const rows = asArray(payload?.data, payload?.data?.list);
  return rows.find((item) => clean(item.stationCode || item.plantCode) === clean(code)) || null;
}

function metricValue(values, keys) {
  for (const key of keys) {
    const value = numberOrNull(values?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function normaliseStationMetrics(payload, code) {
  const row = stationRow(payload, code) || {};
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

function flattenDeviceRealtime(payloads) {
  const rows = [];
  payloads.forEach((batch) => {
    if (!batch.ok) return;
    asArray(batch.payload?.data, batch.payload?.data?.list).forEach((row) => rows.push(row));
  });
  return rows;
}

function deviceMetricMaps(rows) {
  return rows.map((row) => ({ row, values: metricMap(row) }));
}

function batterySummary(rows) {
  const maps = deviceMetricMaps(rows);
  const socs = [];
  let chargeKw = 0;
  let dischargeKw = 0;
  maps.forEach(({ values }) => {
    const soc = metricValue(values, ["battery_soc", "soc", "battery_state_of_capacity", "battery_capacity"]);
    if (soc !== null && soc >= 0 && soc <= 100) socs.push(soc);
    const charge = metricValue(values, ["charge_power", "battery_charge_power"]);
    const discharge = metricValue(values, ["discharge_power", "battery_discharge_power"]);
    if (charge !== null && charge > 0) chargeKw += charge;
    if (discharge !== null && discharge > 0) dischargeKw += discharge;
  });
  return {
    batterySoc: socs.length ? socs.reduce((sum, value) => sum + value, 0) / socs.length : null,
    chargePowerKw: chargeKw || null,
    dischargePowerKw: dischargeKw || null,
  };
}

async function getDeviceRealtime(session, devices) {
  const groups = new Map();
  devices.forEach((device) => {
    if (!device.id || !device.typeId) return;
    if (!groups.has(device.typeId)) groups.set(device.typeId, []);
    groups.get(device.typeId).push(device);
  });
  const batches = [];
  for (const [typeId, group] of groups) {
    for (let index = 0; index < group.length; index += 100) {
      const batch = group.slice(index, index + 100);
      batches.push(await safeCall(session, "/getDevRealKpi", {
        devIds: batch.map((item) => item.id).join(","),
        devTypeId: Number(typeId),
      }));
    }
  }
  return { batches, rows: flattenDeviceRealtime(batches) };
}

function alarmRows(payload) {
  return asArray(payload?.data, payload?.data?.list);
}

function sum(values) {
  const nums = values.filter((value) => numberOrNull(value) !== null).map(Number);
  return nums.length ? nums.reduce((total, value) => total + value, 0) : null;
}

function worstStatus(statuses) {
  if (statuses.includes("Non-operational")) return "Non-operational";
  if (statuses.includes("Attention required")) return "Attention required";
  if (statuses.includes("Operational")) return "Operational";
  return "Unknown";
}

async function portfolio(session) {
  const { plants, endpoint, fallbackReason } = await getPlantList(session);
  const codes = plants.map(plantCode).filter(Boolean);
  const real = codes.length
    ? await safeCall(session, "/getStationRealKpi", { stationCodes: codes.slice(0, 100).join(",") })
    : { ok: true, payload: { data: [] }, path: "/getStationRealKpi" };
  const systems = plants.map((plant) => {
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
  return {
    systems,
    endpoint,
    fallbackReason: fallbackReason || "",
    apiCoverage: [
      { path: endpoint, ok: true },
      { path: "/getStationRealKpi", ok: real.ok, error: real.ok ? "" : real.error },
    ],
  };
}

async function groupedDetail(session, requestedCodes, collectTime) {
  const { plants } = await getPlantList(session);
  const codeSet = new Set(requestedCodes.map(clean).filter(Boolean));
  const selectedPlants = plants.filter((plant) => codeSet.has(plantCode(plant)));
  const codes = selectedPlants.map(plantCode);
  if (!codes.length) throw new Error("None of the requested FusionSolar plants were found in the Northbound account.");
  const stationCodes = codes.join(",");

  const [real, devList, alarms] = await Promise.all([
    safeCall(session, "/getStationRealKpi", { stationCodes }),
    safeCall(session, "/getDevList", { stationCodes }),
    safeCall(session, "/getAlarmList", { stationCodes }),
  ]);

  const devices = devList.ok ? asArray(devList.payload?.data, devList.payload?.data?.list).map(deviceShell) : [];
  const realtimeDevices = devices.length ? await getDeviceRealtime(session, devices) : { batches: [], rows: [] };
  const bess = batterySummary(realtimeDevices.rows);
  const stationMetrics = selectedPlants.map((plant) => {
    const code = plantCode(plant);
    const metrics = normaliseStationMetrics(real.ok ? real.payload : {}, code);
    return {
      providerStationId: code,
      name: plantName(plant),
      installedCapacityKw: plantCapacity(plant),
      locationAddress: clean(plant.plantAddress || plant.stationAddr || plant.address),
      ...metrics,
    };
  });

  const history = { hour: [], day: [], coverage: [] };
  if (collectTime) {
    for (const code of codes) {
      const [hour, day] = await Promise.all([
        safeCall(session, "/getKpiStationHour", { stationCodes: code, collectTime: Number(collectTime) }),
        safeCall(session, "/getKpiStationDay", { stationCodes: code, collectTime: Number(collectTime) }),
      ]);
      history.hour.push({ stationCode: code, rows: hour.ok ? asArray(hour.payload?.data) : [] });
      history.day.push({ stationCode: code, rows: day.ok ? asArray(day.payload?.data) : [] });
      history.coverage.push({ path: "/getKpiStationHour", stationCode: code, ok: hour.ok, error: hour.ok ? "" : hour.error });
      history.coverage.push({ path: "/getKpiStationDay", stationCode: code, ok: day.ok, error: day.ok ? "" : day.error });
    }
  }

  const activeAlarms = alarms.ok ? alarmRows(alarms.payload) : [];
  const aggregate = {
    powerKw: sum(stationMetrics.map((item) => item.powerKw)),
    energyTodayKwh: sum(stationMetrics.map((item) => item.energyTodayKwh)),
    energyMonthKwh: sum(stationMetrics.map((item) => item.energyMonthKwh)),
    energyTotalKwh: sum(stationMetrics.map((item) => item.energyTotalKwh)),
    installedCapacityKw: sum(stationMetrics.map((item) => item.installedCapacityKw)),
    status: worstStatus(stationMetrics.map((item) => item.status)),
    batterySoc: bess.batterySoc,
    chargePowerKw: bess.chargePowerKw,
    dischargePowerKw: bess.dischargePowerKw,
    deviceCount: devices.length,
    alarmCount: activeAlarms.length,
  };

  return {
    provider: "FusionSolar",
    providerStationIds: codes,
    plants: stationMetrics,
    aggregate,
    devices,
    deviceRealtime: realtimeDevices.rows,
    alarms: activeAlarms,
    history,
    apiCoverage: [
      { path: "/getStationRealKpi", ok: real.ok, error: real.ok ? "" : real.error },
      { path: "/getDevList", ok: devList.ok, error: devList.ok ? "" : devList.error },
      { path: "/getAlarmList", ok: alarms.ok, error: alarms.ok ? "" : alarms.error },
      ...realtimeDevices.batches.map((item) => ({ path: item.path, ok: item.ok, error: item.ok ? "" : item.error })),
      ...history.coverage,
    ],
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("X-FusionSolar-Connector", VERSION);
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed.", connectorVersion: VERSION });

  try {
    const session = await login();
    if (!session) {
      return res.status(200).json({
        configured: false,
        connected: false,
        provider: "FusionSolar",
        connectorVersion: VERSION,
        systems: [],
        message: "FusionSolar Northbound credentials are not configured.",
      });
    }

    const requested = clean(req.query?.stationCodes || req.query?.stationCode);
    if (requested) {
      const codes = requested.split(",").map(clean).filter(Boolean);
      const detail = await groupedDetail(session, codes, clean(req.query?.collectTime) || null);
      return res.status(200).json({
        configured: true,
        connected: true,
        provider: "FusionSolar",
        connectorVersion: VERSION,
        region: process.env.VERCEL_REGION || null,
        fetchedAt: new Date().toISOString(),
        detail,
        message: `${detail.plants.length} FusionSolar plant${detail.plants.length === 1 ? "" : "s"} loaded for this workspace site.`,
      });
    }

    const data = await portfolio(session);
    return res.status(200).json({
      configured: true,
      connected: true,
      provider: "FusionSolar",
      connectorVersion: VERSION,
      region: process.env.VERCEL_REGION || null,
      fetchedAt: new Date().toISOString(),
      ...data,
      message: `${data.systems.length} FusionSolar plant${data.systems.length === 1 ? "" : "s"} loaded.`,
    });
  } catch (error) {
    return res.status(502).json({
      configured: true,
      connected: false,
      provider: "FusionSolar",
      connectorVersion: VERSION,
      region: process.env.VERCEL_REGION || null,
      failCode: error?.failCode ?? null,
      message: String(error.message || "FusionSolar could not be reached."),
    });
  }
};
