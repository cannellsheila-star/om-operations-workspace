const number = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

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

module.exports = async function savings(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed." });

  const payload = bodyObject(req);
  const period = payload.period && typeof payload.period === "object" ? payload.period : {};
  const from = day(period.from);
  const to = day(period.to);
  const sites = Array.isArray(payload.sites) ? payload.sites : [];
  if (!from || !to || from > to) return res.status(400).json({ message: "A valid report period is required." });
  if (sites.length > 100) return res.status(400).json({ message: "A maximum of 100 sites can be calculated at once." });

  const results = sites.map((site) => calculateSite(site, { from: period.from, to: period.to }));
  return res.status(200).json({ period: { from: period.from, to: period.to }, results });
};
