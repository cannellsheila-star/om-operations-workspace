(() => {
  if (window.__monitoringValueSafetyInstalled) return;
  window.__monitoringValueSafetyInstalled = true;

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

  const fmt = (value, unit = "", digits = 1) => {
    const parsed = num(value);
    if (parsed === null) return "-";
    return `${parsed.toLocaleString("en-ZA", { maximumFractionDigits: digits })}${unit ? ` ${unit}` : ""}`;
  };

  function workspaceSystems() {
    if (typeof systems !== "undefined" && Array.isArray(systems)) return systems;
    return Array.isArray(window.systems) ? window.systems : [];
  }

  function telemetryFor(system) {
    const feeds = typeof monitoringState !== "undefined" ? (monitoringState.data?.systems || []) : [];
    const exact = feeds.find((item) => String(item.systemId || "") === String(system.id));
    if (exact) return exact;
    const target = norm(system.name);
    return feeds.find((item) => norm(item.name) === target) || null;
  }

  function detailFor(system) {
    const cache = window.fusionSolarMonitoring?.detailCache;
    return cache instanceof Map ? cache.get(system.id) || null : null;
  }

  function firstKnown(...values) {
    for (const value of values) {
      const parsed = num(value);
      if (parsed !== null) return parsed;
    }
    return null;
  }

  function sumKnown(rows, keys) {
    const values = [];
    for (const row of rows || []) {
      for (const key of keys) {
        const value = num(row?.[key]);
        if (value !== null) {
          values.push(value);
          break;
        }
      }
    }
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
  }

  function avgKnown(rows, keys) {
    const values = [];
    for (const row of rows || []) {
      for (const key of keys) {
        const value = num(row?.[key]);
        if (value !== null) {
          values.push(value);
          break;
        }
      }
    }
    return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
  }

  function fusionMetrics(system) {
    const telemetry = telemetryFor(system);
    const detail = detailFor(system);
    const plants = detail?.plants || [];
    const bess = detail?.bessDevices || [];
    const aggregate = detail?.aggregate || {};

    const plantPv = sumKnown(plants, ["powerKw", "pvPowerKw"]);
    const plantLoad = sumKnown(plants, ["consumptionPowerKw", "loadPowerKw"]);
    const plantGrid = sumKnown(plants, ["gridPowerKw"]);
    const plantImport = sumKnown(plants, ["gridImportPowerKw", "purchasePowerKw"]);
    const plantExport = sumKnown(plants, ["gridExportPowerKw"]);
    const bessSoc = avgKnown(bess, ["soc", "batterySoc"]);
    const bessCharge = sumKnown(bess, ["chargePowerKw"]);
    const bessDischarge = sumKnown(bess, ["dischargePowerKw"]);

    const aggregatePv = num(aggregate.powerKw);
    const aggregateLoad = num(aggregate.consumptionPowerKw ?? aggregate.loadPowerKw);
    const aggregateGrid = num(aggregate.gridPowerKw);
    const aggregateImport = num(aggregate.gridImportPowerKw ?? aggregate.purchasePowerKw);
    const aggregateExport = num(aggregate.gridExportPowerKw);
    const aggregateSoc = num(aggregate.batterySoc);
    const aggregateCharge = num(aggregate.chargePowerKw);
    const aggregateDischarge = num(aggregate.dischargePowerKw);

    return {
      pv: firstKnown(telemetry?.powerKw, telemetry?.pvPowerKw, plantPv, aggregatePv !== 0 ? aggregatePv : null),
      load: firstKnown(telemetry?.consumptionPowerKw, telemetry?.loadPowerKw, plantLoad, aggregateLoad !== 0 ? aggregateLoad : null),
      gridNet: firstKnown(telemetry?.gridPowerKw, plantGrid, aggregateGrid !== 0 ? aggregateGrid : null),
      gridImport: firstKnown(telemetry?.purchasePowerKw, telemetry?.gridImportPowerKw, plantImport, aggregateImport !== 0 ? aggregateImport : null),
      gridExport: firstKnown(telemetry?.gridExportPowerKw, plantExport, aggregateExport !== 0 ? aggregateExport : null),
      soc: firstKnown(telemetry?.batterySoc, bessSoc, aggregateSoc !== 0 ? aggregateSoc : null),
      charge: firstKnown(telemetry?.chargePowerKw, bessCharge, aggregateCharge !== 0 ? aggregateCharge : null),
      discharge: firstKnown(telemetry?.dischargePowerKw, bessDischarge, aggregateDischarge !== 0 ? aggregateDischarge : null),
    };
  }

  function setMetric(cell, value, label, digits = 1) {
    if (!cell) return;
    const strong = cell.querySelector("strong");
    const small = cell.querySelector("small");
    if (strong) strong.textContent = value === null ? "-" : fmt(value, "kW", digits);
    if (small) small.textContent = value === null ? "No live sample" : label;
  }

  function setGrid(cell, metrics) {
    if (!cell) return;
    const strong = cell.querySelector("strong");
    const small = cell.querySelector("small");
    if (!strong || !small) return;

    if (metrics.gridImport !== null && metrics.gridImport > 0.01) {
      strong.textContent = `Import ${fmt(metrics.gridImport, "kW", 1)}`;
      small.textContent = metrics.gridExport !== null ? `Export ${fmt(metrics.gridExport, "kW", 1)}` : "From grid";
      return;
    }
    if (metrics.gridExport !== null && metrics.gridExport > 0.01) {
      strong.textContent = `Export ${fmt(metrics.gridExport, "kW", 1)}`;
      small.textContent = "To grid";
      return;
    }
    if (metrics.gridNet !== null) {
      strong.textContent = fmt(Math.abs(metrics.gridNet), "kW", 1);
      small.textContent = "Net grid flow";
      return;
    }
    strong.textContent = "-";
    small.textContent = "No live grid sample";
  }

  function setBattery(cell, system, metrics) {
    if (!cell || !(num(system?.kwh) > 0)) return;
    const soc = cell.querySelector(".plive-soc strong");
    const bar = cell.querySelector(".plive-socbar i");
    const direction = cell.querySelector(".plive-battmeta strong");
    const power = cell.querySelector(".plive-battmeta small");

    if (soc) soc.textContent = metrics.soc === null ? "-" : fmt(metrics.soc, "%", 0);
    if (bar) bar.style.width = metrics.soc === null ? "0%" : `${Math.max(0, Math.min(100, metrics.soc))}%`;

    if (metrics.charge !== null && metrics.charge > 0.01) {
      if (direction) direction.textContent = "Charging";
      if (power) power.textContent = fmt(metrics.charge, "kW", 1);
      return;
    }
    if (metrics.discharge !== null && metrics.discharge > 0.01) {
      if (direction) direction.textContent = "Discharging";
      if (power) power.textContent = fmt(metrics.discharge, "kW", 1);
      return;
    }
    if (direction) direction.textContent = metrics.soc === null ? "No live BESS sample" : "Idle";
    if (power) power.textContent = metrics.soc === null ? "" : "0 kW";
  }

  function correctRows() {
    if (typeof state !== "undefined" && state.view !== "monitoring") return;
    const systemsById = new Map(workspaceSystems().map((system) => [String(system.id), system]));

    document.querySelectorAll(".plive-row[data-smv2-open]").forEach((row) => {
      const system = systemsById.get(String(row.dataset.smv2Open || ""));
      if (!system || !Array.isArray(system.fusionSolarPlants) || !system.fusionSolarPlants.length) return;

      const metrics = fusionMetrics(system);
      const cells = [...row.children];
      setMetric(cells[3], metrics.pv, "Live PV");
      setMetric(cells[4], metrics.load, "Site demand");
      setGrid(cells[5], metrics);
      setBattery(cells[6], system, metrics);
    });
  }

  let scheduled = false;
  function scheduleCorrection() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      correctRows();
    });
  }

  const observer = new MutationObserver(scheduleCorrection);
  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(correctRows, 4000);
  correctRows();
})();
