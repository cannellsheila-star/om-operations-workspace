(() => {
  if (window.__fusionLiveValuesInstalled) return;
  window.__fusionLiveValuesInstalled = true;

  const STORAGE_KEY = "om-fusionsolar-live-last-good-v1";
  const state = window.fusionSolarDirectLive || (window.fusionSolarDirectLive = { bySystem: new Map(), fetchedAt: null, error: "" });
  if (!(state.bySystem instanceof Map)) state.bySystem = new Map();

  const num = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const norm = (value) => String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  const fmt = (value, unit = "", digits = 1) => {
    const parsed = num(value);
    if (parsed === null) return "-";
    return `${parsed.toLocaleString("en-ZA", { maximumFractionDigits: digits })}${unit ? ` ${unit}` : ""}`;
  };

  function workspaceSystems() {
    if (typeof systems !== "undefined" && Array.isArray(systems)) return systems;
    return Array.isArray(window.systems) ? window.systems : [];
  }

  function readLastGood() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  function writeLastGood(value) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch {}
  }

  function mapSystemsToCodes(portfolio) {
    const plants = portfolio?.systems || [];
    const result = new Map();
    for (const system of workspaceSystems()) {
      if (!Array.isArray(system.fusionSolarPlants) || !system.fusionSolarPlants.length) continue;
      const wanted = new Set(system.fusionSolarPlants.map(norm));
      const codes = plants.filter((plant) => wanted.has(norm(plant.name))).map((plant) => String(plant.providerStationId || "")).filter(Boolean);
      if (codes.length) result.set(system.id, codes);
    }
    return result;
  }

  function combine(codes, byStation) {
    const rows = codes.map((code) => byStation?.[code]).filter(Boolean);
    if (!rows.length) return null;
    const sumKnown = (key) => {
      const values = rows.map((row) => num(row?.[key])).filter((value) => value !== null);
      return values.length ? values.reduce((a, b) => a + b, 0) : null;
    };
    const avgKnown = (key) => {
      const values = rows.map((row) => num(row?.[key])).filter((value) => value !== null);
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    };
    return {
      pv: sumKnown("pvKw"),
      load: sumKnown("loadKw"),
      gridImport: sumKnown("gridImportKw"),
      gridExport: sumKnown("gridExportKw"),
      gridNet: sumKnown("gridNetKw"),
      soc: avgKnown("soc"),
      charge: sumKnown("chargeKw"),
      discharge: sumKnown("dischargeKw"),
      sampledAt: rows.map((row) => row.sampledAt).filter(Boolean).sort().at(-1) || new Date().toISOString(),
    };
  }

  function patchRow(systemId, metrics, stale = false) {
    const row = document.querySelector(`.plive-row[data-smv2-open="${CSS.escape(String(systemId))}"]`);
    if (!row || !metrics) return;
    const cells = [...row.children];
    const setMetric = (cell, value, label) => {
      if (!cell) return;
      const strong = cell.querySelector("strong");
      const small = cell.querySelector("small");
      if (strong && num(value) !== null) strong.textContent = fmt(value, "kW", 1);
      if (small && num(value) !== null) small.textContent = stale ? `${label} | last good sample` : label;
    };
    setMetric(cells[3], metrics.pv, "Live PV");
    setMetric(cells[4], metrics.load, "Site demand");

    if (cells[5]) {
      const strong = cells[5].querySelector("strong");
      const small = cells[5].querySelector("small");
      if (num(metrics.gridImport) !== null && metrics.gridImport > 0.01) {
        if (strong) strong.textContent = `Import ${fmt(metrics.gridImport, "kW", 1)}`;
        if (small) small.textContent = stale ? "Grid | last good sample" : "From grid";
      } else if (num(metrics.gridExport) !== null && metrics.gridExport > 0.01) {
        if (strong) strong.textContent = `Export ${fmt(metrics.gridExport, "kW", 1)}`;
        if (small) small.textContent = stale ? "Grid | last good sample" : "To grid";
      } else if (num(metrics.gridNet) !== null) {
        if (strong) strong.textContent = fmt(Math.abs(metrics.gridNet), "kW", 1);
        if (small) small.textContent = stale ? "Grid | last good sample" : "Net grid flow";
      }
    }

    const battery = cells[6];
    if (battery) {
      const soc = battery.querySelector(".plive-soc strong");
      const bar = battery.querySelector(".plive-socbar i");
      const direction = battery.querySelector(".plive-battmeta strong");
      const power = battery.querySelector(".plive-battmeta small");
      if (num(metrics.soc) !== null) {
        if (soc) soc.textContent = fmt(metrics.soc, "%", 0);
        if (bar) bar.style.width = `${Math.max(0, Math.min(100, metrics.soc))}%`;
      }
      if (num(metrics.charge) !== null && metrics.charge > 0.01) {
        if (direction) direction.textContent = "Charging";
        if (power) power.textContent = stale ? `${fmt(metrics.charge, "kW", 1)} | last good` : fmt(metrics.charge, "kW", 1);
      } else if (num(metrics.discharge) !== null && metrics.discharge > 0.01) {
        if (direction) direction.textContent = "Discharging";
        if (power) power.textContent = stale ? `${fmt(metrics.discharge, "kW", 1)} | last good` : fmt(metrics.discharge, "kW", 1);
      }
    }
  }

  function patchAll() {
    for (const [systemId, item] of state.bySystem.entries()) patchRow(systemId, item.metrics, Boolean(item.stale));
  }

  async function refresh() {
    const portfolio = window.fusionSolarMonitoring?.data;
    if (!portfolio?.systems?.length) return;
    const mapping = mapSystemsToCodes(portfolio);
    const allCodes = [...new Set([...mapping.values()].flat())];
    if (!allCodes.length) return;

    const lastGood = readLastGood();
    try {
      const response = await fetch(`/api/fusionsolar-live?stationCodes=${encodeURIComponent(allCodes.join(","))}`, { cache: "no-store", headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.connected === false) throw new Error(payload.message || "FusionSolar live data could not be loaded.");
      for (const [systemId, codes] of mapping.entries()) {
        const metrics = combine(codes, payload.byStation);
        if (!metrics) continue;
        state.bySystem.set(systemId, { metrics, stale: false });
        lastGood[systemId] = { metrics, savedAt: new Date().toISOString() };
      }
      writeLastGood(lastGood);
      state.fetchedAt = new Date().toISOString();
      state.error = "";
    } catch (error) {
      state.error = error?.message || "FusionSolar live data could not be loaded.";
      for (const [systemId] of mapping.entries()) {
        if (state.bySystem.has(systemId)) continue;
        const cached = lastGood[systemId];
        if (cached?.metrics) state.bySystem.set(systemId, { metrics: cached.metrics, stale: true });
      }
    }
    patchAll();
  }

  const observer = new MutationObserver(() => patchAll());
  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(patchAll, 1500);
  setInterval(refresh, 60000);
  setTimeout(refresh, 1800);
})();