(() => {
  if (window.__fusionLiveOverviewInstalled) return;
  window.__fusionLiveOverviewInstalled = true;

  // One shared poller only. Huawei rate-limits realtime device data, so the
  // snapshot endpoint rotates device types and persists the last good values.
  const INTERVAL_MS = 110 * 1000;
  const LAST_GOOD_KEY = "om-fusionsolar-live-last-good-v1";

  const num = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const norm = (value) => String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  function workspaceSystems() {
    if (typeof systems !== "undefined" && Array.isArray(systems)) return systems;
    return Array.isArray(window.systems) ? window.systems : [];
  }

  function store() {
    return window.fusionSolarMonitoring || null;
  }

  function mappedPlants(system, portfolio) {
    const wanted = new Set((system.fusionSolarPlants || []).map(norm));
    return (portfolio?.systems || []).filter((plant) => wanted.has(norm(plant.name)));
  }

  function mappedCodes(system, portfolio) {
    return mappedPlants(system, portfolio)
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

  function portfolioPv(system, portfolio) {
    const plants = mappedPlants(system, portfolio);
    const values = plants.map((plant) => {
      const direct = num(plant.powerKw);
      if (direct !== null) return direct;
      return num(plant.pvPowerKw);
    });
    return sumKnown(values);
  }

  function ensureDetail(system) {
    const fusion = store();
    if (!fusion) return null;
    if (!(fusion.detailCache instanceof Map)) fusion.detailCache = new Map();
    const existing = fusion.detailCache.get(system.id) || { plants: [], bessDevices: [], aggregate: {} };
    if (!existing.aggregate) existing.aggregate = {};
    fusion.detailCache.set(system.id, existing);
    return existing;
  }

  function readLastGood() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LAST_GOOD_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function seedLastGoodBess(system) {
    const cached = readLastGood()?.[system.id];
    const metrics = cached?.metrics;
    if (!metrics) return;

    const detail = ensureDetail(system);
    if (!detail) return;
    const aggregate = detail.aggregate || (detail.aggregate = {});

    // This fallback restores only the BESS values that were working before the
    // poller change. It never writes PV, load or grid values, so stale browser
    // cache cannot contaminate the other live metrics.
    let seeded = false;
    const soc = num(metrics.soc);
    const charge = num(metrics.charge);
    const discharge = num(metrics.discharge);

    if (num(aggregate.batterySoc) === null && soc !== null) {
      aggregate.batterySoc = soc;
      seeded = true;
    }
    if (num(aggregate.chargePowerKw) === null && charge !== null) {
      aggregate.chargePowerKw = charge;
      seeded = true;
    }
    if (num(aggregate.dischargePowerKw) === null && discharge !== null) {
      aggregate.dischargePowerKw = discharge;
      seeded = true;
    }
    if (num(aggregate.batteryPowerKw) === null && (charge !== null || discharge !== null)) {
      aggregate.batteryPowerKw = (charge || 0) - (discharge || 0);
      seeded = true;
    }

    if (seeded) {
      detail.bessSampleSource = "last-good-browser-cache";
      detail.bessSampleAt = cached.savedAt || null;
      store().detailCache.set(system.id, detail);
    }
  }

  function seedPortfolioPower(system, portfolio) {
    const detail = ensureDetail(system);
    if (!detail) return;
    const pv = portfolioPv(system, portfolio);
    if (pv === null) return;
    detail.aggregate.powerKw = pv;
    detail.aggregate.pvPowerKw = pv;
    detail.fetchedAt = portfolio?.fetchedAt || detail.fetchedAt || null;
  }

  function mergeSystem(system, payload, portfolio) {
    const fusion = store();
    if (!fusion) return;

    const codes = mappedCodes(system, portfolio);
    const rows = codes.map((code) => payload.sites?.[code]).filter(Boolean);
    const existing = ensureDetail(system);
    if (!existing) return;
    const aggregate = existing.aggregate;

    const snapshotPv = sumKnown(rows.map((row) => row.pvKw));
    const pv = snapshotPv !== null ? snapshotPv : portfolioPv(system, portfolio);
    const gridImport = sumKnown(rows.map((row) => row.importKw));
    const gridExport = sumKnown(rows.map((row) => row.exportKw));
    const soc = averageKnown(rows.map((row) => row.soc));
    const charge = sumKnown(rows.map((row) => row.chargeKw));
    const discharge = sumKnown(rows.map((row) => row.dischargeKw));
    let load = sumKnown(rows.map((row) => row.loadKw));

    if (load === null && pv !== null && gridImport !== null && gridExport !== null) {
      load = Math.max(0, pv + gridImport + (discharge || 0) - gridExport - (charge || 0));
    }

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
    if (gridImport !== null || gridExport !== null) {
      aggregate.gridPowerKw = (gridExport || 0) - (gridImport || 0);
    }
    if (soc !== null) aggregate.batterySoc = soc;
    if (charge !== null) aggregate.chargePowerKw = charge;
    if (discharge !== null) aggregate.dischargePowerKw = discharge;
    if (charge !== null || discharge !== null) {
      aggregate.batteryPowerKw = (charge || 0) - (discharge || 0);
    }

    if (soc !== null || charge !== null || discharge !== null) {
      existing.bessSampleSource = "live-snapshot";
      existing.bessSampleAt = rows.map((row) => row.sampleAt).filter(Boolean).sort().at(-1) || payload.fetchedAt || null;
    }

    const sampleTimes = rows
      .map((row) => row.sampleAt)
      .filter(Boolean)
      .map((value) => new Date(value).getTime())
      .filter(Number.isFinite);

    existing.aggregate = aggregate;
    existing.liveSampleAt = sampleTimes.length
      ? new Date(Math.max(...sampleTimes)).toISOString()
      : existing.liveSampleAt || null;
    existing.fetchedAt = existing.liveSampleAt || payload.fetchedAt || portfolio?.fetchedAt || existing.fetchedAt || null;
    fusion.detailCache.set(system.id, existing);
  }

  function markBessFallbackRows() {
    const fusion = store();
    if (!(fusion?.detailCache instanceof Map)) return;
    for (const system of workspaceSystems()) {
      const detail = fusion.detailCache.get(system.id);
      if (detail?.bessSampleSource !== "last-good-browser-cache") continue;
      const row = document.querySelector(`.plive-row[data-smv2-open="${CSS.escape(String(system.id))}"]`);
      const small = row?.children?.[6]?.querySelector?.(".plive-battmeta small");
      if (small && !small.textContent.includes("last good")) {
        small.textContent = `${small.textContent || "BESS"} | last good`;
      }
    }
  }

  function renderIfMonitoring() {
    if (typeof renderMonitoring === "function" && typeof state !== "undefined" && state.view === "monitoring") {
      renderMonitoring();
      setTimeout(markBessFallbackRows, 0);
    }
  }

  let running = false;
  async function refresh() {
    if (running || document.visibilityState !== "visible") return;
    if (typeof state !== "undefined" && state.view !== "monitoring") return;

    const fusion = store();
    const portfolio = fusion?.data;
    if (!portfolio?.systems?.length) return;

    const fusionSystems = workspaceSystems().filter(
      (system) => Array.isArray(system.fusionSolarPlants) && system.fusionSolarPlants.length
    );

    // Restore only the previously verified BESS values while Huawei is
    // throttling device discovery, then let fresh snapshot values replace them
    // automatically as soon as the API permits them again.
    fusionSystems.forEach(seedLastGoodBess);
    fusionSystems.forEach((system) => seedPortfolioPower(system, portfolio));
    renderIfMonitoring();

    const codes = [...new Set(fusionSystems.flatMap((system) => mappedCodes(system, portfolio)))];
    if (!codes.length) return;

    running = true;
    try {
      const response = await fetch(
        `/api/fusionsolar-live-snapshot?stationCodes=${encodeURIComponent(codes.join(","))}`,
        { cache: "no-store", headers: { Accept: "application/json" } }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return;

      fusionSystems.forEach((system) => mergeSystem(system, payload, portfolio));
      window.__fusionLiveSnapshot = payload;
      renderIfMonitoring();
    } finally {
      running = false;
    }
  }

  const timer = setInterval(refresh, INTERVAL_MS);
  window.addEventListener("beforeunload", () => clearInterval(timer), { once: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
  setInterval(markBessFallbackRows, 1500);
  setTimeout(refresh, 1800);
})();
