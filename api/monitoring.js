const crypto = require("crypto");

const deyeBase = "https://eu1-developer.deyecloud.com/v1.0";
const num = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const pick = (object, keys) => keys.map((key) => object?.[key]).find((value) => value !== undefined && value !== null && value !== "");
const idOf = (station) => String(pick(station, ["stationId", "station_id", "id"]) || "");
const nameOf = (station) => String(pick(station, ["stationName", "station_name", "name", "plantName"]) || "");

function configuredAccounts() {
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

async function post(url, body, token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `bearer ${String(token).replace(/^bearer\s+/i, "")}` } : {}) },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false || (payload.code && Number(payload.code) !== 1000000)) throw new Error("Deye Cloud request failed.");
    return payload;
  } finally { clearTimeout(timeout); }
}

function accountPassword(account) {
  const hash = String(account.passwordHash || account.passwordSha256 || "");
  if (/^[a-f0-9]{64}$/i.test(hash)) return hash;
  if (!account.password) throw new Error("A Deye Cloud password is missing.");
  return crypto.createHash("sha256").update(String(account.password), "utf8").digest("hex");
}

function normalise(account, station, latest) {
  const stationId = idOf(station);
  const stationName = nameOf(station);
  const mapped = account.systemMap?.[stationId] ?? account.systemMap?.[stationName];
  const watts = num(pick(latest, ["generationPower", "power", "currentPower", "pvPower"]) ?? pick(station, ["generationPower", "power", "currentPower", "pvPower"]));
  const online = pick(latest, ["online", "isOnline"]) ?? pick(station, ["online", "isOnline"]);
  const state = pick(latest, ["status", "operatingStatus", "state"]) ?? pick(station, ["status", "stationStatus", "state"]);
  return {
    systemId: typeof mapped === "string" ? mapped : String(mapped?.systemId || stationId),
    name: typeof mapped === "object" && mapped?.name ? String(mapped.name) : stationName,
    provider: "Deye Cloud", providerAccount: String(account.label || "Deye Cloud"), providerStationId: stationId,
    status: state !== undefined ? String(state) : (online === true || online === 1 || online === "1" ? "Operational" : online === false || online === 0 || online === "0" ? "Non-operational" : "Unknown"),
    powerKw: watts === null ? null : watts / 1000,
    energyTodayKwh: num(pick(latest, ["todayGeneration", "dayGeneration", "todayEnergy", "energyToday"]) ?? pick(station, ["todayGeneration", "dayGeneration", "todayEnergy", "energyToday"])),
    availability: null,
    lastSync: String(pick(latest, ["lastUpdateTime", "lastSync", "updateTime"]) ?? pick(station, ["lastUpdateTime", "lastSync"]) ?? ""),
    batterySoc: num(pick(latest, ["batterySOC", "batterySoc", "soc"])),
  };
}

async function readAccount(account) {
  const base = String(account.baseUrl || deyeBase).replace(/\/+$/, "");
  if (!account.appId || !account.appSecret || !account.email) throw new Error("Deye Cloud account settings are incomplete.");
  const tokenData = await post(`${base}/account/token?appId=${encodeURIComponent(account.appId)}`, { appSecret: account.appSecret, email: account.email, password: accountPassword(account), ...(account.companyId ? { companyId: account.companyId } : {}) });
  const token = tokenData.accessToken || tokenData.data?.accessToken;
  if (!token) throw new Error("Deye Cloud did not return an access token.");
  const listed = await post(`${base}/station/list`, { page: 1, size: 100 }, token);
  const stations = [listed.stationList, listed.data?.stationList, listed.data, listed.rows].find(Array.isArray) || [];
  const systems = await Promise.all(stations.filter((station) => idOf(station)).map(async (station) => {
    try { const latest = await post(`${base}/station/latest`, { stationId: idOf(station) }, token); return normalise(account, station, latest.data || latest); }
    catch { return normalise(account, station, {}); }
  }));
  return { label: String(account.label || "Deye Cloud"), systems };
}

module.exports = async function monitoring(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed." });
  try {
    const accounts = configuredAccounts();    const configuredAccounts = accounts;
    if (!accounts.length) return res.status(200).json({ configured: false, provider: "Deye Cloud", systems: [], message: "Deye Cloud is ready for secure connection. Add the account settings in Vercel to bring in all stations." });
    const results = await Promise.allSettled(configuredAccounts.map(readAccount));
    const connected = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
    if (!connected.length) throw new Error("Deye Cloud could not be reached. Check the secure account settings in Vercel.");
    return res.status(200).json({
      configured: true, provider: "Deye Cloud", fetchedAt: new Date().toISOString(),
      accounts: connected.map((account) => ({ label: account.label, systems: account.systems.length })),
      systems: connected.flatMap((account) => account.systems),
      message: `${connected.length} Deye Cloud account${connected.length === 1 ? "" : "s"} connected${results.length > connected.length ? `; ${results.length - connected.length} could not be reached` : ""}.`,
    });
  } catch (error) { return res.status(502).json({ message: error.message || "Deye Cloud could not be reached." }); }
};
