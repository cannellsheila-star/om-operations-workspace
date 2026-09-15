const https = require("https");

const HOST = "sg5.fusionsolar.huawei.com";
const BASE_PATH = "/thirdData";
const CONNECTOR_VERSION = "sg5-direct-v4-20260915";

const clean = (value) => String(value ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
const asArray = (...values) => values.find(Array.isArray) || [];

function candidateIps() {
  const configured = clean(process.env.FUSIONSOLAR_SG5_IPS)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([...configured, "43.128.81.107", "119.8.160.213"])];
}

function requestJsonByIp(ip, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {});
    const req = https.request({
      host: ip,
      port: 443,
      servername: HOST,
      method: "POST",
      path: BASE_PATH + path,
      rejectUnauthorized: true,
      timeout: 20000,
      headers: {
        Host: HOST,
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
          const error = new Error(`Non-JSON response from SG5 via ${ip} (HTTP ${response.statusCode || 0}): ${text.slice(0, 220)}`);
          error.code = "ENONJSON";
          reject(error);
          return;
        }

        const status = Number(response.statusCode || 0);
        if (status < 200 || status >= 300) {
          const message = json?.message || json?.msg || text.slice(0, 220) || `HTTP ${status}`;
          const error = new Error(`FusionSolar HTTP ${status} via ${ip}: ${message}`);
          error.code = `HTTP_${status}`;
          reject(error);
          return;
        }

        resolve({ json, headers: response.headers || {}, raw: text, ip });
      });
    });

    req.on("timeout", () => {
      const error = new Error(`FusionSolar HTTPS request to ${ip} timed out after 20 seconds.`);
      error.code = "ETIMEDOUT";
      req.destroy(error);
    });

    req.on("error", (error) => reject(error));
    req.write(payload);
    req.end();
  });
}

async function requestJson(path, body, headers = {}) {
  const failures = [];
  for (const ip of candidateIps()) {
    try {
      return await requestJsonByIp(ip, path, body, headers);
    } catch (error) {
      failures.push(`${ip}: ${error.code || error.name || "ERR"} ${error.message || error}`);
    }
  }
  const error = new Error(`[${CONNECTOR_VERSION}] Direct SG5 transport failed. ${failures.join(" | ")}`);
  error.code = "EALLSG5HOSTSFAILED";
  throw error;
}

function validate(result, path) {
  const payload = result?.json || {};
  if (payload.success !== true || Number(payload.failCode || 0) !== 0) {
    const code = payload.failCode ?? "unknown";
    const message = payload.message || `FusionSolar request failed at ${path}`;
    const error = new Error(`[${CONNECTOR_VERSION}] ${message} (FusionSolar code ${code})`);
    error.failCode = code;
    throw error;
  }
  return payload;
}

function headerValue(headers, name) {
  const value = headers?.[String(name).toLowerCase()];
  if (Array.isArray(value)) return value[0] || "";
  return clean(value);
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

async function login(username, systemCode) {
  const result = await requestJson("/login", { userName: username, systemCode });
  validate(result, "/login");

  const cookie = cookieHeader(result.headers);
  const token = headerValue(result.headers, "xsrf-token")
    || headerValue(result.headers, "x-xsrf-token")
    || cookieValue(cookie, "XSRF-TOKEN");

  if (!token) throw new Error(`[${CONNECTOR_VERSION}] FusionSolar login succeeded but Huawei returned no XSRF-TOKEN.`);
  return { token, cookie, ip: result.ip };
}

async function call(session, path, body = {}) {
  const result = await requestJson(path, body, {
    "XSRF-TOKEN": session.token,
    ...(session.cookie ? { Cookie: session.cookie } : {}),
  });
  return validate(result, path);
}

async function getPlants(session) {
  try {
    const payload = await call(session, "/stations", { pageNo: 1 });
    const data = payload.data || {};
    const list = asArray(data.list, data.stationList, data);
    return { endpoint: "/stations", plants: list };
  } catch (newApiError) {
    const payload = await call(session, "/getStationList", {});
    return {
      endpoint: "/getStationList",
      plants: asArray(payload.data, payload.data?.list),
      fallbackReason: newApiError.message,
    };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("X-FusionSolar-Connector", CONNECTOR_VERSION);
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed.", connectorVersion: CONNECTOR_VERSION });

  const username = clean(process.env.FUSIONSOLAR_USERNAME);
  const systemCode = clean(process.env.FUSIONSOLAR_SYSTEM_CODE);

  if (!username || !systemCode) {
    return res.status(200).json({
      configured: false,
      connected: false,
      provider: "FusionSolar",
      connectorVersion: CONNECTOR_VERSION,
      systems: [],
      message: `[${CONNECTOR_VERSION}] FusionSolar Northbound credentials are not present in this deployment.`,
    });
  }

  try {
    const session = await login(username, systemCode);
    const result = await getPlants(session);
    const systems = result.plants.map((plant) => ({
      provider: "FusionSolar",
      providerStationId: clean(plant.plantCode || plant.stationCode || plant.code),
      name: clean(plant.plantName || plant.stationName || plant.name) || clean(plant.plantCode || plant.stationCode || plant.code),
      installedCapacityKw: Number.isFinite(Number(plant.capacity ?? plant.installedCapacity)) ? Number(plant.capacity ?? plant.installedCapacity) : null,
      rawPlant: plant,
    }));

    return res.status(200).json({
      configured: true,
      connected: true,
      provider: "FusionSolar",
      connectorVersion: CONNECTOR_VERSION,
      transport: "direct-ip-with-sg5-sni",
      loginIp: session.ip,
      server: HOST,
      fetchedAt: new Date().toISOString(),
      systems,
      plantListEndpoint: result.endpoint,
      fallbackReason: result.fallbackReason || "",
      message: `[${CONNECTOR_VERSION}] ${systems.length} FusionSolar plant${systems.length === 1 ? "" : "s"} returned from SG5.`,
    });
  } catch (error) {
    const rejected = Number(error?.failCode) === 20400;
    const safeCredentialMeta = `Northbound username sent: ${username}; systemCode length: ${systemCode.length}.`;
    const message = rejected
      ? `[${CONNECTOR_VERSION}] Huawei rejected the Northbound username/password (FusionSolar code 20400). ${safeCredentialMeta}`
      : String(error.message || `[${CONNECTOR_VERSION}] FusionSolar could not be reached.`);

    return res.status(502).json({
      configured: true,
      connected: false,
      provider: "FusionSolar",
      connectorVersion: CONNECTOR_VERSION,
      transport: "direct-ip-with-sg5-sni",
      server: HOST,
      failCode: error?.failCode ?? null,
      message,
    });
  }
};
