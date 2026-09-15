const crypto = require("crypto");

const DEYE_BASE_URL = "https://eu1-developer.deyecloud.com/v1.0";
const numberValue = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const firstValue = (object, keys) => keys.map((key) => object?.[key]).find((value) => value !== undefined && value !== null && value !== "");
const stationId = (station) => String(firstValue(station, ["stationId", "station_id", "id"]) || "");
const stationName = (station) => String(firstValue(station, ["stationName", "station_name", "name", "plantName"]) || "");

function getAccounts() {
  if (!process.env.DEYE_CLOUD_ACCOUNTS) return [];
  try {
    const parsed = JSON.parse(process.env.DEYE_CLOUD_ACCOUNTS);
    const list = Array.isArray(parsed) ? parsed : parsed.accounts;
    if (!Array.isArray(list)) throw new Error();
    return list.filter((account) => account && typeof account === "object");
  } catch {
    throw new Error("DEYE_CLOUD_ACCOUNTS must be a valid JSON list.");
  }
}

function passwordHash(account) {
  const supplied = String(account.passwordHash || account.passwordSha256 || "");
  if (/^[a-f0-9]{64}$/i.test(supplied)) return supplied;
  if (!account.password) throw new Error("A Deye Cloud password is missing.");
  return crypto.createHash("sha256").update(String(account.password), "utf8").digest("hex");
}

async function postDeye(url, body, token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "bearer " + String(token).replace(/^bearer\s+/i, "") } : {}),
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false || (payload.code && Number(payload.code) !== 1000000)) throw new Error("Deye Cloud request failed.");
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function normaliseStation(account, station, latest) {
  const id = stationId(station);
  const name = stationName(station);
  const mapped = account.systemMap?.[id] ?? account.systemMap?.[name];
  const watts = numberValue(firstValue(latest, ["generationPower", "power", "currentPower", "pvPower"]) ?? firstValue(station, ["generationPower", "power", "currentPower", "pvPower"]));
  const online = firstValue(latest, ["online", "isOnline"]) ?? firstValue(station, ["online", "isOnline"]);
  const status = firstValue(latest, ["status", "operatingStatus", "state"]) ?? firstValue(station, ["status", "stationStatus", "state"]);
  return {
    systemId: typeof mapped === "string" ? mapped : String(mapped?.systemId || id),
    name: typeof mapped === "object" && mapped?.name ? String(mapped.name) : name,
    provider: "Deye Cloud",
    providerAccount: String(account.label || "Deye Cloud"),
    providerStationId: id,
    status: status !== undefined ? String(status) : (online === true || online === 1 || online === "1" ? "Operational" : online === false || online === 0 || online === "0" ? "Non-operational" : "Unknown"),
    powerKw: watts === null ? null : watts / 1000,
    energyTodayKwh: numberValue(firstValue(latest, ["todayGeneration", "dayGeneration", "todayEnergy", "energyToday"]) ?? firstValue(station, ["todayGeneration", "dayGeneration", "todayEnergy", "energyToday"])),
    availability: null,
    lastSync: String(firstValue(latest, ["lastUpdateTime", "lastSync", "updateTime"]) ?? firstValue(station, ["lastUpdateTime", "lastSync"]) ?? ""),
    batterySoc: numberValue(firstValue(latest, ["batterySOC", "batterySoc", "soc"])),
  };
}

async function readAccount(account) {
  if (!account.appId || !account.appSecret || !account.email) throw new Error("Deye Cloud account settings are incomplete.");
  const base = String(account.baseUrl || DEYE_BASE_URL).replace(/\/+$/, "");
  const tokenResult = await postDeye(base + "/account/token?appId=" + encodeURIComponent(account.appId), {
    appSecret: account.appSecret,
    email: account.email,
    password: passwordHash(account),
    ...(account.companyId ? { companyId: account.companyId } : {}),
  });
  const token = tokenResult.accessToken || tokenResult.data?.accessToken;
  if (!token) throw new Error("Deye Cloud did not return an access token.");
  const stationResult = await postDeye(base + "/station/list", { page: 1, size: 100 }, token);
  const stations = [stationResult.stationList, stationResult.data?.stationList, stationResult.data, stationResult.rows].find(Array.isArray) || [];
  const systems = await Promise.all(stations.filter((station) => stationId(station)).map(async (station) => {
    try {
      const latestResult = await postDeye(base + "/station/latest", { stationId: stationId(station) }, token);
      return normaliseStation(account, station, latestResult.data || latestResult);
    } catch {
      return normaliseStation(account, station, {});
    }
  }));
  return { label: String(account.label || "Deye Cloud"), systems };
}

module.exports = async function monitoring(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed." });
  try {
    const accounts = getAccounts();
    if (!accounts.length) return res.status(200).json({
      configured: false,
      provider: "Deye Cloud",
      systems: [],
      message: "Deye Cloud is ready for secure connection. Add the account settings in Vercel to bring in all stations.",
    });
    const results = await Promise.allSettled(accounts.map(readAccount));
    const connected = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
    if (!connected.length) throw new Error("Deye Cloud could not be reached. Check the secure account settings in Vercel.");
    const failed = results.length - connected.length;
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
