(() => {
  if (window.__siteMonitoringTicketAutomation) return;
  window.__siteMonitoringTicketAutomation = true;

  const SITE_KEY = (systemId) => `monitor-site:${systemId}`;
  const pendingCandidates = new Map();
  const nativeUnshift = tickets.unshift.bind(tickets);
  const baseToast = typeof showToast === "function" ? showToast : null;
  let reconcileTimer = null;
  let inRefresh = false;

  const norm = (value) => String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  const todayLabel = () => new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
  const severityRank = { Medium: 1, High: 2, Critical: 3 };

  function nextTicketId() {
    const highest = tickets.reduce((max, ticket) => Math.max(max, Number(String(ticket.id || "").match(/(\d+)$/)?.[1] || 0)), 0);
    return `TKT-${new Date().getFullYear()}-${String(highest + 1).padStart(4, "0")}`;
  }

  function workText(item) {
    if (item && typeof item === "object") return String(item.note ?? item.text ?? item.update ?? "");
    return String(item || "");
  }

  function addWork(ticket, note) {
    if (!note) return false;
    ticket.work = Array.isArray(ticket.work) ? ticket.work : [];
    if (workText(ticket.work.at(-1)) === note) return false;
    ticket.work.push({ date: todayLabel(), note });
    return true;
  }

  function systemForTelemetry(telemetry) {
    if (!telemetry) return null;
    if (telemetry.systemId) {
      const exact = systems.find((system) => String(system.id) === String(telemetry.systemId));
      if (exact) return exact;
    }
    const wanted = norm(telemetry.name);
    if (!wanted) return null;
    const exactNames = systems.filter((system) => norm(system.name) === wanted);
    return exactNames.length === 1 ? exactNames[0] : null;
  }

  function isAutoMonitoringTicket(ticket) {
    return Boolean(ticket && ticket.source === "Monitoring alert" && ticket.autoManaged);
  }

  function queueCandidate(ticket) {
    const systemId = String(ticket.system || "");
    if (!systemId) return;
    const list = pendingCandidates.get(systemId) || [];
    list.push({
      key: ticket.monitorKey || ticket.issue,
      issue: ticket.issue || "Monitoring issue",
      concern: ticket.concern || "Medium",
      note: Array.isArray(ticket.work) ? workText(ticket.work.at(-1)) : "",
      monitorData: ticket.monitorData || {},
    });
    pendingCandidates.set(systemId, list);
    scheduleReconcile();
  }

  tickets.unshift = function siteAwareTicketUnshift(...items) {
    const normal = [];
    items.forEach((item) => {
      if (isAutoMonitoringTicket(item)) queueCandidate(item);
      else normal.push(item);
    });
    if (normal.length) nativeUnshift(...normal);
    return tickets.length;
  };

  if (baseToast) {
    const wrappedToast = function wrappedMonitoringToast(message, ...rest) {
      if (/monitoring tickets? created automatically/i.test(String(message || ""))) return;
      return baseToast(message, ...rest);
    };
    try { showToast = wrappedToast; } catch {}
    window.showToast = wrappedToast;
  }

  function migrateExistingTickets() {
    let changed = false;
    systems.forEach((system) => {
      const active = tickets
        .filter((ticket) => isAutoMonitoringTicket(ticket) && ticket.system === system.id && ticket.status !== "Completed")
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
      if (!active.length) return;
      const keeper = active[0];
      const targetKey = SITE_KEY(system.id);
      if (keeper.monitorKey !== targetKey) { keeper.monitorKey = targetKey; changed = true; }
      if (keeper.monitorScope !== "site") { keeper.monitorScope = "site"; changed = true; }
      for (const duplicate of active.slice(1)) {
        duplicate.status = "Completed";
        duplicate.workflow = "";
        addWork(duplicate, `Automatically consolidated into ${keeper.id}; monitoring tickets are now managed per site.`);
        duplicate.monitorData = { ...(duplicate.monitorData || {}), consolidatedInto: keeper.id, consolidatedAt: new Date().toISOString() };
        changed = true;
      }
      if (active.length > 1) addWork(keeper, `${active.length} monitoring conditions were consolidated into this single site monitoring ticket.`);
    });
    if (changed) saveWorkspace();
  }

  function collectTelemetryConditions() {
    const conditions = new Map();
    const seen = new Set();
    const feeds = monitoringState?.data?.systems || [];

    const add = (systemId, condition) => {
      const list = conditions.get(systemId) || [];
      list.push(condition);
      conditions.set(systemId, list);
    };

    feeds.forEach((telemetry) => {
      const system = systemForTelemetry(telemetry);
      if (!system) return;
      seen.add(system.id);
      const provider = telemetry.provider || (telemetry._fusionSynthetic ? "FusionSolar" : "Monitoring API");
      const d = telemetry.deviceSummary || {};
      const total = Number(d.total || 0);
      const online = Number(d.online || 0);
      const offline = Number(d.offline || 0);
      const alertCount = Number(d.alert || 0);
      const status = String(telemetry.status || "").toLowerCase();

      if (total && offline === total) {
        add(system.id, { key: "connectivity", issue: "Monitoring: site offline", concern: "Critical", note: `${provider} reports all ${total} monitored devices offline.`, provider });
      } else if (offline > 0) {
        add(system.id, { key: "connectivity", issue: `Monitoring: ${offline} of ${total} devices offline`, concern: "High", note: `${provider} connectivity: ${online} online and ${offline} offline out of ${total} devices.`, provider });
      }

      if (alertCount > 0) {
        add(system.id, { key: "device-alerts", issue: `Monitoring: ${alertCount} device${alertCount === 1 ? "" : "s"} in alert state`, concern: "High", note: `${provider} reports ${alertCount} device${alertCount === 1 ? "" : "s"} in alert state.`, provider });
      }

      const activeAlerts = Array.isArray(telemetry.activeAlerts) ? telemetry.activeAlerts : [];
      if (activeAlerts.length) {
        add(system.id, { key: "active-alarms", issue: `Monitoring: ${activeAlerts.length} active alarm${activeAlerts.length === 1 ? "" : "s"}`, concern: "High", note: `${provider} reports ${activeAlerts.length} active alarm${activeAlerts.length === 1 ? "" : "s"}.`, provider });
      }

      if ((status.includes("non-operational") || status === "offline") && !(total && offline === total)) {
        add(system.id, { key: "provider-status", issue: "Monitoring: site offline", concern: "Critical", note: `${provider} reports the site as non-operational.`, provider });
      } else if ((status.includes("attention") || status === "alert" || status === "warning") && offline === 0 && alertCount === 0 && !activeAlerts.length) {
        add(system.id, { key: "provider-status", issue: "Monitoring: site requires attention", concern: "High", note: `${provider} reports the site as requiring attention.`, provider });
      }
    });

    const fusionDetails = window.fusionSolarMonitoring?.detailCache;
    if (fusionDetails instanceof Map) {
      fusionDetails.forEach((detail, systemId) => {
        if (!systems.some((system) => system.id === systemId)) return;
        const alarms = Array.isArray(detail?.alarms) ? detail.alarms.filter((alarm) => alarm?.active !== false) : [];
        if (alarms.length) {
          seen.add(systemId);
          alarms.forEach((alarm, index) => add(systemId, {
            key: `fusion-alarm:${alarm.id || alarm.code || alarm.name || index}`,
            issue: `FusionSolar alarm: ${alarm.name || alarm.code || "Active alarm"}`,
            concern: Number(alarm.level) === 2 || [2, 3].includes(Number(alarm.impact)) ? "Critical" : "High",
            note: `FusionSolar active alarm${alarm.deviceSn ? ` on device ${alarm.deviceSn}` : ""}${alarm.code ? ` (${alarm.code})` : ""}${alarm.description ? `: ${alarm.description}` : "."}`,
            provider: "FusionSolar",
          }));
        }
      });
    }

    return { conditions, seen };
  }

  function dedupeConditions(items) {
    const map = new Map();
    items.forEach((item) => {
      const key = String(item.key || item.issue || item.note || Math.random());
      const current = map.get(key);
      if (!current || (severityRank[item.concern] || 0) > (severityRank[current.concern] || 0)) map.set(key, item);
    });
    return [...map.values()];
  }

  function upsertSiteTicket(system, conditions) {
    const siteKey = SITE_KEY(system.id);
    let ticket = tickets.find((item) => isAutoMonitoringTicket(item) && item.system === system.id && item.status !== "Completed");
    let created = false;

    if (!ticket) {
      ticket = {
        id: nextTicketId(),
        system: system.id,
        source: "Monitoring alert",
        issue: "Monitoring issue",
        concern: "High",
        found: todayLabel(),
        opened: todayLabel(),
        status: "Open",
        workflow: "",
        pm: false,
        approver: "",
        owner: system.contractor || "Blue Energy Africa",
        work: [],
        files: [],
        emailHistory: [],
        autoManaged: true,
        monitorScope: "site",
        monitorKey: siteKey,
        monitorData: { firstSeen: new Date().toISOString() },
      };
      nativeUnshift(ticket);
      created = true;
    }

    const unique = dedupeConditions(conditions);
    const concern = unique.reduce((best, item) => (severityRank[item.concern] || 0) > (severityRank[best] || 0) ? item.concern : best, "Medium");
    const issue = unique.length === 1 ? unique[0].issue : `Monitoring: ${unique.length} active issues`;
    const providers = [...new Set(unique.map((item) => item.provider).filter(Boolean))];
    const note = `Automatic monitoring update${providers.length ? ` (${providers.join(" + ")})` : ""}: ${unique.map((item) => item.note || item.issue).join(" | ")}`;

    let changed = created;
    if (ticket.monitorKey !== siteKey) { ticket.monitorKey = siteKey; changed = true; }
    if (ticket.monitorScope !== "site") { ticket.monitorScope = "site"; changed = true; }
    if (ticket.issue !== issue) { ticket.issue = issue; changed = true; }
    if (ticket.concern !== concern) { ticket.concern = concern; changed = true; }
    if (addWork(ticket, note)) changed = true;
    ticket.monitorData = {
      ...(ticket.monitorData || {}),
      conditions: unique.map((item) => ({ key: item.key, issue: item.issue, concern: item.concern, provider: item.provider })),
      providers,
      lastSeen: new Date().toISOString(),
    };
    return { ticket, created, changed };
  }

  function closeRecoveredTicket(system) {
    const ticket = tickets.find((item) => isAutoMonitoringTicket(item) && item.system === system.id && item.status !== "Completed");
    if (!ticket) return false;
    ticket.status = "Completed";
    ticket.workflow = "";
    addWork(ticket, "Monitoring has returned to normal for this site. The automatic site monitoring ticket was closed.");
    ticket.monitorData = { ...(ticket.monitorData || {}), recoveredAt: new Date().toISOString() };
    return true;
  }

  function reconcile() {
    clearTimeout(reconcileTimer);
    reconcileTimer = null;

    const { conditions: telemetryConditions, seen } = collectTelemetryConditions();
    const allSystemIds = new Set([...pendingCandidates.keys(), ...telemetryConditions.keys()]);
    let changed = false;
    let created = 0;

    allSystemIds.forEach((systemId) => {
      const system = systems.find((item) => item.id === systemId);
      if (!system) return;
      const items = [
        ...(pendingCandidates.get(systemId) || []).map((item) => ({ ...item, provider: item.provider || "Deye" })),
        ...(telemetryConditions.get(systemId) || []),
      ];
      const unique = dedupeConditions(items);
      if (!unique.length) return;
      const result = upsertSiteTicket(system, unique);
      changed ||= result.changed;
      created += result.created ? 1 : 0;
    });

    seen.forEach((systemId) => {
      if (allSystemIds.has(systemId)) return;
      const system = systems.find((item) => item.id === systemId);
      if (system && closeRecoveredTicket(system)) changed = true;
    });

    pendingCandidates.clear();

    if (changed) {
      saveWorkspace();
      if (typeof state !== "undefined" && state.view === "tickets" && typeof renderTickets === "function") renderTickets();
    }
    if (created && baseToast) baseToast(`${created} site monitoring ticket${created === 1 ? "" : "s"} opened automatically.`);
  }

  function scheduleReconcile() {
    clearTimeout(reconcileTimer);
    reconcileTimer = setTimeout(reconcile, inRefresh ? 80 : 0);
  }

  migrateExistingTickets();

  const baseRefresh = typeof refreshMonitoring === "function" ? refreshMonitoring : null;
  if (baseRefresh) {
    const wrappedRefresh = async function siteTicketMonitoringRefresh(...args) {
      inRefresh = true;
      pendingCandidates.clear();
      try {
        return await baseRefresh.apply(this, args);
      } finally {
        inRefresh = false;
        reconcile();
      }
    };
    try { refreshMonitoring = wrappedRefresh; } catch {}
    window.refreshMonitoring = wrappedRefresh;
  }

  setTimeout(reconcile, 250);

  // Keep the monitoring feeds and ticket state moving without requiring a manual
  // Refresh data click. Only overview endpoints are refreshed here; detailed
  // device history remains on-demand to respect provider rate limits.
  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    if (typeof refreshMonitoring !== "function") return;
    refreshMonitoring().catch(() => {});
  }, 5 * 60 * 1000);
})();
