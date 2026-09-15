const https = require("https");

const HOST = "sg5.fusionsolar.huawei.com";
const BASE_PATH = "/thirdData";
const CONNECTOR_VERSION = "sg5-doh-v6-20260915";

const clean = (value) => String(value ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
const asArray = (...values) => values.find(Array.isArray) || [];

function httpsJsonByIp({ ip, servername, hostHeader, path, method = "GET", body = null, headers = {}, timeout = 15000 }) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? "" : JSON.stringify(body);
    const req = https.request({
      host: ip,
      port: 443,
      servername,
      method,
      path,
      rejectUnauthorized: true,
      timeout,
      headers: {
        Host: hostHeader,
        Accept: "application/json, */*",
        ...(payload ? {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        } : {}),
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
          const error = new Error(`Non-JSON response from ${hostHeader} via ${ip} (HTTP ${response.statusCode || 0}): ${text.slice(0, 220)}`);
          error.code = "ENONJSON";
          reject(error);
          return;
        }

        const status = Number(response.statusCode || 0);
        if (status < 200 || status >= 300) {
          const message = json?.message || json?.msg || text.slice(0, 220) || `HTTP ${status}`;
          const error = new Error(`HTTP ${status} from ${hostHeader} via ${ip}: ${message}`);
          error.code = `HTTP_${status}`;
          reject(error);
          return;
        }

        resolve({ json, headers: response.headers || {}, raw: text, ip, status });
      });
    });

    req.on("timeout", () => {
      const error = new Error(`HTTPS request to ${hostHeader} via ${ip} timed out after ${timeout} ms.`);
      error.code = "ETIMEDOUT";
      req.destroy(error);
    });
    req.on("error", (error) => reject(error));
    if (payload) req.write(payload);
    req.end();
  });
}

async function queryGoogleDns(name) {
  return httpsJsonByIp({
    ip: "8.8.8.8",
    servername: "dns.google",
    hostHeader: "dns.google",
    path: `/resolve?name=${encodeURIComponent(name)}&type=A`,
    method: "GET",
    headers: { Accept: "application/dns-json, application/json" },
  });
}

async function resolveSg5Ips() {
  let name = HOST;
  const chain = [];

  for (let depth = 0; depth < 6; depth += 1) {
    const result = await queryGoogleDns(name);
    const answers = Array.isArray(result.json?.Answer) ? result.json.Answer : [];
    const ips = answers
      .filter((answer) => Number(answer?.type) === 1)
      .map((answer) => clean(answer?.data))
      .filter((value) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value));

    chain.push({
      name,
      status: Number(result.json?.Status ?? -1),
      answers: answers.map((answer) => ({
        name: clean(answer?.name),
        type: Number(answer?.type),
        ttl: Number(answer?.TTL),
        data: clean(answer?.data),
      })),
    });

    if (ips.length) {
      return { ips: [...new Set(ips)], chain };
    }

    const cname = answers.find((answer) => Number(answer?.type) === 5)?.data;
    if (!cname) break;
    name = clean(cname).replace(/\.$/, "");
  }

  return { ips: [], chain };
}

function configuredIps() {
  return clean(process.env.FUSIONSOLAR_SG5_IPS)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function currentSg5Ips() {
  const live = await resolveSg5Ips();
  if (live.ips.length) return { ips: live.ips, source: "dns.google", dnsChain: live.chain };
  const configured = configuredIps();
  if (configured.length) return { ips: [...new Set(configured)], source: "FUSIONSOLAR_SG5_IPS", dnsChain: live.chain };
  const error = new Error(`[${CONNECTOR_VERSION}] No IPv4 address was returned for ${HOST}.`);
  error.dnsChain = live.chain;
  throw error;
}

async function requestJson(path, body, headers = {}) {
  const resolved = await currentSg5Ips();
  const ip = resolved.ips[0];
  const result = await httpsJsonByIp({
    ip,
    servername: HOST,
    hostHeader: HOST,
    path: BASE_PATH + path,
    method: "POST",
    body,
    headers,
    timeout: 20000,
  });
  return {
    ...result,
    resolutionSource: resolved.source,
    resolvedIps: resolved.ips,
    dnsChain: resolved.dnsChain,
  };
}

function validate(result, path) {
  const payload = result?.json || {};
  if (payload.success !== true || Number(payload.failCode || 0) !== 0) {
    const code = payload.failCode ?? "unknown";
    const message = payload.message || `FusionSolar request failed at ${path}`;
    const error = new Error(`[${CONNECTOR_VERSION}] ${message} (FusionSolar code ${code})`);
    error.failCode = code;
    error.loginIp = result?.ip || "";
    error.resolutionSource = result?.resolutionSource || "";
    error.resolvedIps = result?.resolvedIps || [];
    error.dnsChain = result?.dnsChain || [];
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
  return {
    token,
    cookie,
    ip: result.ip,
    resolutionSource: result.resolutionSource,
    resolvedIps: result.resolvedIps,
    dnsChain: result.dnsChain,
  };
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

  if (String(req.query?.diagnostic || "").toLowerCase() === "dns") {
    try {
      const resolved = await currentSg5Ips();
      return res.status(200).json({
        provider: "FusionSolar",
        connectorVersion: CONNECTOR_VERSION,
        server: HOST,
        diagnostic: "dns",
        resolutionSource: resolved.source,
        resolvedIps: resolved.ips,
        dnsChain: resolved.dnsChain,
      });
    } catch (error) {
      return res.status(502).json({
        provider: "FusionSolar",
        connectorVersion: CONNECTOR_VERSION,
        server: HOST,
        diagnostic: "dns",
        dnsChain: error?.dnsChain || [],
        message: String(error.message || error),
      });
    }
  }

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
      transport: "live-doh-ip-with-sg5-sni",
      loginIp: session.ip,
      resolutionSource: session.resolutionSource,
      resolvedIps: session.resolvedIps,
      dnsChain: session.dnsChain,
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
      ? `[${CONNECTOR_VERSION}] Huawei rejected the Northbound login (FusionSolar code 20400). ${safeCredentialMeta}`
      : String(error.message || `[${CONNECTOR_VERSION}] FusionSolar could not be reached.`);

    return res.status(502).json({
      configured: true,
      connected: false,
      provider: "FusionSolar",
      connectorVersion: CONNECTOR_VERSION,
      transport: "live-doh-ip-with-sg5-sni",
      server: HOST,
      failCode: error?.failCode ?? null,
      loginIp: error?.loginIp || null,
      resolutionSource: error?.resolutionSource || null,
      resolvedIps: error?.resolvedIps || [],
      dnsChain: error?.dnsChain || [],
      message,
    });
  }
};
