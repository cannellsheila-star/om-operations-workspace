const DEFAULT_BASE_URL = "https://sg5.fusionsolar.huawei.com/thirdData";

const clean = (value) => String(value ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const asArray = (...values) => values.find(Array.isArray) || [];

function config() {
  const username = clean(process.env.FUSIONSOLAR_USERNAME);
  const systemCode = String(process.env.FUSIONSOLAR_SYSTEM_CODE ?? "");
  const configuredBase = clean(process.env.FUSIONSOLAR_BASE_URL) || DEFAULT_BASE_URL;
  const baseUrl = configuredBase.replace(/\/+$/, "").endsWith("/thirdData")
    ? configuredBase.replace(/\/+$/, "")
    : configuredBase.replace(/\/+$/, "") + "/thirdData";
  return { username, systemCode, baseUrl };
}

function validate(payload, path) {
  if (!payload || payload.success !== true || Number(payload.failCode || 0) !== 0) {
    const code = payload?.failCode ?? "unknown";
    const message = String(payload?.message || `FusionSolar request failed at ${path}.`);
    const error = new Error(`${message} (FusionSolar code ${code})`);
    error.failCode = code;
    throw error;
  }
  return payload;
}

function responseCookies(headers) {
  const raw = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [headers.get("set-cookie")].filter(Boolean);
  return raw.map((item) => String(item).split(";")[0]).filter(Boolean).join("; ");
}

function cookieValue(cookieHeader, name) {
  const match = String(cookieHeader || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`, "i"));
  return match ? decodeURIComponent(match[1]) : "";
}

async function post(url, body, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json, */*", ...headers },
      body: JSON.stringify(body || {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`FusionSolar HTTP ${response.status} at ${url}.`);
    return { response, payload };
  } finally {
    clearTimeout(timer);
  }
}

async function login(settings) {
  const result = await post(settings.baseUrl + "/login", {
    userName: settings.username,
    systemCode: settings.systemCode,
  });
  validate(result.payload, "/login");
  const cookie = responseCookies(result.response.headers);
  const token = clean(result.response.headers.get("xsrf-token"))
    || clean(result.response.headers.get("x-xsrf-token"))
    || cookieValue(cookie, "XSRF-TOKEN");
  if (!token) throw new Error("FusionSolar login succeeded but no XSRF token was returned.");
  return { baseUrl: settings.baseUrl, token, cookie };
}

async function call(session, path, body = {}) {
  const result = await post(session.baseUrl + path, body, {
    "XSRF-TOKEN": session.token,
    ...(session.cookie ? { Cookie: session.cookie } : {}),
  });
  return validate(result.payload, path);
}

async function safeCall(session, path, body = {}) {
  try {
    return { ok: true, path, data: await call(session, path, body) };
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
  return numeric(plant?.capacity ?? plant?.installedCapacity ?? plant?.installed_capacity);
}

async function plantList(session) {
  const firstPage = await safeCall(session, "/stations", { pageNo: 1 });
  if (firstPage.ok) {
    const firstData = firstPage.data.data || {};
    const plants = [...asArray(firstData.list, firstData.stationList, firstData)];
    const pageCount = Math.max(1, Number(firstData.pageCount || 1));
    for (let pageNo = 2; pageNo <= Math.min(pageCount, 100); pageNo += 1) {
      const page = await call(session, "/stations", { pageNo });
      const data = page.data || {};
      plants.push(...asArray(data.list, data.stationList, data));
    }
    return { plants, endpoint: "/stations" };
  }

  const legacy = await call(session, "/getStationList", {});
  return { plants: asArray(legacy.data, legacy.data?.list), endpoint: "/getStationList", fallbackReason: firstPage.error };
}

function commonStationMetrics(payload, code) {
  const row = asArray(payload?.data).find((item) => clean(item.stationCode || item.plantCode) === clean(code)) || asArray(payload?.data)[0] || {};
  const values = row.dataItemMap || row.data || {};
  const health = String(values.real_health_state ?? "");
  return {
    raw: values,
    powerKw: numeric(values.active_power),
    energyTodayKwh: numeric(values.day_power),
    energyMonthKwh: numeric(values.month_power),
    energyTotalKwh: numeric(values.total_power),
    status: health === "3" ? "Operational" : health === "2" ? "Attention required" : health === "1" ? "Non-operational" : "Unknown",
  };
}

function normalisePlant(plant, realPayload) {
  const code = plantCode(plant);
  const live = commonStationMetrics(realPayload, code);
  return {
    systemId: `huawei:${code}`,
    provider: "FusionSolar",
    providerStationId: code,
    name: plantName(plant),
    installedCapacityKw: plantCapacity(plant),
    locationAddress: clean(plant.plantAddress || plant.stationAddr || plant.address),
    status: live.status,
    powerKw: live.powerKw,
    energyTodayKwh: live.energyTodayKwh,
    energyMonthKwh: live.energyMonthKwh,
    energyTotalKwh: live.energyTotalKwh,
    rawPlant: plant,
    rawRealtime: live.raw,
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

function groupDevices(devices) {
  const groups = new Map();
  devices.forEach((device) => {
    if (!device.typeId || !device.id) return;
    if (!groups.has(device.typeId)) groups.set(device.typeId, []);
    groups.get(device.typeId).push(device);
  });
  return groups;
}

async function realtimeDevices(session, devices) {
  const output = [];
  for (const [typeId, group] of groupDevices(devices)) {
    for (let offset = 0; offset < group.length; offset += 100) {
      const batch = group.slice(offset, offset + 100);
      const ids = batch.map((item) => item.id).join(",");
      const result = await safeCall(session, "/getDevRealKpi", { devIds: ids, devTypeId: Number(typeId) });
      output.push({
        typeId: Number(typeId),
        deviceIds: batch.map((item) => item.id),
        ok: result.ok,
        error: result.ok ? "" : result.error,
        data: result.ok ? asArray(result.data.data) : [],
      });
    }
  }
  return output;
}

async function stationDetail(session, code, collectTime) {
  const [real, deviceListResult, alarms] = await Promise.all([
    safeCall(session, "/getStationRealKpi", { stationCodes: code }),
    safeCall(session, "/getDevList", { stationCodes: code }),
    safeCall(session, "/getAlarmList", { stationCodes: code }),
  ]);
  const devices = deviceListResult.ok ? asArray(deviceListResult.data.data).map(deviceShell) : [];
  const deviceRealtime = devices.length ? await realtimeDevices(session, devices) : [];
  const history = {};
  if (collectTime) {
    const time = Number(collectTime);
    const [hour, day] = await Promise.all([
      safeCall(session, "/getKpiStationHour", { stationCodes: code, collectTime: time }),
      safeCall(session, "/getKpiStationDay", { stationCodes: code, collectTime: time }),
    ]);
    history.hour = hour.ok ? hour.data.data : [];
    history.day = day.ok ? day.data.data : [];
    history.coverage = [hour, day].map((item) => ({ path: item.path, ok: item.ok, error: item.ok ? "" : item.error }));
  }
  return {
    provider: "FusionSolar",
    providerStationId: code,
    realtime: real.ok ? commonStationMetrics(real.data, code) : null,
    devices,
    deviceRealtime,
    alarms: alarms.ok ? asArray(alarms.data.data) : [],
    history,
    apiCoverage: [real, deviceListResult, alarms].map((item) => ({ path: item.path, ok: item.ok, error: item.ok ? "" : item.error })),
  };
}

module.exports = async function fusionsolar(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed." });

  const settings = config();
  if (!settings.username || !settings.systemCode) {
    return res.status(200).json({
      configured: false,
      provider: "FusionSolar",
      systems: [],
      message: "FusionSolar connector is ready. Add the Northbound API username and system code in Vercel.",
      requiredEnvironmentVariables: ["FUSIONSOLAR_USERNAME", "FUSIONSOLAR_SYSTEM_CODE"],
    });
  }

  try {
    const session = await login(settings);
    const requestedCode = clean(req.query?.stationCode);
    const collectTime = clean(req.query?.collectTime);

    if (requestedCode) {
      const detail = await stationDetail(session, requestedCode, collectTime || null);
      return res.status(200).json({
        configured: true,
        provider: "FusionSolar",
        fetchedAt: new Date().toISOString(),
        detail,
        message: "FusionSolar station, device, alarm and available history data loaded.",
      });
    }

    const { plants, endpoint, fallbackReason } = await plantList(session);
    const codes = plants.map(plantCode).filter(Boolean);
    const real = codes.length
      ? await safeCall(session, "/getStationRealKpi", { stationCodes: codes.slice(0, 100).join(",") })
      : { ok: true, data: { data: [] } };
    const systems = plants.map((plant) => normalisePlant(plant, real.ok ? real.data : {}));

    return res.status(200).json({
      configured: true,
      provider: "FusionSolar",
      fetchedAt: new Date().toISOString(),
      systems,
      plantListEndpoint: endpoint,
      fallbackReason: fallbackReason || "",
      apiCoverage: [{ path: endpoint, ok: true }, { path: "/getStationRealKpi", ok: real.ok, error: real.ok ? "" : real.error }],
      message: `${systems.length} FusionSolar plant${systems.length === 1 ? "" : "s"} loaded.`,
    });
  } catch (error) {
    return res.status(502).json({ message: error.message || "FusionSolar could not be reached.", provider: "FusionSolar" });
  }
};
