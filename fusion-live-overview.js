(() => {
  if (window.__fusionLiveOverviewInstalled) return;
  window.__fusionLiveOverviewInstalled = true;

  // Huawei rate-limits getDevRealKpi by device type. Keep one shared snapshot
  // refresh comfortably outside the one-minute concurrency window and let the
  // server rotate through PV, meter and ESS data without competing pollers.
  const INTERVAL_MS = 110 * 1000;
  const num = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const norm = (value) => String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

  function workspaceSystems() {
    if (typeof systems !== "undefined" && Array.isArray(systems)) return systems;
    return Array.isArray(window.systems) ? window.systems : [];
  }

  function store() {
    return window.fusionSolarMonitoring || null;
  }

  function mappedCodes(system, portfolio) {
    const wanted = new Set((system.fusionSolarPlants || []).map(norm));
    return (portfolio?.systems || [])
      .filter((plant) => wanted.has(norm(plant.name)))
      .map((plant) => String(plant.providerStationId || plant.stationCode || ""))
      .filter(Boolean);
  }

  function sumKnown(values) {
    const known = values.map(num).filter((value) => value !== null);
    return known.length ? known.reduce((total, value) => total + value, 0) : null;
  }

  function averageKnown(values) {
    const known = values.map(num).filter((value) => value !== null);
    return known.length ? known.reduce((total, value) => total + value, 0) / known.length : null;
  }

  function mergeSystem(system, payload, portfolio) {
    const fusion = store();
    if (!fusion) return;
    if (!(fusion.detailCache instanceof Map)) fusion.detailCache = new Map();

    const codes = mappedCodes(system, portfolio);
    const rows = codes.map((code) => payload.sites?.[code]).filter(Boolean);
    if (!rows.length) return;

    const existing = fusion.detailCache.get(system.id) || { plants: [], bessDevices: [], aggregate: {} };
    const aggregate = existing.aggregate || {};
    const pv = sumKnown(rows.map((row) => row.pvKw));
    const load = sumKnown(rows.map((row) => row.loadKw));
    const gridImport = sumKnown(rows.map((row) => row.importKw));
    const gridExport = sumKnown(rows.map((row) => row.exportKw));
    const soc = averageKnown(rows.map((row) => row.soc));
    const charge = sumKnown(rows.map((row) => row.chargeKw));
    const discharge = sumKnown(rows.map((row) => row.dischargeKw));
    const sampleTimes = rows.map((row) => row.sampleAt).filter(Boolean).map((value) => new Date(value).getTime()).filter(Number.isFinite);

    if (pv !== null) {
      aggregate.powerKw = pv;
      aggregate.pvPowerKw = pv;
    }
    if (load !== null) {
      aggregate.consumptionPowerKw = load;
      aggregate.loadPowerKw = load;
    }
    if (gridImport !== null) aggregate.gridImportPowerKw = gridImport;
    if (gridExport !== null) aggregate.gridExportPowerKw = gridExport;
    if (gridImport !== null || gridExport !== null) aggregate.gridPowerKw = (gridExport || 0) - (gridImport || 0);
    if (soc !== null) aggregate.batterySoc = soc;
    if (charge !== null) aggregate.chargePowerKw = charge;
    if (discharge !== null) aggregate.dischargePowerKw = discharge;
    if (charge !== null || discharge !== null) aggregate.batteryPowerKw = (charge || 0) - (discharge || 0);

    existing.aggregate = aggregate;
    existing.liveSampleAt = sampleTimes.length ? new Date(Math.max(...sampleTimes)).toISOString() : existing.liveSampleAt || null;
    existing.fetchedAt = existing.liveSampleAt || payload.fetchedAt || existing.fetchedAt || null;
    fusion.detailCache.set(system.id, existing);
  }

  let running = false;
  async function refresh() {
    if (running || document.visibilityState !== "visible") return;
    if (typeof state !== "undefined" && state.view !== "monitoring") return;

    const fusion = store();
    const portfolio = fusion?.data;
    if (!portfolio?.systems?.length) return;

    const fusionSystems = workspaceSystems().filter((system) => Array.isArray(system.fusionSolarPlants) && system.fusionSolarPlants.length);
    const codes = [...new Set(fusionSystems.flatMap((system) => mappedCodes(system, portfolio)))];
    if (!codes.length) return;

    running = true;
    try {
      const response = await fetch(`/api/fusionsolar-live-snapshot?stationCodes=${encodeURIComponent(codes.join(","))}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return;

      fusionSystems.forEach((system) => mergeSystem(system, payload, portfolio));
      window.__fusionLiveSnapshot = payload;
      if (typeof renderMonitoring === "function" && typeof state !== "undefined" && state.view === "monitoring") renderMonitoring();
    } finally {
      running = false;
    }
  }

  const timer = setInterval(refresh, INTERVAL_MS);
  window.addEventListener("beforeunload", () => clearInterval(timer), { once: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
  setTimeout(refresh, 2500);
})();