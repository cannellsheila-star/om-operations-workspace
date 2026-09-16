(() => {
  const VERSION = "site-monitoring-tickets-v1-20260916";
  const severityRank = { Medium: 1, High: 2, Critical: 3 };
  let syncing = false;
  let lastSyncSignature = "";

  const todayLabel = () => new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
  const isoNow = () => new Date().toISOString();
  const num = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const unique = (items) => [...new Set(items.filter(Boolean))];

  function ticketNumber(ticket) {
    return Number(String(ticket?.id || "").match(/(\d+)$/)?.[1] || Number.MAX_SAFE_INTEGER);
  }

  function nextTicketId() {
    const highest = tickets.reduce((max, ticket) => Math.max(max, Number(String(ticket.id || "").match(/(\d+)$/)?.[1] || 0)), 0);
    return `TKT-${new Date().getFullYear()}-${String(highest + 1).padStart(4, "0")}`;
  }

  function workText(item) {
    if (item === null || item === undefined) return "";
    if (typeof item === "string") return item;
    return String(item.note ?? item.text ?? item.update ?? "");
  }

  function addWork(ticket, note) {
    const text = String(note || "").trim();
    if (!text) return false;
    ticket.work = Array.isArray(ticket.work) ? ticket.work : [];
    const exists = ticket.work.some((item) => workText(item) === text);
    if (exists) return false;
    ticket.work.push({ date: todayLabel(), note: text });
    return true;
  }

  function telemetryFor(system) {
    const feeds = monitoringState?.data?.systems || [];
    return feeds.find((item) => String(item.systemId || "") === String(system.id)) || null;
  }

  function concernForStatus(status) {
    const value = String(status || "").toLowerCase();
    if (value.includes("non-operational") || value.includes("offline") || value.includes("critical")) return "Critical";
    if (value.includes("attention") || value.includes("alert") || value.includes("warning") || value.includes("degraded")) return "High";
    return null;
  }

  function monitoringIssues(system, telemetry, conditionTickets) {
    const issues = [];

    conditionTickets.forEach((ticket) => {
      issues.push({
        key: ticket.monitorKey || `legacy:${ticket.id}`,
        issue: ticket.issue || "Monitoring alert",
        concern: ticket.concern || "High",
        note: workText((ticket.work || []).at(-1)) || ticket.issue || "Monitoring condition detected.",
      });
    });

    if (telemetry) {
      const provider = telemetry.provider || (telemetry._fusionSynthetic ? "FusionSolar" : "Monitoring");
      const status = String(telemetry.status || "");
      const d = telemetry.deviceSummary || {};
      const total = Number(d.total || 0);
      const online = Number(d.online || 0);
      const offline = Number(d.offline || 0);
      const alertCount = Number(d.alert || 0);
      const activeAlerts = Array.isArray(telemetry.activeAlerts) ? telemetry.activeAlerts.length : 0;

      if (total && offline === total) {
        issues.push({
          key: `site-status:${system.id}:offline`,
          issue: "Monitoring: Site offline",
          concern: "Critical",
          note: `${provider} reports all ${total} monitored devices offline.`,
        });
      } else if (offline > 0) {
        issues.push({
          key: `site-status:${system.id}:devices`,
          issue: `Monitoring: ${offline} of ${total} devices offline`,
          concern: "High",
          note: `${provider} connectivity: ${online} online and ${offline} offline out of ${total} devices.`,
        });
      }

      const alarmTotal = Math.max(alertCount, activeAlerts);
      if (alarmTotal > 0) {
        issues.push({
          key: `site-status:${system.id}:alarms`,
          issue: `Monitoring: ${alarmTotal} active alarm${alarmTotal === 1 ? "" : "s"}`,
          concern: "High",
          note: `${provider} reports ${alarmTotal} active monitoring alarm${alarmTotal === 1 ? "" : "s"}.`,
        });
      }

      const statusConcern = concernForStatus(status);
      if (statusConcern && !issues.some((item) => item.concern === "Critical" && statusConcern !== "Critical")) {
        const isOffline = statusConcern === "Critical";
        issues.push({
          key: `site-status:${system.id}:provider`,
          issue: isOffline ? "Monitoring: Site offline" : "Monitoring: Site attention required",
          concern: statusConcern,
          note: `${provider} reports the site status as ${status || "attention required"}.`,
        });
      }
    }

    const byKey = new Map();
    issues.forEach((item) => {
      if (!byKey.has(item.key)) byKey.set(item.key, item);
    });
    return [...byKey.values()];
  }

  function strongestConcern(issues) {
    return issues.reduce((best, item) => (severityRank[item.concern] || 0) > (severityRank[best] || 0) ? item.concern : best, "Medium");
  }

  function issueTitle(issues) {
    if (!issues.length) return "Monitoring: Site healthy";
    if (issues.length === 1) return issues[0].issue;
    const critical = issues.filter((item) => item.concern === "Critical").length;
    return critical
      ? `Monitoring: ${issues.length} active site issues (${critical} critical)`
      : `Monitoring: ${issues.length} active site issues`;
  }

  function createSiteTicket(system, issues) {
    const concern = strongestConcern(issues);
    const ticket = {
      id: nextTicketId(),
      system: system.id,
      source: "Monitoring alert",
      issue: issueTitle(issues),
      concern,
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
      siteManaged: true,
      monitorKey: `monitor:${system.id}:site`,
      monitorData: {
        firstSeen: isoNow(),
        lastSeen: isoNow(),
        siteTicketVersion: VERSION,
        activeConditions: issues.map((item) => item.key),
      },
    };
    issues.forEach((item) => addWork(ticket, item.note));
    tickets.unshift(ticket);
    return ticket;
  }

  function mergeTicketInto(canonical, duplicate) {
    (duplicate.work || []).forEach((item) => addWork(canonical, workText(item)));
    canonical.files = unique([...(canonical.files || []), ...(duplicate.files || [])]);
    canonical.emailHistory = [...(canonical.emailHistory || []), ...(duplicate.emailHistory || [])];
  }

  function syncSite(system, { allowClose = false } = {}) {
    const telemetry = telemetryFor(system);
    const activeMonitoring = tickets
      .filter((ticket) => ticket.system === system.id && ticket.status !== "Completed" && ticket.autoManaged && (ticket.source === "Monitoring alert" || String(ticket.monitorKey || "").startsWith(`monitor:${system.id}:`)))
      .sort((a, b) => ticketNumber(a) - ticketNumber(b));

    const existingSite = activeMonitoring.find((ticket) => ticket.siteManaged || ticket.monitorKey === `monitor:${system.id}:site`) || null;
    const conditionTickets = activeMonitoring.filter((ticket) => ticket !== existingSite);
    const issues = monitoringIssues(system, telemetry, conditionTickets);
    let canonical = existingSite;
    let changed = false;
    let created = false;

    if (issues.length && !canonical) {
      if (conditionTickets.length) {
        canonical = conditionTickets.shift();
        canonical.siteManaged = true;
        canonical.monitorKey = `monitor:${system.id}:site`;
        canonical.source = "Monitoring alert";
        canonical.status = "Open";
        canonical.monitorData = { ...(canonical.monitorData || {}), firstSeen: canonical.monitorData?.firstSeen || isoNow(), siteTicketVersion: VERSION };
        changed = true;
      } else {
        canonical = createSiteTicket(system, issues);
        created = true;
        changed = true;
      }
    }

    if (canonical && issues.length) {
      const nextIssue = issueTitle(issues);
      const nextConcern = strongestConcern(issues);
      if (canonical.issue !== nextIssue) { canonical.issue = nextIssue; changed = true; }
      if (canonical.concern !== nextConcern) { canonical.concern = nextConcern; changed = true; }
      if (canonical.status === "Completed") { canonical.status = "Open"; changed = true; }
      canonical.siteManaged = true;
      canonical.autoManaged = true;
      canonical.monitorKey = `monitor:${system.id}:site`;
      canonical.source = "Monitoring alert";
      canonical.monitorData = {
        ...(canonical.monitorData || {}),
        lastSeen: isoNow(),
        siteTicketVersion: VERSION,
        activeConditions: issues.map((item) => item.key),
      };
      issues.forEach((item) => { if (addWork(canonical, item.note)) changed = true; });
    }

    if (canonical) {
      const duplicates = tickets.filter((ticket) => ticket !== canonical && ticket.system === system.id && ticket.status !== "Completed" && ticket.autoManaged && (ticket.source === "Monitoring alert" || String(ticket.monitorKey || "").startsWith(`monitor:${system.id}:`)));
      duplicates.forEach((duplicate) => {
        mergeTicketInto(canonical, duplicate);
        const index = tickets.indexOf(duplicate);
        if (index >= 0) tickets.splice(index, 1);
        changed = true;
      });
    }

    if (allowClose && canonical && !issues.length) {
      canonical.status = "Completed";
      canonical.workflow = "";
      canonical.monitorData = { ...(canonical.monitorData || {}), activeConditions: [], recoveredAt: isoNow(), siteTicketVersion: VERSION };
      if (addWork(canonical, "Monitoring reports the site healthy again. Site monitoring ticket automatically closed.")) changed = true;
      changed = true;
    }

    return { changed, created, ticket: canonical };
  }

  function syncAll(options = {}) {
    if (syncing || typeof systems === "undefined" || typeof tickets === "undefined") return;
    syncing = true;
    try {
      let changed = false;
      let created = 0;
      systems.forEach((system) => {
        const result = syncSite(system, options);
        changed ||= result.changed;
        created += result.created ? 1 : 0;
      });

      const signature = tickets
        .filter((ticket) => ticket.status !== "Completed" && ticket.siteManaged)
        .map((ticket) => `${ticket.system}:${ticket.id}:${ticket.issue}:${ticket.concern}`)
        .sort()
        .join("|");

      if (changed) saveWorkspace();
      if (created && signature !== lastSyncSignature && typeof showToast === "function") {
        showToast(`${created} site monitoring ticket${created === 1 ? "" : "s"} opened automatically.`);
      }
      lastSyncSignature = signature;

      if (changed && typeof state !== "undefined" && state.view === "tickets" && typeof renderTickets === "function") renderTickets();
    } finally {
      syncing = false;
    }
  }

  const providerRefresh = typeof refreshMonitoring === "function" ? refreshMonitoring : null;
  if (providerRefresh) {
    refreshMonitoring = async function refreshMonitoringWithSiteTickets(...args) {
      const result = await providerRefresh.apply(this, args);
      syncAll({ allowClose: true });
      return result;
    };
  }

  // Migrate existing condition-based monitoring tickets as soon as the workspace is ready.
  setTimeout(() => syncAll({ allowClose: false }), 400);
  setTimeout(() => syncAll({ allowClose: false }), 2500);

  // Catch provider detail/status updates that occur outside the main refresh cycle.
  setInterval(() => syncAll({ allowClose: false }), 15000);

  window.siteMonitoringTickets = { sync: syncAll, version: VERSION };
})();
