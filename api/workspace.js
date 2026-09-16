const SNAPSHOT_PATH = "om-workspace/workspace.json";

const number = (value) => value === null || value === undefined || String(value).trim() === "" ? null : (Number.isFinite(Number(value)) ? Number(value) : null);

function bodyObject(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try { return JSON.parse(String(req.body)); } catch { return {}; }
}

function day(value) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(text + "T12:00:00") : null;
}

function proratedEaas(monthly, fromValue, toValue) {
  const amount = number(monthly);
  const from = day(fromValue);
  const to = day(toValue);
  if (amount === null || !from || !to || from > to) return null;
  let total = 0;
  const cursor = new Date(from);
  while (cursor <= to) {
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    total += amount / daysInMonth;
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
}

function calculateSite(site, period) {
  const monitoring = site && typeof site.monitoring === "object" ? site.monitoring : {};
  const tariff = site && typeof site.tariff === "object" ? site.tariff : {};
  const contract = site && typeof site.contract === "object" ? site.contract : {};
  const pvKwh = number(monitoring.pvKwh);
  const loadKwh = number(monitoring.loadKwh);
  const importKwh = number(monitoring.importKwh);
  const exportKwh = number(monitoring.exportKwh);
  const utilityRate = number(tariff.ratePerKwh);
  const exportRate = number(tariff.exportRatePerKwh);
  const ppaRate = number(contract.ppaRatePerKwh);
  const eassMonthly = number(contract.eassMonthly);

  let energyOffsetKwh = null;
  let method = "";
  if (loadKwh !== null && importKwh !== null) {
    energyOffsetKwh = Math.max(loadKwh - importKwh, 0);
    method = "site load less grid import";
  } else if (pvKwh !== null && exportKwh !== null) {
    energyOffsetKwh = Math.max(pvKwh - exportKwh, 0);
    method = "PV generation less grid export";
  }

  const avoidedUtility = energyOffsetKwh !== null && utilityRate !== null ? energyOffsetKwh * utilityRate : null;
  const exportCredit = exportKwh !== null && exportRate !== null ? Math.max(exportKwh, 0) * exportRate : null;
  const ppaCharge = pvKwh !== null && ppaRate !== null ? Math.max(pvKwh, 0) * ppaRate : null;
  const eassCharge = proratedEaas(eassMonthly, period.from, period.to);
  const utilityValue = avoidedUtility === null ? null : avoidedUtility + (exportCredit || 0);
  const contractCost = (ppaCharge || 0) + (eassCharge || 0);
  const netSaving = utilityValue === null ? null : utilityValue - contractCost;

  let status = "Calculated";
  if (energyOffsetKwh === null) status = "No monitoring energy data for this period";
  else if (utilityRate === null) status = "Utility tariff is not recorded";
  else if (method === "PV generation less grid export") status = "Calculated from PV generation less grid export";
  else status = "Calculated from site load less grid import";

  return {
    systemId: String(site.systemId || ""),
    status,
    method: method || null,
    energyOffsetKwh,
    avoidedUtility,
    exportCredit,
    ppaCharge,
    eassCharge,
    netSaving,
  };
}


async function blobSdk() {
  return import("@vercel/blob");
}

async function readJsonBlob() {
  const { get } = await blobSdk();
  const result = await get(SNAPSHOT_PATH, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  const text = await new Response(result.stream).text();
  return text ? JSON.parse(text) : null;
}

module.exports = async function workspace(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  if (req.method === "POST" && String(req.query?.action || "") === "savings") {
    const payload = bodyObject(req);
    const period = payload.period && typeof payload.period === "object" ? payload.period : {};
    const from = day(period.from);
    const to = day(period.to);
    const sites = Array.isArray(payload.sites) ? payload.sites : [];
    if (!from || !to || from > to) return res.status(400).json({ message: "A valid report period is required." });
    if (sites.length > 100) return res.status(400).json({ message: "A maximum of 100 sites can be calculated at once." });
    const results = sites.map((site) => calculateSite(site, { from: period.from, to: period.to }));
    return res.status(200).json({ period: { from: period.from, to: period.to }, results });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({
      configured: false,
      persistent: false,
      message: "Persistent workspace storage is not connected yet. Browser storage remains active until a Vercel Blob store is connected.",
    });
  }

  try {
    if (req.method === "GET") {
      const snapshot = await readJsonBlob();
      return res.status(200).json({ configured: true, persistent: true, snapshot });
    }

    if (req.method === "POST" || req.method === "PUT") {
      const payload = bodyObject(req);
      const source = payload.snapshot && typeof payload.snapshot === "object" ? payload.snapshot : payload;
      if (!Array.isArray(source.systems) || !Array.isArray(source.tickets) || !Array.isArray(source.maintenance)) {
        return res.status(400).json({ message: "Workspace snapshot must contain systems, tickets and maintenance arrays." });
      }

      const snapshot = {
        version: 1,
        updatedAt: new Date().toISOString(),
        systems: source.systems,
        tickets: source.tickets,
        maintenance: source.maintenance,
      };
      const serialised = JSON.stringify(snapshot);
      if (Buffer.byteLength(serialised, "utf8") > 4 * 1024 * 1024) {
        return res.status(413).json({ message: "Workspace snapshot is too large to save." });
      }

      const { put } = await blobSdk();
      const blob = await put(SNAPSHOT_PATH, serialised, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
      });
      return res.status(200).json({ configured: true, persistent: true, updatedAt: snapshot.updatedAt, pathname: blob.pathname });
    }

    return res.status(405).json({ message: "Method not allowed." });
  } catch (error) {
    return res.status(500).json({ configured: true, persistent: false, message: error?.message || "Workspace storage failed." });
  }
};
