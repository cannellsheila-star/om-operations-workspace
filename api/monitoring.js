const crypto = require("crypto");

const DEYE_BASE_URL = "https://eu1-developer.deyecloud.com/v1.0";
const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const first = (object, keys) => keys.map((key) => object?.[key]).find((value) => value !== undefined && value !== null && value !== "");
const stationId = (station) => String(first(station, ["stationId", "station_id", "id"]) || "");
const stationName = (station) => String(first(station, ["stationName", "station_name", "name", "plantName"]) || "");
const clean = (value) => String(value ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();

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
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: "bearer " + String(token).replace(/^bearer\s+/i, "") } : {}) },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    const code = String(payload.code ?? "");
    if (!response.ok || payload.success === false || (code && code !== "1000000")) {
      const detail = String(payload.msg || payload.message || "Deye Cloud request failed (" + response.status + ").");
      const error = new Error(detail);
      error.code = code;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function normalise(account, station, latest) {
  const id = stationId(station);
  const name = stationName(station);
  const mapped = account.systemMap?.[id] ?? account.systemMap?.[name];
  const watts = numeric(first(latest, ["generationPower", "power", "currentPower", "pvPower"]) ?? first(station, ["generationPower", "power", "currentPower", "pvPower"]));
  const online = first(latest, ["online", "isOnline"]) ?? first(station, ["online", "isOnline"]);
  const state = first(latest, ["status", "operatingStatus", "state"]) ?? first(station, ["status", "stationStatus", "state"]);
  return {
    systemId: typeof mapped === "string" ? mapped : String(mapped?.systemId || id),
    name: typeof mapped === "object" && mapped?.name ? String(mapped.name) : name,
    provider: "Deye Cloud",
    providerAccount: String(account.label || "Deye Cloud"),
    providerStationId: id,
    status: state !== undefined ? String(state) : (online === true || online === 1 || online === "1" ? "Operational" : online === false || online === 0 || online === "0" ? "Non-operational" : "Unknown"),
    powerKw: watts === null ? null : watts / 1000,
    energyTodayKwh: numeric(first(latest, ["todayGeneration", "dayGeneration", "todayEnergy", "energyToday"]) ?? first(station, ["todayGeneration", "dayGeneration", "todayEnergy", "energyToday"])),
    availability: null,
    lastSync: String(first(latest, ["lastUpdateTime", "lastSync", "updateTime"]) ?? first(station, ["lastUpdateTime", "lastSync"]) ?? ""),
    batterySoc: numeric(first(latest, ["batterySOC", "batterySoc", "soc"])),
  };
}

async function readAccount(account) {
  if (!account.appId || !account.appSecret || !account.email) throw new Error("Deye Cloud account settings are incomplete.");
  const base = String(account.baseUrl || DEYE_BASE_URL).replace(/\/+$/, "");
  const auth = { appSecret: account.appSecret, email: account.email, password: passwordFor(account) };
  if (account.companyId !== undefined && account.companyId !== null && account.companyId !== "") auth.companyId = account.companyId;
  try {
    const tokenResult = await callDeye(base + "/account/token?appId=" + encodeURIComponent(account.appId), auth);
    const token = tokenResult.accessToken || tokenResult.data?.accessToken;
    if (!token) throw new Error("Deye Cloud did not return an access token.");
    const stationResult = await callDeye(base + "/station/list", { page: 1, size: 100 }, token);
    const stations = [stationResult.stationList, stationResult.data?.stationList, stationResult.data, stationResult.rows].find(Array.isArray) || [];
    const systems = await Promise.all(stations.filter((station) => stationId(station)).map(async (station) => {
      try {
        const latest = await callDeye(base + "/station/latest", { stationId: stationId(station) }, token);
        return normalise(account, station, latest.data || latest);
      } catch {
        return normalise(account, station, {});
      }
    }));
    return { label: String(account.label || "Deye Cloud"), systems };
  } catch (error) {
    if (String(error.message || "").toLowerCase().includes("appid")) {
      throw new Error("Deye Cloud rejected App ID ending " + account.appId.slice(-4) + " (length " + account.appId.length + ") at " + base + ": " + error.message);
    }
    throw error;
  }
}

module.exports = async function monitoring(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed." });
  try {
    const accounts = configuredAccounts();
    if (!accounts.length) return res.status(200).json({ configured: false, provider: "Deye Cloud", systems: [], message: "Deye Cloud is ready for secure connection. Add the account settings in Vercel to bring in all stations." });
    const results = await Promise.allSettled(accounts.map(readAccount));
    const connected = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
    if (!connected.length) throw results.find((result) => result.status === "rejected")?.reason || new Error("Deye Cloud could not be reached.");
    const failed = results.length - connected.length;
    return res.status(200).json({ configured: true, provider: "Deye Cloud", fetchedAt: new Date().toISOString(), accounts: connected.map((account) => ({ label: account.label, systems: account.systems.length })), systems: connected.flatMap((account) => account.systems), message: String(connected.length) + " Deye Cloud account" + (connected.length === 1 ? "" : "s") + " connected" + (failed ? "; " + String(failed) + " could not be reached" : "") + "." });
  } catch (error) {
    return res.status(502).json({ message: error.message || "Deye Cloud could not be reached." });
  }
};
