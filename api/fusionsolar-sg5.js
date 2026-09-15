const https = require("https");

const BASE_URL = "https://sg5.fusionsolar.huawei.com/thirdData";

const clean = (value) => String(value ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
const asArray = (...values) => values.find(Array.isArray) || [];

function requestJson(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(BASE_URL + path);
    const payload = JSON.stringify(body || {});

    const req = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 443,
      path: target.pathname + target.search,
      method: "POST",
      family: 4,
      servername: target.hostname,
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
        try { json = text ? JSON.parse(text) : {}; } catch {}

        const status = Number(response.statusCode || 0);
        if (status < 200 || status >= 300) {
          return reject(new Error(`FusionSolar HTTP ${status}${text ? `: ${text.slice(0, 300)}` : ""}`));
        }

        resolve({
          json,
          headers: response.headers,
          raw: text,
        });
      });
    });

    req.on("timeout", () => {
      const error = new Error("FusionSolar HTTPS request timed out after 20 seconds.");
      error.code = "ETIMEDOUT";
      req.destroy(error);
    });

    req.on("error", (error) => {
      const parts = [error.code, error.errno, error.syscall, error.hostname].filter(Boolean);
      const detail = parts.length ? ` (${parts.join(" · ")})` : "";
      reject(new Error(`FusionSolar network error${detail}: ${error.message || error}`));
    });

    req.write(payload);
    req.end();
  });
}

function validate(result, path) {
  const payload = result?.json || {};
  if (payload.success !== true || Number(payload.failCode || 0) !== 0) {
    const code = payload.failCode ?? "unknown";
    const message = payload.message || `FusionSolar request failed at ${path}`;
    const error = new Error(`${message} (FusionSolar code ${code})`);
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

  if (!token) throw new Error("FusionSolar login succeeded but Huawei returned no XSRF-TOKEN.");
  return { token, cookie };
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
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed." });

  const username = clean(process.env.FUSIONSOLAR_USERNAME);
  const systemCode = String(process.env.FUSIONSOLAR_SYSTEM_CODE ?? "");

  if (!username || !systemCode) {
    return res.status(200).json({
      configured: false,
      provider: "FusionSolar",
      systems: [],
      message: "FusionSolar Northbound credentials are not present in this deployment.",
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
      server: "sg5.fusionsolar.huawei.com",
      fetchedAt: new Date().toISOString(),
      systems,
      plantListEndpoint: result.endpoint,
      fallbackReason: result.fallbackReason || "",
      message: `${systems.length} FusionSolar plant${systems.length === 1 ? "" : "s"} returned from SG5.`,
    });
  } catch (error) {
    return res.status(502).json({
      configured: true,
      connected: false,
      provider: "FusionSolar",
      server: "sg5.fusionsolar.huawei.com",
      message: error.message || "FusionSolar could not be reached.",
    });
  }
};
