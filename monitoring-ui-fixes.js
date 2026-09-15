(() => {
  const detailCache = new Map();
  const previousFetch = window.fetch.bind(window);
  let scheduled = null;

  const num = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const slug = (value) => String(value || "site").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";

  function parseTime(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    const date = Number.isFinite(n) ? new Date(n < 100000000000 ? n * 1000 : n) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function localDateTime(value) {
    const date = value instanceof Date ? value : parseTime(value);
    return date ? date.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : "—";
  }

  function fmt(value, unit = "") {
    const n = num(value);
    return n === null ? "—" : `${n.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;
  }

  function stationPowerRows(detail) {
    return (Array.isArray(detail?.powerHistory) ? detail.powerHistory : [])
      .map((row) => ({
        time: parseTime(row.timeStamp || row.dateTime || row.time),
        pv: num(row.generationPower) === null ? null : num(row.generationPower) / 1000,
        load: num(row.consumptionPower) === null ? null : num(row.consumptionPower) / 1000,
        grid: num(row.gridPower) === null ? null : num(row.gridPower) / 1000,
        charge: num(row.chargePower) === null ? null : num(row.chargePower) / 1000,
        discharge: num(row.dischargePower) === null ? null : num(row.dischargePower) / 1000,
        soc: num(row.batterySOC),
      }))
      .filter((row) => row.time)
      .sort((a, b) => a.time - b.time);
  }

  function schedule() {
    window.clearTimeout(scheduled);
    scheduled = window.setTimeout(applyUiFixes, 50);
  }

  window.fetch = async (...args) => {
    const response = await previousFetch(...args);
    try {
      const rawUrl = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      const url = new URL(rawUrl, window.location.href);
      if (url.pathname === "/api/monitoring" && url.searchParams.get("stationId")) {
        response.clone().json().then((payload) => {
          if (!payload?.detail) return;
          const systemId = typeof state !== "undefined" ? state.monitoringSystem : "";
          if (systemId) detailCache.set(String(systemId), payload.detail);
          if (payload.detail.systemId) detailCache.set(String(payload.detail.systemId), payload.detail);
          schedule();
        }).catch(() => {});
      }
    } catch {}
    return response;
  };

  function removeStationHistoryPanel() {
    document.querySelectorAll(".surface.monitor-section .surface-title h3").forEach((heading) => {
      if (heading.textContent.trim().toLowerCase() !== "station power history") return;
      heading.closest(".surface.monitor-section")?.remove();
    });
  }

  function downloadPowerHistory(system, detail) {
    const rows = stationPowerRows(detail);
    if (!rows.length) {
      if (typeof showToast === "function") showToast("No station power history is available to export.");
      return;
    }
    const columns = ["Date/time", "Timestamp ISO", "PV kW", "Load kW", "Grid kW", "BESS charge kW", "BESS discharge kW", "BESS SOC %"];
    const csvRows = rows.map((row) => [
      localDateTime(row.time), row.time.toISOString(), row.pv, row.load, row.grid, row.charge, row.discharge, row.soc,
    ]);
    const csv = [columns.map(csvCell).join(","), ...csvRows.map((row) => row.map(csvCell).join(","))].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug(system?.name || detail?.name)}-power-history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function ensurePowerHistoryExport(system, detail) {
    const actions = document.querySelector(".ma-export-actions");
    if (!actions || actions.querySelector("[data-power-history-export]")) return;
    const button = document.createElement("button");
    button.className = "button button-muted";
    button.type = "button";
    button.dataset.powerHistoryExport = "true";
    button.textContent = "Export power history CSV";
    button.addEventListener("click", () => downloadPowerHistory(system, detail));
    actions.prepend(button);
  }

  function tooltipHtml(row, kind) {
    if (kind === "soc") {
      return `<strong>${localDateTime(row.time)}</strong><span>BESS SOC: ${fmt(row.soc, "%")}</span>`;
    }
    return `<strong>${localDateTime(row.time)}</strong><span>PV: ${fmt(row.pv, "kW")}</span><span>Load: ${fmt(row.load, "kW")}</span><span>Grid: ${fmt(row.grid, "kW")}</span><span>BESS charge: ${fmt(row.charge, "kW")}</span><span>BESS discharge: ${fmt(row.discharge, "kW")}</span>`;
  }

  function installHover(svg, rows, kind) {
    if (!svg || svg.dataset.dateTimeHover === "true" || !rows.length) return;
    svg.dataset.dateTimeHover = "true";
    const wrap = svg.closest(".ma-chart-wrap");
    if (!wrap) return;
    wrap.classList.add("ma-hover-enabled");
    const tooltip = document.createElement("div");
    tooltip.className = "ma-hover-tooltip";
    tooltip.hidden = true;
    wrap.appendChild(tooltip);

    const guide = document.createElementNS("http://www.w3.org/2000/svg", "line");
    guide.setAttribute("class", "ma-hover-guide");
    guide.setAttribute("y1", "22");
    guide.setAttribute("y2", "272");
    guide.style.display = "none";
    svg.appendChild(guide);

    svg.addEventListener("mousemove", (event) => {
      const rect = svg.getBoundingClientRect();
      if (!rect.width) return;
      const svgX = ((event.clientX - rect.left) / rect.width) * 920;
      const left = 62;
      const plotWidth = 840;
      const ratio = Math.max(0, Math.min(1, (svgX - left) / plotWidth));
      const index = Math.max(0, Math.min(rows.length - 1, Math.round(ratio * (rows.length - 1))));
      const row = rows[index];
      const pointX = left + (rows.length === 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth);
      guide.setAttribute("x1", String(pointX));
      guide.setAttribute("x2", String(pointX));
      guide.style.display = "block";
      tooltip.innerHTML = tooltipHtml(row, kind);
      tooltip.hidden = false;
      const wrapRect = wrap.getBoundingClientRect();
      const pointerX = event.clientX - wrapRect.left + wrap.scrollLeft;
      tooltip.style.left = `${Math.max(8, Math.min(pointerX + 12, wrap.scrollWidth - 230))}px`;
      tooltip.style.top = "38px";
    });

    svg.addEventListener("mouseleave", () => {
      tooltip.hidden = true;
      guide.style.display = "none";
    });
  }

  function installChartHover(detail) {
    const rows = stationPowerRows(detail);
    const section = document.querySelector('[data-monitor-analytics="charts"]');
    if (!section || !rows.length) return;
    const blocks = [...section.querySelectorAll(".ma-chart-block")];
    installHover(blocks[0]?.querySelector("svg.ma-chart"), rows, "power");
    installHover(blocks[1]?.querySelector("svg.ma-chart"), rows, "soc");
  }

  function installStyles() {
    if (document.getElementById("monitoring-ui-fixes-style")) return;
    const style = document.createElement("style");
    style.id = "monitoring-ui-fixes-style";
    style.textContent = `
      .ma-hover-enabled{position:relative}
      .ma-hover-tooltip{position:absolute;z-index:8;min-width:210px;max-width:260px;padding:10px 12px;border-radius:8px;background:rgba(15,23,42,.95);color:#fff;box-shadow:0 8px 26px rgba(0,0,0,.2);pointer-events:none;font-size:12px;line-height:1.35}
      .ma-hover-tooltip strong{display:block;margin-bottom:6px;font-size:12px}
      .ma-hover-tooltip span{display:block;white-space:nowrap}
      .ma-hover-guide{stroke:currentColor;stroke-width:1;stroke-dasharray:4 4;opacity:.45;pointer-events:none}
      .ma-chart{cursor:crosshair}
    `;
    document.head.appendChild(style);
  }

  function applyUiFixes() {
    installStyles();
    removeStationHistoryPanel();
    if (typeof state === "undefined" || state.view !== "monitoring-site") return;
    const systemId = String(state.monitoringSystem || "");
    const system = typeof getSystem === "function" ? getSystem(systemId) : null;
    const detail = detailCache.get(systemId);
    if (!system || !detail) return;
    ensurePowerHistoryExport(system, detail);
    installChartHover(detail);
  }

  document.addEventListener("click", () => window.setTimeout(applyUiFixes, 0), true);
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  installStyles();
  schedule();
})();

(() => {
  if (document.querySelector('script[data-monitoring-workspace="true"]')) return;
  const script = document.createElement("script");
  script.src = "monitoring-workspace.js";
  script.dataset.monitoringWorkspace = "true";
  document.body.appendChild(script);
})();
