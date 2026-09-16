(() => {
  const SITE_PREFIX = "monitor-site:";
  let refreshPromise = null;
  let lastToast = 0;

  const num = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const norm = (value) => String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  const todayLabel = () => new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
  const nowIso = () => new Date().toISOString();

  function nextTicketId() {
    const highest = tickets.reduce((max, ticket) => Math.max(max, Number(String(ticket.id || "").match(/(\d+)$/)?.[1] || 0)), 0);
    return `TKT-${new Date().getFullYear()}-${String(highest + 1).padStart(4, "0")}`;
  }

  function addWork(ticket, note) {
    if (!note) return false;
    ticket.work = Array.isArray(ticket.work) ? ticket.work : [];
    const last = ticket.work.at(-1);
    const lastText = String(last && typeof last === "object" ? (last.note ?? last.text ?? last.update ?? "") : last || "");
    if (lastText === note) return false;
    ticket.work.push({ date: todayLabel(), note });
    return true;
  }

  function severityLabel(level) {
    return level >= 3 ? "Critical" : level >= 2 ? "High" : "Medium";
  }

  function siteKey(system) {
    return `${SITE_PREFIX}${system.id}`;
  }

  function siteTicket(system) {
    return tickets.find((ticket) => ticket.monitorKey === siteKey(system) && ticket.status !== "Completed") || null;
  }

  function oldMonitoringTickets(system) {
    return tickets.filter((ticket) =>
      ticket.autoManaged &&
      ticket.source === "Monitoring alert" &&
      ticket.system === system.id &&
      ticket.monitorKey !== siteKey(system) &&
      ticket.status !== "Completed"
    );
  }

  function closeLegacyTickets(system, replacementId = "") {
    let changed = false;
    oldMonitoringTickets(system).forEach((ticket) => {
      ticket.status = "Completed";
      ticket.workflow = "";
      ticket.monitorData = { ...(ticket.monitorData || {}), consolidatedAt: nowIso(), consolidatedInto: replacementId || null };
      addWork(ticket, replacementId
        ? `Automatically consolidated into site monitoring ticket ${replacementId}.`
        : "Automatically consolidated into the site-level monitoring workflow.");
      changed = true;
    });
    return changed;
  }

  function issueSummary(issues) {
    return issues.map((issue) => issue.text).join(" | ");
  }

  function ensureSiteTicket(system, issues, provider = "Monitoring") {
    if (!issues.length) return { created: false, changed: false, ticket: null };
    const key = siteKey(system);
    const title = `Monitoring: ${system.name}`;
    const severity = Math.max(...issues.map((issue) => issue.severity || 1));
    const concern = severityLabel(severity);
    const summary = issueSummary(issues);
    let ticket = siteTicket(system);
    let created = false;
    let changed = false;

    if (!ticket) {
      ticket = {
        id: nextTicketId(),
        system: system.id,
        source: "Monitoring alert",
        issue: title,
        concern,
        found: todayLabel(),
        opened: todayLabel(),
        status: "Open",
        workflow: "",
        pm: false,
        approver: "",
        owner: system.contractor || "Blue Energy Africa",
        work: [{ date: todayLabel(), note: summary }],
        files: [],
        emailHistory: [],
        autoManaged: true,
        monitorKey: key,
        monitorData: {
          provider,
          currentIssues: issues,
          firstSeen: nowIso(),
          lastSeen: nowIso(),
        },
      };
      tickets.unshift(ticket);
      created = true;
      changed = true;
    } else {
      if (ticket.issue !== title) { ticket.issue = title; changed = true; }
      if (ticket.concern !== concern) { ticket.concern = concern; changed = true; }
      if (ticket.status !== "Open") { ticket.status = "Open"; changed = true; }
      if (addWork(ticket, summary)) changed = true;
      ticket.monitorData = {
        ...(ticket.monitorData || {}),
        provider,
        currentIssues: issues,
        lastSeen: nowIso(),
        recoveredAt: null,
      };
    }

    if (closeLegacyTickets(system, ticket.id)) changed = true;
    return { created, changed, ticket };
  }

  function closeSiteTicket(system, provider = "Monitoring") {
    const ticket = siteTicket(system);
    let changed = closeLegacyTickets(system, ticket?.id || "");
    if (!ticket || !ticket.autoManaged) return changed;
    ticket.status = "Completed";
    ticket.workflow = "";
    addWork(ticket, `${provider} reports the site healthy again. All monitored alarms and fault conditions have cleared. Ticket closed automatically.`);
    ticket.monitorData = {
      ...(ticket.monitorData || {}),
      currentIssues: [],
      lastSeen: nowIso(),
      recoveredAt: nowIso(),
    };
    return true;
  }

  function systemForTelemetry(telemetry) {
    const exact = systems.find((system) => String(system.id) === String(telemetry?.systemId || ""));
    if (exact) return exact;
    const target = norm(telemetry?.name);
    if (!target) return null;
    return systems.find((system) => norm(system.name) === target) || null;
  }

  function productionWindow(telemetry) {
    const irr = num(telemetry?.irradiance);
    if (irr !== null && irr >= 50) return true;
    try {
      const hour = Number(new Intl.DateTimeFormat("en-GB", {
        timeZone: telemetry?.stationTimezone || "Africa/Johannesburg",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(new Date()));
      return hour >= 8 && hour < 17;
    } catch {
      return false;
    }
  }

  function deyeIssues(telemetry) {
    const issues = [];
    const d = telemetry?.deviceSummary || {};
    const total = Number(d.total || 0);
    const online = Number(d.online || 0);
    const offline = Number(d.offline || 0);
    const alertState = Number(d.alert || 0);

    if (total > 0 && offline >= total) {
      issues.push({ severity: 3, type: "connectivity", text: `Site offline: all ${total} monitored devices are offline.` });
    } else if (offline > 0) {
      issues.push({ severity: 2, type: "connectivity", text: `${offline} of ${total} monitored devices offline (${online} online).` });
    }
    if (alertState > 0) {
      issues.push({ severity: 2, type: "device-alert", text: `${alertState} device${alertState === 1 ? " is" : "s are"} reporting an alert state.` });
    }

    (telemetry?.alerts || telemetry?.activeAlerts || []).forEach((alarm) => {
      if (alarm?.active === false) return;
      const severity = num(alarm?.level) === 2 || [2, 3].includes(num(alarm?.impact)) ? 3 : 2;
      const name = alarm?.name || alarm?.code || "Active alarm";
      const where = alarm?.deviceSn ? ` on device ${alarm.deviceSn}` : "";
      issues.push({ severity, type: "alarm", text: `${name}${where}${alarm?.code && alarm?.name ? ` (${alarm.code})` : ""}.` });
    });

    const power = num(telemetry?.powerKw);
    if (total > 0 && online > 0 && power !== null && power <= 0.02 && productionWindow(telemetry)) {
      issues.push({ severity: 2, type: "production", text: `No solar production during the production window (${power.toFixed(2)} kW reported).` });
    }
    return issues;
  }

  function syncDeye(payload) {
    let changed = false;
    let created = 0;
    const seen = new Set();

    (payload?.systems || []).forEach((telemetry) => {
      const system = systemForTelemetry(telemetry);
      if (!system) return;
      seen.add(system.id);
      const issues = deyeIssues(telemetry);
      if (issues.length) {
        const result = ensureSiteTicket(system, issues, telemetry.provider || "Deye");
        changed ||= result.changed;
        created += result.created ? 1 : 0;
        const nextStatus = issues.some((issue) => issue.severity >= 3) ? "Non-operational" : "Attention required";
        if (system.status !== nextStatus) { system.status = nextStatus; changed = true; }
      } else {
        if (closeSiteTicket(system, telemetry.provider || "Deye")) changed = true;
        if (system.status !== "Operational") { system.status = "Operational"; changed = true; }
      }
    });

    if (changed) saveWorkspace();
    if (created && Date.now() - lastToast > 4000) {
      lastToast = Date.now();
      showToast(`${created} site monitoring ticket${created === 1 ? "" : "s"} opened automatically.`);
    }
  }

  function fusionIssuesFromDetail(detail) {
    const issues = [];
    const alarmCount = Number(detail?.aggregate?.alarmCount ?? detail?.alarms?.length ?? 0);
    if (alarmCount > 0) {
      issues.push({ severity: 2, type: "alarm", text: `${alarmCount} active FusionSolar alarm${alarmCount === 1 ? "" : "s"}.` });
    }
    (detail?.alarms || []).forEach((alarm) => {
      const active = alarm?.active ?? alarm?.status !== "cleared";
      if (!active) return;
      const label = alarm?.name || alarm?.alarmName || alarm?.code || "FusionSolar alarm";
      issues.push({ severity: 2, type: "alarm-detail", text: `${label}${alarm?.deviceName ? ` on ${alarm.deviceName}` : ""}.` });
    });
    return issues;
  }

  function syncFusionAvailable() {
    const cache = window.fusionSolarMonitoring?.detailCache;
    if (!(cache instanceof Map)) return;
    let changed = false;
    let created = 0;
    systems.forEach((system) => {
      if (!Array.isArray(system.fusionSolarPlants) || !system.fusionSolarPlants.length) return;
      const detail = cache.get(system.id);
      if (!detail) return;
      const issues = fusionIssuesFromDetail(detail);
      if (issues.length) {
        const result = ensureSiteTicket(system, issues, "FusionSolar");
        changed ||= result.changed;
        created += result.created ? 1 : 0;
        if (system.status === "Operational") { system.status = "Attention required"; changed = true; }
      } else {
        if (closeSiteTicket(system, "FusionSolar")) changed = true;
        if (system.status !== "Operational") { system.status = "Operational"; changed = true; }
      }
    });
    if (changed) saveWorkspace();
    if (created && Date.now() - lastToast > 4000) {
      lastToast = Date.now();
      showToast(`${created} site monitoring ticket${created === 1 ? "" : "s"} opened automatically.`);
    }
  }

  function consolidateExisting() {
    let changed = false;
    systems.forEach((system) => {
      const legacy = oldMonitoringTickets(system);
      if (!legacy.length) return;
      const issues = legacy.map((ticket) => ({
        severity: ticket.concern === "Critical" ? 3 : ticket.concern === "High" ? 2 : 1,
        type: "existing",
        text: String(ticket.issue || "Monitoring issue").replace(/^Monitoring:\s*/i, "") + ".",
      }));
      const result = ensureSiteTicket(system, issues, "Monitoring");
      changed ||= result.changed;
    });
    if (changed) saveWorkspace();
  }

  // Replace the old condition-per-ticket refresh with a site-per-ticket refresh.
  const siteRefreshMonitoring = function siteRefreshMonitoring() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      monitoringState.status = "loading";
      monitoringState.message = "";
      if (state.view === "monitoring") renderMonitoring();
      try {
        const response = await fetch("/api/monitoring", { headers: { Accept: "application/json" }, cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || "The monitoring feed could not be reached.");
        monitoringState.data = payload;
        monitoringState.message = payload.message || "";
        monitoringState.status = "ready";
        syncDeye(payload);
      } catch (error) {
        monitoringState.data = null;
        monitoringState.message = error?.message || "The monitoring feed could not be reached.";
        monitoringState.status = "error";
      } finally {
        refreshPromise = null;
      }
      syncFusionAvailable();
      if (state.view === "monitoring") renderMonitoring();
      return monitoringState.data;
    })();
    return refreshPromise;
  };

  window.refreshMonitoring = siteRefreshMonitoring;
  try { refreshMonitoring = siteRefreshMonitoring; } catch {}

  consolidateExisting();
  setInterval(syncFusionAvailable, 5000);
})();
