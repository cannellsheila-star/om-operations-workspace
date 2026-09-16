(() => {
  const baseRenderSystemRecord = renderSystemRecord;
  const fusionDetailCache = new Map();
  const fusionPending = new Map();

  const esc = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const num = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const norm = (value) => String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  const fmt = (value, unit = "", digits = 1) => {
    const n = num(value);
    return n === null ? "-" : `${n.toLocaleString("en-ZA", { maximumFractionDigits: digits })}${unit ? ` ${unit}` : ""}`;
  };

  function installStyles() {
    if (document.getElementById("system-record-live-monitoring-style")) return;
    const style = document.createElement("style");
    style.id = "system-record-live-monitoring-style";
    style.textContent = `
      .record-live-monitoring{padding:0!important;overflow:hidden;cursor:pointer;transition:background .12s ease,border-color .12s ease}
      .record-live-monitoring:hover{background:#f7f8fb;border-color:#cfd3dc}
      .record-live-monitoring:focus-visible{outline:2px solid #17206e;outline-offset:2px}
      .record-live-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;border-bottom:1px solid #e8e8ed}
      .record-live-head h3{margin:0;font-size:16px}
      .record-live-link{font-size:11px;color:#5f6377;font-weight:700;white-space:nowrap}
      .record-live-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}
      .record-live-metric{display:grid;gap:5px;padding:15px 16px;border-right:1px solid #ededf1}
      .record-live-metric:last-child{border-right:0}
      .record-live-metric span{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#72768a;font-weight:700}
      .record-live-metric strong{font-size:18px;font-weight:600;color:#10133f}
      .record-live-status{display:inline-flex;align-items:center;gap:7px}
      .record-live-dot{width:8px;height:8px;border-radius:50%;background:#9ca3af;flex:0 0 auto}
      .record-live-dot.live{background:#17765c}.record-live-dot.warn{background:#b26b00}.record-live-dot.bad{background:#c23d50}
      .record-live-note{padding:9px 16px;border-top:1px solid #ededf1;color:#777a8d;font-size:11px}
      @media(max-width:700px){.record-live-grid{grid-template-columns:1fr}.record-live-metric{border-right:0;border-bottom:1px solid #ededf1}.record-live-metric:last-child{border-bottom:0}}
    `;
    document.head.appendChild(style);
  }

  function nameTokens(value) {
    const ignore = new Set(["sleepover","sleep","over","gate","solar","site","plant","system","the"]);
    return norm(value).split(/\s+/).filter((x) => x && !ignore.has(x));
  }

  function matchScore(system, telemetry) {
    if (!telemetry) return 0;
    if (String(telemetry.systemId || "") === String(system.id || "")) return 100;
    const a = nameTokens(system.name), b = nameTokens(telemetry.name);
    if (!a.length || !b.length) return 0;
    const overlap = a.filter((x) => b.includes(x)).length;
    return overlap ? overlap * 10 + (a.join(" ") === b.join(" ") ? 50 : 0) - Math.abs(a.length - b.length) : 0;
  }

  function telemetryFor(system) {
    let best = null, score = 0;
    (monitoringState.data?.systems || []).forEach((candidate) => {
      const next = matchScore(system, candidate);
      if (next > score) { score = next; best = candidate; }
    });
    return score >= 9 ? best : null;
  }

  function statusTone(status) {
    const value = String(status || "").toLowerCase();
    if (value.includes("operational") || value.includes("online") || value.includes("normal")) return "live";
    if (value.includes("attention") || value.includes("warning") || value.includes("degraded")) return "warn";
    if (value.includes("offline") || value.includes("fault") || value.includes("non-operational")) return "bad";
    return "";
  }

  function monitoringSection() {
    return [...appView.querySelectorAll(".surface-title h3")]
      .find((node) => node.textContent?.trim() === "Live monitoring")
      ?.closest(".surface") || null;
  }

  function fusionDetail(system) {
    return fusionDetailCache.get(system.id) || window.fusionSolarMonitoring?.detailCache?.get?.(system.id) || null;
  }

  function snapshot(system) {
    const telemetry = telemetryFor(system);
    const detail = fusionDetail(system);
    const aggregate = detail?.aggregate || {};
    const linked = Boolean(telemetry || (Array.isArray(system.fusionSolarPlants) && system.fusionSolarPlants.length));
    return {
      linked,
      status: telemetry?.status || aggregate.status || (linked ? system.status : "Not linked"),
      generation: num(telemetry?.energyTodayKwh) ?? num(aggregate.energyTodayKwh),
      soc: num(telemetry?.batterySoc) ?? num(aggregate.batterySoc),
      provider: telemetry?.provider || (Array.isArray(system.fusionSolarPlants) && system.fusionSolarPlants.length ? "FusionSolar" : system.platform || "Monitoring not linked"),
    };
  }

  function patchCard(system) {
    const section = monitoringSection();
    if (!section) return;
    installStyles();
    const data = snapshot(system);
    section.classList.add("record-live-monitoring");
    section.setAttribute("role", "button");
    section.setAttribute("tabindex", "0");
    section.dataset.systemLiveMonitoring = system.id;
    section.innerHTML = `
      <div class="record-live-head">
        <h3>Live monitoring</h3>
        <span class="record-live-link">${data.linked ? "Open monitoring →" : "View monitoring →"}</span>
      </div>
      <div class="record-live-grid">
        <div class="record-live-metric"><span>Status</span><strong class="record-live-status"><i class="record-live-dot ${statusTone(data.status)}"></i>${esc(data.status || "Not confirmed")}</strong></div>
        <div class="record-live-metric"><span>Generation today</span><strong>${fmt(data.generation, "kWh", 1)}</strong></div>
        <div class="record-live-metric"><span>BESS SOC</span><strong>${fmt(data.soc, "%", 0)}</strong></div>
      </div>
      <div class="record-live-note">${esc(data.linked ? `${data.provider} live data` : `${data.provider} | live API not connected`)}</div>`;
  }

  async function loadFusionDetail(system) {
    if (!Array.isArray(system.fusionSolarPlants) || !system.fusionSolarPlants.length) return null;
    const cached = fusionDetail(system);
    if (cached) return cached;
    if (fusionPending.has(system.id)) return fusionPending.get(system.id);

    const promise = (async () => {
      try {
        const fusion = window.fusionSolarMonitoring;
        if (!fusion?.data?.systems?.length && typeof refreshMonitoring === "function") await refreshMonitoring();
        const wanted = new Set(system.fusionSolarPlants.map(norm));
        const plants = (window.fusionSolarMonitoring?.data?.systems || []).filter((plant) => wanted.has(norm(plant.name)));
        const codes = plants.map((plant) => plant.providerStationId).filter(Boolean);
        if (!codes.length) return null;
        const response = await fetch(`/api/fusionsolar?stationCodes=${encodeURIComponent(codes.join(","))}`, { cache: "no-store", headers: { Accept: "application/json" } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) return null;
        fusionDetailCache.set(system.id, payload);
        if (window.fusionSolarMonitoring?.detailCache instanceof Map) window.fusionSolarMonitoring.detailCache.set(system.id, payload);
        return payload;
      } catch {
        return null;
      } finally {
        fusionPending.delete(system.id);
      }
    })();
    fusionPending.set(system.id, promise);
    return promise;
  }

  async function hydrate(system) {
    try {
      if (!telemetryFor(system) && typeof refreshMonitoring === "function") await refreshMonitoring();
      if (state.selectedSystem !== system.id) return;
      patchCard(system);
      if (Array.isArray(system.fusionSolarPlants) && system.fusionSolarPlants.length) {
        await loadFusionDetail(system);
        if (state.selectedSystem === system.id) patchCard(system);
      }
    } catch {}
  }

  renderSystemRecord = function renderSystemRecordWithLiveMonitoring(id) {
    const result = baseRenderSystemRecord(id);
    const system = getSystem(id);
    if (!system) return result;
    patchCard(system);
    setTimeout(() => hydrate(system), 0);
    return result;
  };

  function openSystemMonitoring(id) {
    const system = getSystem(id);
    if (!system) return;
    state.monitoringSystem = id;
    if (typeof onAction === "function") onAction("open-monitoring-site", id);
  }

  document.addEventListener("click", (event) => {
    const card = event.target.closest?.("[data-system-live-monitoring]");
    if (!card) return;
    openSystemMonitoring(card.dataset.systemLiveMonitoring);
  });

  document.addEventListener("keydown", (event) => {
    const card = event.target.closest?.("[data-system-live-monitoring]");
    if (!card || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openSystemMonitoring(card.dataset.systemLiveMonitoring);
  });
})();
