const workspaceStorageKey = "om-workspace-records-v3";

function loadWorkspaceCollection(collection, fallback) {
  try {
    const savedWorkspace = JSON.parse(localStorage.getItem(workspaceStorageKey) || "{}");
    return Array.isArray(savedWorkspace[collection]) ? savedWorkspace[collection] : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function saveWorkspace() {
  localStorage.setItem(workspaceStorageKey, JSON.stringify({ systems, tickets, maintenance }));
}

const importedSystem = (details) => ({
  status: "Status not confirmed", documents: [], folder: "", monitoringUrl: "",
  monitoring: details.platform ? `${details.platform} · connection pending` : "Monitoring platform not recorded",
  alert: "Operating status has not yet been confirmed in the asset register.", updates: ["Imported from asset register"],
  contactName: "", contact: "", platform: "", systemCount: 1,
  gridSupply: "Not confirmed", tariffName: "", utilityTariff: "", tariffEffectiveDate: "", tariffAnnualIncrease: "",
  ppaRate: "", ppaAnnualIncrease: "", ppaIncreaseDate: "", ppaTenor: null,
  eassRate: "", eassAnnualIncrease: "", eassIncreaseDate: "", eassTenor: null,
  ...details,
});

const systemSeed = [
  importedSystem({ id: "SYS-001", name: "Naboom Plastiek", kwp: 434.5, kwh: 858, epc: "Sustain EPC", contractor: "Sustain EPC", offtaker: "Naboom Plastiek", contactName: "Maritz", contact: "maritz@naboomplastic.co.za", platform: "Augos", cod: "30 June 2024", nextPm: "-", lastPm: "1 February 2025", ppaRate: "R 2.05/kWh", ppaAnnualIncrease: "CPI + 1.5%", ppaIncreaseDate: "1 July 2027", ppaTenor: 10, eassRate: "R 149,767.38", eassAnnualIncrease: "CPI + 1.5%", eassIncreaseDate: "1 July 2027", eassTenor: 10 }),
  importedSystem({ id: "SYS-002", name: "Smuts Agri KBL", kwp: 217, kwh: 230, epc: "Sustain EPC", contractor: "Sustain EPC", offtaker: "Smuts Agri KBL", contactName: "Jaco du Plessis", contact: "finance@smutsbros.co.za", platform: "Augos", cod: "1 September 2024", systemCount: 2, nextPm: "24 February 2027", lastPm: "26 August 2026", ppaRate: "R 1.38/kWh", ppaAnnualIncrease: "CPI + 1.5%", ppaIncreaseDate: "1 October 2026", ppaTenor: 20, eassRate: "R 179,415.54", eassAnnualIncrease: "CPI + 1.5%", eassIncreaseDate: "1 October 2026", eassTenor: 10 }),
  importedSystem({ id: "SYS-003", name: "Smuts Agri Olyvendal", kwp: 61, kwh: 60, epc: "Sustain EPC", contractor: "Sustain EPC", offtaker: "Smuts Agri Olyvendal", contactName: "Jaco du Plessis", contact: "finance@smutsbros.co.za", platform: "Augos", cod: "1 September 2024", nextPm: "24 February 2027", lastPm: "26 August 2026", ppaRate: "R 1.44/kWh", ppaAnnualIncrease: "CPI + 1.5%", ppaIncreaseDate: "1 October 2026", ppaTenor: 20, eassRate: "R 10,951.50", eassAnnualIncrease: "CPI + 1.5%", eassIncreaseDate: "1 October 2026", eassTenor: 10 }),
  importedSystem({ id: "SYS-004", name: "Namakwari Lodge", kwp: 232, kwh: 450, epc: "MiConsult", contractor: "MiConsult", offtaker: "Namakwari Lodge", contactName: "Zelna Van Den Heever", contact: "zelna@namakwari.co.za", platform: "Sunsynk/Augos", cod: "28 February 2025", nextPm: "26 January 2027", lastPm: "26 July 2026", ppaRate: "R 1.50/kWh", ppaAnnualIncrease: "CPI + 3.5%", ppaIncreaseDate: "1 March 2027", ppaTenor: 20, eassRate: "R 68,000.00", eassAnnualIncrease: "CPI + 3.5%", eassIncreaseDate: "1 March 2027", eassTenor: 20 }),
  importedSystem({ id: "SYS-005", name: "Penflex", kwp: 1300, kwh: 2000, epc: "Blue EPcM", contractor: "Blue EPcM", offtaker: "Penflex", contactName: "Sean Stuttaford", contact: "sean@penflex.co.za", platform: "FusionSolar/Augos", cod: "28 February 2025", nextPm: "2 March 2027", lastPm: "1 September 2026", ppaRate: "R 1.28/kWh", ppaAnnualIncrease: "CPI + 1.5%", ppaIncreaseDate: "1 March 2027", ppaTenor: 20, eassRate: "R 300,861.44", eassAnnualIncrease: "CPI + 1.5%", eassIncreaseDate: "1 July 2027", eassTenor: 10 }),
  importedSystem({ id: "SYS-006", name: "Alley Roads Meyerton Mall", kwp: 2230, kwh: 4000, epc: "Blue EPcM", contractor: "Blue EPcM", offtaker: "Alley Roads Meyerton Mall", contact: "ivan@alleyroads.co.za, busisiwe@alleyroads.co.za, craig@alleyroads.co.za", platform: "FusionSolar/Augos", cod: "28 February 2025", nextPm: "2 March 2027", lastPm: "1 September 2026", ppaRate: "R 1.15/kWh", ppaAnnualIncrease: "CPI + 1.5%", ppaIncreaseDate: "1 March 2027", ppaTenor: 20, eassRate: "R 1,144,800.00", eassAnnualIncrease: "CPI + 1.5%", eassIncreaseDate: "1 June 2027", eassTenor: 15 }),
  importedSystem({ id: "SYS-007", name: "AR Residential", kwp: null, kwh: null, epc: "Sustain EPC", contractor: "Sustain EPC", offtaker: "AR Residential", cod: "31 July 2025", systemCount: 17, nextPm: "-", lastPm: "-", eassRate: "R 333,229.00", eassAnnualIncrease: "CPI + 1.5%", eassIncreaseDate: "1 August 2026", eassTenor: 15 }),
  importedSystem({ id: "SYS-008", name: "Borbet SA", kwp: 2090, kwh: 4000, epc: "Blue EPcM", contractor: "Blue EPcM", offtaker: "Borbet SA", contactName: "Lauren & Derrick", contact: "la@borbetsa.net and dvk@borbetsa.net", platform: "FusionSolar/Augos", cod: "16 September 2025", nextPm: "2 March 2027", lastPm: "1 September 2026", ppaRate: "R 1.10/kWh", ppaAnnualIncrease: "CPI + 1.5%", ppaIncreaseDate: "1 September 2026", ppaTenor: 20, eassRate: "R 530,182.00", eassAnnualIncrease: "CPI + 1.5%", eassIncreaseDate: "1 November 2026", eassTenor: 10 }),
  importedSystem({ id: "SYS-009", name: "Vientiane", kwp: 248.64, kwh: 0, epc: "Sustain EPC", contractor: "Sustain EPC", offtaker: "Vientiane", contact: "saliaoning@hotmail.com and 1813707047@qq.com", platform: "Augos", cod: "30 September 2025", nextPm: "30 January 2026", lastPm: "1 August 2025", ppaRate: "R 1.42/kWh", ppaAnnualIncrease: "CPI + 1.5%", ppaIncreaseDate: "1 October 2026", ppaTenor: 20 }),
  importedSystem({ id: "SYS-010", name: "Olijvenkraal Olive & Wine Farm", kwp: 75, kwh: 345, epc: "Sustain EPC", contractor: "Sustain EPC", offtaker: "Olijvenkraal Olive & Wine Farm", contactName: "Bruce & Debbie", contact: "bruce@cityventurecapital.com and debbiep@citylogistics.co.za", platform: "Sigen/Augos", cod: "31 October 2025", systemCount: 3, nextPm: "30 January 2026", lastPm: "1 August 2025", eassRate: "R 37,909.00", eassAnnualIncrease: "CPI + 1.5%", eassIncreaseDate: "1 November 2026", eassTenor: 15 }),
  importedSystem({ id: "SYS-011", name: "Sleepover - Lanseria", kwp: 55, kwh: 123, epc: "Coalition Africa", contractor: "Coalition Africa", offtaker: "Sleepover - Lanseria", contactName: "Sheldon Clements", contact: "sheldon.clements@sleepover.travel and theunis.bothma@sleepover.travel", platform: "Deye Cloud/Augos", cod: "28 February 2026", nextPm: "30 December 2026", lastPm: "1 July 2026", eassRate: "R 34,271.00", eassAnnualIncrease: "CPI + 1.5%", eassIncreaseDate: "1 March 2027", eassTenor: 10 }),
  importedSystem({ id: "SYS-012", name: "Sleepover - 3 Gates", kwp: 350, kwh: 737, epc: "Coalition Africa", contractor: "Coalition Africa", offtaker: "Sleepover - 3 Gates", contactName: "Sheldon Clements", contact: "sheldon.clements@sleepover.travel and theunis.bothma@sleepover.travel", platform: "Deye Cloud/Augos", cod: "28 February 2026", systemCount: 3, nextPm: "30 December 2026", lastPm: "1 July 2026", eassRate: "R 197,712.00", eassAnnualIncrease: "CPI + 1.5%", eassIncreaseDate: "1 March 2027", eassTenor: 10 }),
  importedSystem({ id: "SYS-013", name: "Gosforth Park - City & Mr. P", kwp: 453.22, kwh: 651.24, epc: "Sustain EPC", contractor: "Sustain EPC", offtaker: "Gosforth Park - City & Mr. P", contactName: "Marzena Straub", contact: "marzenas@cipf.co.za", platform: "Sigen", cod: "28 February 2026", systemCount: 2, nextPm: "2 March 2027", lastPm: "1 September 2026", ppaRate: "R 2.05/kWh", ppaAnnualIncrease: "CPI + 1.5%", ppaIncreaseDate: "1 March 2027", ppaTenor: 20 }),
  importedSystem({ id: "SYS-014", name: "Gosforth Park - Gigabrain", kwp: 158, kwh: 253.25, epc: "Sustain EPC", contractor: "Sustain EPC", offtaker: "Gosforth Park - Gigabrain", contactName: "Noah Kirby", contact: "noah@gigabrain.africa and david", platform: "Sigen", cod: "28 February 2026", nextPm: "2 March 2027", lastPm: "1 September 2026", ppaRate: "R 2.45/kWh", ppaAnnualIncrease: "CPI + 1.5%", ppaIncreaseDate: "1 March 2027", ppaTenor: 20 }),
  importedSystem({ id: "SYS-015", name: "Leeuwenkuil", kwp: null, kwh: null, epc: "Blue EPcM", contractor: "Blue EPcM", offtaker: "Leeuwenkuil", cod: "TBC", eassAnnualIncrease: "CPI + 1.5%" }),
];

const ticketSeed = [];

const maintenanceSeed = [];

const systems = loadWorkspaceCollection("systems", systemSeed);
const tickets = loadWorkspaceCollection("tickets", ticketSeed);
const maintenance = loadWorkspaceCollection("maintenance", maintenanceSeed);
const state = { view: "overview", selectedSystem: "SYS-001", selectedTicket: null, selectedMaintenance: null, ticketFilter: "All open", monitoringSystem: "" };
const monitoringState = { status: "idle", data: null, message: "" };

const appView = document.querySelector("#app-view");
const title = document.querySelector("#page-title");
const eyebrow = document.querySelector("#page-eyebrow");
const primaryAction = document.querySelector("#primary-action");
const backButton = document.querySelector("#back-button");
const modalLayer = document.querySelector("#modal-layer");
const modalContent = document.querySelector("#modal-content");
const modalTitle = document.querySelector("#modal-title");
const toast = document.querySelector("#toast");

const getSystem = (id) => systems.find((system) => system.id === id);
const getTicket = (id) => tickets.find((ticket) => ticket.id === id);
const getMaintenance = (id) => maintenance.find((item) => item.id === id);
const ticketEmail = (id) => `${id.toLowerCase()}@records.blueenergy.co.za`;
const openTicketsForSystem = (id) => tickets.filter((ticket) => ticket.system === id && ticket.status !== "Completed");
const statusTone = (status) => status === "Operational" || status === "Open" || status === "Completed" ? "green" : status === "Critical" || status === "Non-operational" ? "red" : status === "Quote Approval" ? "blue" : "amber";
const tag = (value) => `<span class="tag tag-${statusTone(value)}">${value}</span>`;
const ticketWorkflow = (ticket) => ticket.workflow || (["Pending Quote", "Quote Approval"].includes(ticket.status) ? ticket.status : "");

function emailHistory(ticket) {
  const messages = Array.isArray(ticket.emailHistory) ? ticket.emailHistory : [];
  if (!messages.length) return `<p class="empty-message">No email messages have been recorded for this ticket.</p>`;
  return messages.map((message) => `<div class="email-row"><strong>${message.from}</strong><span>${message.subject}</span><span class="tag tag-${message.direction === "Sent" ? "green" : "blue"}">${message.direction}</span></div>`).join("");
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { toast.hidden = true; }, 3400);
}

function setNav() {
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.nav === state.view));
  document.querySelector(".nav-parent")?.classList.toggle("active", state.view === "overview");
}

function pageHeader(nextTitle, nextEyebrow, actionLabel = "") {
  title.textContent = nextTitle;
  eyebrow.textContent = nextEyebrow;
  primaryAction.textContent = actionLabel;
  primaryAction.hidden = !actionLabel;
  backButton.hidden = ["overview", "monitoring", "tickets", "maintenance", "automation"].includes(state.view);
  setNav();
}

function formatMetric(value, unit = "") {
  if (value === null || value === undefined || value === "") return "—";
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "—";
  return `${numericValue.toLocaleString("en-ZA", { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ""}`;
}

function findTelemetry(system) {
  const telemetry = monitoringState.data?.systems || [];
  return telemetry.find((item) => item.systemId === system.id || item.name === system.name) || null;
}

function monitoringConnectionCopy() {
  if (monitoringState.status === "loading") return "Connecting to the monitoring API…";
  if (monitoringState.data?.configured && (monitoringState.data.systems || []).length) return `Live feed updated ${new Date(monitoringState.data.fetchedAt).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}.`;
  if (monitoringState.message) return monitoringState.message;
  return "Monitoring API is ready to connect. Add the approved endpoint and access token in Vercel to receive live system data.";
}

async function refreshMonitoring() {
  monitoringState.status = "loading";
  monitoringState.message = "";
  if (state.view === "monitoring") renderMonitoring();
  try {
    const response = await fetch("/api/monitoring", { headers: { Accept: "application/json" } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "The monitoring feed could not be reached.");
    monitoringState.data = payload;
    monitoringState.message = payload.message || "";
    monitoringState.status = "ready";
  } catch (error) {
    monitoringState.data = null;
    monitoringState.message = error.message || "The monitoring feed could not be reached.";
    monitoringState.status = "error";
  }
  if (state.view === "monitoring") renderMonitoring();
}

function renderMonitoring() {
  state.view = "monitoring";
  pageHeader("Monitoring", "O&M / MONITORING", "Refresh data");
  const rows = systems.map((system) => ({ system, telemetry: findTelemetry(system) }));
  const connectedRows = rows.filter(({ telemetry }) => telemetry);
  const totalPower = connectedRows.reduce((total, { telemetry }) => total + (Number(telemetry.powerKw) || 0), 0);
  const totalEnergy = connectedRows.reduce((total, { telemetry }) => total + (Number(telemetry.energyTodayKwh) || 0), 0);
  const availability = connectedRows.map(({ telemetry }) => Number(telemetry.availability)).filter(Number.isFinite);
  const averageAvailability = availability.length ? availability.reduce((total, value) => total + value, 0) / availability.length : null;
  appView.innerHTML = `
    <p class="subtitle"><span class="status-dot ${monitoringState.data?.configured ? "is-live" : ""}"></span>${monitoringConnectionCopy()}</p>
    <div class="monitoring-stat-grid">
      <article class="stat-card"><span>Current portfolio power</span><strong>${connectedRows.length ? formatMetric(totalPower, "kW") : "—"}</strong><span>${connectedRows.length ? `${connectedRows.length} systems reporting` : "Awaiting telemetry feed"}</span></article>
      <article class="stat-card"><span>Generation today</span><strong>${connectedRows.length ? formatMetric(totalEnergy, "kWh") : "—"}</strong><span>From the latest available system readings</span></article>
      <article class="stat-card"><span>Availability</span><strong>${averageAvailability === null ? "—" : formatMetric(averageAvailability, "%")}</strong><span>${availability.length ? "Average for reporting systems" : "Available once the feed is connected"}</span></article>
      <article class="stat-card"><span>Systems tracked</span><strong>${systems.length}</strong><span>${connectedRows.length}/${systems.length} currently reporting</span></article>
    </div>
    <div class="section-header"><h2>System performance</h2><span class="muted">Click a system to open its full record</span></div>
    <div class="monitoring-table" role="region" aria-label="System monitoring data" tabindex="0">
      <div class="monitoring-head"><span>System</span><span>Operating state</span><span>Power now</span><span>Generation today</span><span>Availability</span><span>Last signal</span></div>
      ${rows.map(({ system, telemetry }) => `
        <div class="monitoring-row ${state.monitoringSystem === system.id ? "selected" : ""}">
          <button class="asset-site" data-action="open-system" data-id="${system.id}"><strong>${system.name}</strong><span>${system.id} · ${formatMetric(system.kwp, "kWp")}</span></button>
          <span>${tag(telemetry?.status || system.status)}</span>
          <span class="monitoring-value">${formatMetric(telemetry?.powerKw, "kW")}</span>
          <span class="monitoring-value">${formatMetric(telemetry?.energyTodayKwh, "kWh")}</span>
          <span class="monitoring-value">${formatMetric(telemetry?.availability, "%")}</span>
          <span class="card-meta">${telemetry?.lastSync || (monitoringState.status === "loading" ? "Checking…" : "Waiting for API")}</span>
        </div>
      `).join("")}
    </div>
  `;
  if (monitoringState.status === "idle") refreshMonitoring();
}function renderSystemRegister() {
  state.view = "overview";
  pageHeader("O&M", "O&M / ASSET REGISTER", "Add system");
  const operationalCount = systems.filter((system) => system.status === "Operational").length;
  const attentionCount = systems.filter((system) => system.status === "Attention required").length;
  const nonOperationalCount = systems.filter((system) => system.status === "Non-operational").length;
  const pendingStatusCount = systems.length - operationalCount - attentionCount - nonOperationalCount;
  const hasVerifiedStatus = pendingStatusCount === 0;
  appView.innerHTML = `
    <p class="subtitle"><span class="status-dot ${hasVerifiedStatus ? "is-live" : "status-pending"}"></span>${hasVerifiedStatus ? `Verified operating status across ${systems.length} solar systems.` : `${pendingStatusCount} of ${systems.length} systems require operating-status confirmation from Monitoring.`}</p>
    <div class="stat-grid" aria-label="Portfolio operating status">
      <article class="stat-card"><span>Operational</span><strong>${operationalCount}</strong><span>Confirmed operating normally</span></article>
      <article class="stat-card"><span>Attention required</span><strong>${attentionCount}</strong><span>Confirmed O&amp;M actions needed</span></article>
      <article class="stat-card"><span>Non-operational</span><strong>${nonOperationalCount}</strong><span>Confirmed recovery actions needed</span></article>
    </div>
    <div class="section-header"><h2>Managed assets</h2><span class="muted">${systems.length} system${systems.length === 1 ? "" : "s"}</span></div>
    <div class="overview-system-list" role="region" aria-label="O&M managed assets" tabindex="0">
      ${systems.map((system) => `
        <article class="overview-system-row">
          <button class="overview-system-main" data-action="open-system" data-id="${system.id}" aria-label="Open system record for ${system.name}">
            <span class="overview-system-identity"><span class="card-title">${system.name}</span><span class="card-meta">${system.id} · EPC: ${system.epc || "Not recorded"} · COD ${system.cod || "Not recorded"}</span></span>
            <span class="overview-system-capacity"><strong>${formatMetric(system.kwp, "kWp")} · ${formatMetric(system.kwh, "kWh")}</strong><span class="card-meta">O&amp;M: ${system.contractor || "Not recorded"}</span></span>
          </button>
          <span class="overview-system-state">${tag(system.status)}</span>
          <span class="overview-system-work"><span class="card-meta">Open tickets ${openTicketsForSystem(system.id).length}</span><span class="card-meta">${system.nextPm && system.nextPm !== "-" ? `Next PM ${system.nextPm}` : "PM date not set"}</span><button class="asset-folder" data-action="folder" data-id="${system.id}">${/^https?:\/\//i.test(system.folder || "") ? "Open OneDrive ↗" : "Add OneDrive link"}</button></span>
        </article>
      `).join("")}
    </div>
  `;
}

function renderSystemRecord(id) {
  const system = getSystem(id);
  state.selectedSystem = id;
  state.view = "system-record";
  pageHeader("System record", "SYSTEMS / SELECTED RECORD");
  const related = openTicketsForSystem(id);
  appView.innerHTML = `
    <div class="record-head">
      <div><p class="eyebrow">${system.id}</p><h2>${system.name}</h2><p class="muted">${formatMetric(system.kwp, "kWp")} · ${formatMetric(system.kwh, "kWh")} · COD ${system.cod || "Not recorded"}</p></div>
      <div>${tag(system.status)} <button class="button button-muted" data-action="edit-system" data-id="${system.id}">Edit system</button> <button class="button button-muted" data-action="view-monitoring" data-id="${system.id}">View monitoring</button> <button class="button button-muted" data-action="folder" data-id="${system.id}">Open OneDrive folder ↗</button></div>
    </div>
    <div class="record-grid">
      <div>
        <section class="surface">
          <div class="surface-title"><h3>Asset profile</h3><span class="muted">Primary contacts and dates</span></div>
          <div class="details-grid">
            ${detail("System ID", system.id)}${detail("Number of systems", String(system.systemCount || 1))}${detail("EPC installer", system.epc || "Not recorded")}${detail("O&M contractor", system.contractor || "Not recorded")}${detail("COD date", system.cod || "Not recorded")}${detail("Offtaker", system.offtaker || "Not recorded")}${detail("Site contact", system.contactName || "Not recorded")}${detail("Contact email(s)", system.contact || "Not recorded")}${detail("Monitoring platform", system.platform || "Not recorded")}${detail("EaaS rate — battery cost", system.eassRate || "Not recorded")}${detail("EaaS annual increase", system.eassAnnualIncrease || "Not recorded")}${detail("EaaS next increase date", system.eassIncreaseDate || "Not recorded")}${detail("EaaS tenor", system.eassTenor ? `${system.eassTenor} years` : "Not recorded")}${detail("PPA rate — per kWh produced", system.ppaRate || "Not recorded")}${detail("PPA annual increase", system.ppaAnnualIncrease || "Not recorded")}${detail("PPA next increase date", system.ppaIncreaseDate || "Not recorded")}${detail("PPA tenor", system.ppaTenor ? `${system.ppaTenor} years` : "Not recorded")}${detail("Next PM due", system.nextPm || "Not recorded")}${detail("Last PM completion", system.lastPm || "Not recorded")}${detail("Open tickets", String(related.length))}
          </div>
        </section>
        <section class="surface">
          <div class="surface-title"><h3>Grid tariff &amp; savings basis</h3><span class="muted">Utility cost avoided by on-site generation</span></div>
          <div class="details-grid">
            ${detail("Supply authority", system.gridSupply || "Not confirmed")}${detail("Tariff name / code", system.tariffName || "Not recorded")}${detail("Grid tariff rate", system.utilityTariff || "Not recorded")}${detail("Tariff effective date", system.tariffEffectiveDate || "Not recorded")}${detail("Annual tariff increase", system.tariffAnnualIncrease || "Not recorded")}
          </div>
          <p class="muted" style="margin:16px 0 0;">Select Municipal or Eskom and record the current tariff before savings are calculated. Savings reports combine this tariff with verified monitoring generation and PPA/EaaS charges.</p>
        </section>
        <section class="surface">
          <div class="surface-title"><h3>Live monitoring</h3><span class="tag tag-blue">${system.monitoringUrl ? "LINKED" : "NOT LINKED"}</span></div>
          <div class="monitor-alert"><strong>●</strong><span>${system.alert}<br /><small>${system.monitoring}</small></span></div>
          <div class="timeline" style="margin-top:18px;">${system.updates.map((update, index) => `<div class="timeline-item"><span class="timeline-date">${index === 0 ? "LATEST" : "UPDATE"}</span><span class="timeline-copy">${update}</span></div>`).join("")}</div>
        </section>
      </div>
      <div>
        <section class="surface">
          <div class="surface-title"><h3>Document library</h3><button class="text-link" data-action="edit-system" data-id="${system.id}">Add folder link</button></div>
          <div class="document-list">${system.documents.map((document) => `<button class="document-link" data-action="document"><span>${document}</span><span>Open ↗</span></button>`).join("")}</div>
        </section>
        <section class="surface">
          <div class="surface-title"><h3>Photos & evidence</h3><button class="text-link" data-action="add-photo">Add photos</button></div>
          <div class="photo-grid"><div class="photo-placeholder">Site view<br />Add photo</div><div class="photo-placeholder">Equipment<br />Add photo</div><div class="photo-placeholder">Inspection<br />Add file</div></div>
        </section>
        <section class="surface">
          <div class="surface-title"><h3>Linked work</h3><button class="text-link" data-nav="tickets">View all tickets</button></div>
          ${related.length ? related.map((ticket) => `<button class="ticket-row" style="grid-template-columns:1fr auto; padding:11px 0; border:0; box-shadow:none;" data-action="open-ticket" data-id="${ticket.id}"><span><span class="ticket-number">${ticket.id}</span><span class="card-title">${ticket.issue}</span></span>${tag(ticket.status)}</button>`).join("") : `<p class="muted">No open work is linked to this system.</p>`}
        </section>
      </div>
    </div>
  `;
}

function detail(label, value) { return `<span><span class="detail-label">${label}</span><span class="detail-value">${value}</span></span>`; }

function renderTickets() {
  state.view = "tickets";
  pageHeader("Tickets", "O&M / OPEN WORK", "New ticket");
  const filters = ["All open", "Monitoring alert", "PM visit", "On-site inspection", "Asset review", "Asset review completed", "Reported by off-taker", "Other", "Completed"];
  const visible = tickets.filter((ticket) => {
    if (state.ticketFilter === "All open") return ticket.status !== "Completed";
    if (state.ticketFilter === "Completed") return ticket.status === "Completed";
    return ticket.source === state.ticketFilter;
  });
  appView.innerHTML = `
    <p class="subtitle">Every action is a ticket. The source tells you whether it came from monitoring, maintenance, an on-site issue or restorative work.</p>
    <div class="filters">${filters.map((filter) => `<button class="filter ${state.ticketFilter === filter ? "active" : ""}" data-filter="${filter}">${filter}</button>`).join("")}</div>
    <div class="section-header"><h2>Tickets</h2><span class="muted">Click a ticket to open its workroom</span></div>
    <div class="ticket-list">
      ${visible.map((ticket) => { const system = getSystem(ticket.system); return `
        <button class="ticket-row" data-action="open-ticket" data-id="${ticket.id}">
          <span class="ticket-number">${ticket.id.slice(-4)}</span>
          <span><span class="card-title">${ticket.issue}</span><span class="card-meta">${ticket.id} · ${system.name} · ${ticket.source}</span></span>
          <span>${tag(ticket.status)}${ticketWorkflow(ticket) ? tag(ticketWorkflow(ticket)) : ""}<span class="card-meta" style="display:block;margin-top:5px;">${ticket.type}</span></span>
          ${tag(ticket.concern)}
          <span class="card-meta"><strong>${ticket.status === "Completed" ? "Completed" : "Opened"}</strong><br />${ticket.opened}</span>
        </button>`; }).join("")}
    </div>
  `;
}

function renderTicketWorkroom(id) {
  const ticket = getTicket(id);
  const system = getSystem(ticket.system);
  state.selectedTicket = id;
  state.view = "ticket-workroom";
  pageHeader("Ticket workroom", "TICKETS / SELECTED RECORD");
  appView.innerHTML = `
    <div class="record-head">
      <div><p class="eyebrow">${ticket.id} · ${system.name}</p><h2>${ticket.issue}</h2><p class="muted">${ticket.type} · ${ticket.source} · Found ${ticket.found}</p></div>
      <div>${tag(ticket.status)} ${ticketWorkflow(ticket) ? tag(ticketWorkflow(ticket)) : ""} ${tag(ticket.concern)} <button class="button button-muted" data-action="edit-ticket" data-id="${ticket.id}">Edit ticket</button></div>
    </div>
    <div class="workroom-grid">
      <div>
        <section class="surface">
          <div class="surface-title"><h3>Work log & next action</h3><span class="muted">Owner: ${ticket.owner}</span></div>
          <div class="timeline">${ticket.work.map((item, index) => `<div class="timeline-item"><span class="timeline-date">${index === 0 ? ticket.opened : `STEP ${index + 1}`}</span><span class="timeline-copy">${item}</span></div>`).join("")}</div>
          <div class="monitor-alert" style="margin-top:18px;background:#e9f3ff;color:#164b7c;"><strong>NEXT</strong><span>${ticketWorkflow(ticket) === "Quote Approval" ? `Approval email is ready for ${ticket.approver}.` : `Keep the work log updated and move the ticket through the workflow.`}</span></div>
        </section>
        <section class="surface">
          <div class="surface-title"><h3>Attachments, photos & documents</h3></div>
          <div class="upload-area"><input id="file-input" type="file" multiple aria-label="Add files or photos" /><span class="muted">Files are held with this ticket record.</span><div id="file-list">${ticket.files.map((file) => typeof file === "string" ? `<span class="file-chip">${file}</span>` : `<a class="file-chip" href="${file.url}" target="_blank" rel="noreferrer">${file.name} ↗</a>`).join("")}</div></div>
        </section>
      </div>
      <div>
        <section class="surface">
          <div class="surface-title"><h3>Dedicated ticket email</h3><button class="text-link" data-action="copy-email">Copy</button></div>
          <div class="email-address">${ticketEmail(ticket.id)}</div>
          <p class="muted">Every sent and received message belongs to this record.</p>
          ${emailHistory(ticket)}
          <button class="button button-primary" style="width:100%;margin-top:16px;" data-action="prepare-email">Prepare update email</button>
        </section>
        <section class="surface">
          <div class="surface-title"><h3>Routing controls</h3></div>
          <label class="checkbox-line"><input type="checkbox" id="pm-toggle" ${ticket.pm ? "checked" : ""} /> Include in next PM package</label>
          <p class="muted">When selected, this ticket travels with the next relevant maintenance package.</p>
          <label class="checkbox-line"><input type="checkbox" id="approval-toggle" ${ticketWorkflow(ticket) === "Quote Approval" ? "checked" : ""} /> Quote approval needed</label>
          <p class="muted">Selected approver: <strong>${ticket.approver}</strong></p>
          ${ticketWorkflow(ticket) === "Quote Approval" ? `<button class="button button-muted" data-action="quote-approved">Record approval</button>` : ""}
        </section>
      </div>
    </div>
  `;
}

function renderMaintenance() {
  state.view = "maintenance";
  pageHeader("Maintenance", "O&M / SIX-MONTH PM CYCLE", "Schedule PM");
  if (!maintenance.length) {
    appView.innerHTML = `<p class="subtitle">No preventive-maintenance events have been scheduled yet. Each asset profile retains the imported last-completion and next-due dates.</p>`;
    return;
  }
  const months = ["September 2026", "October 2026", "November 2026"];
  const selected = getMaintenance(state.selectedMaintenance);
  const selectedSystem = getSystem(selected.system);
  appView.innerHTML = `
    <p class="subtitle">Plan by month, retain the exact completion date and send one controlled package to the selected contacts.</p>
    <div class="calendar-grid">
      ${months.map((month) => { const items = maintenance.filter((item) => item.month === month); return `<section class="month-card ${items.some((item) => item.id === selected.id) ? "active" : ""}"><h3>${month}</h3><p class="muted">${items.length ? `${items.length} site visit${items.length > 1 ? "s" : ""} due` : "No visits due"}</p>${items.map((item) => { const system = getSystem(item.system); const tone = item.status === "Completed" ? "green" : item.status === "PM pack prepared" ? "amber" : "blue"; return `<button class="maintenance-item ${tone}" data-action="select-maintenance" data-id="${item.id}"><strong>${system.name}</strong><span>${item.status}${item.completion ? ` · Completed ${item.completion}` : item.linked ? ` · ${item.linked} linked ticket` : ""}</span></button>`; }).join("")}</section>`; }).join("")}
    </div>
    <div class="section-header"><h2>PM email package</h2><span class="tag tag-${statusTone(selected.status)}">${selected.status}</span></div>
    <div class="email-package">
      <section class="email-card"><h3>1 · Request dates from off-taker</h3>${detail("To", `${selectedSystem.offtaker.toLowerCase().replace(/\s/g, ".")}@example.com`)}${detail("CC", "operations@blueenergyafrica.example")}<div class="message-preview"><strong>Subject: </strong>${selected.month} PM — ${selectedSystem.name}<br /><br />Maintenance is due this month. Please confirm suitable access dates.</div></section>
      <section class="email-card"><h3>2 · Send the O&amp;M work package</h3>${detail("To", selectedSystem.contact)}${detail("CC", "operations@blueenergyafrica.example")}<div class="message-preview"><strong>Includes:</strong><br />PM scope + ${selected.linked} linked corrective ticket${selected.linked === 1 ? "" : "s"}<br /><br />The contractor reply remains with this maintenance event and its linked tickets.</div></section>
    </div>
    <section class="surface" style="margin-top:18px;"><div class="surface-title"><h3>Attachments selected from the system document library</h3><button class="button button-primary" data-action="prepare-pm-email">Prepare email package</button></div><div class="attachment-row">${selectedSystem.documents.map((document) => `<span class="tag tag-blue">${document}</span>`).join("")}${openTicketsForSystem(selected.system).filter((ticket) => ticket.pm).map((ticket) => `<span class="tag tag-amber">${ticket.id} · ticket record</span>`).join("")}</div><p class="muted" style="margin:16px 0 0;">Once the visit is complete, save the exact completion date. The monthly calendar then turns green.</p></section>
  `;
}

function openModal(kind, context = {}) {
  modalLayer.hidden = false;
  if (kind === "system") {
    const system = context.system || {};
    const isNew = !system.id;
    modalTitle.textContent = isNew ? "Add system" : `Edit ${system.name}`;
    modalContent.innerHTML = `
      <form class="modal-body" id="system-form" data-system-id="${system.id || ""}">
        <div class="form-grid">
          <div class="field"><label>System ID</label><input name="id" required ${isNew ? "" : "readonly"} value="${system.id || ""}" placeholder="SYS-016" /></div>
          <div class="field"><label>System name</label><input name="name" required value="${system.name || ""}" placeholder="Site or portfolio name" /></div>
          <div class="field"><label>Capacity (kWp)</label><input name="kwp" type="number" min="0" value="${system.kwp ?? ""}" /></div>
          <div class="field"><label>Storage (kWh)</label><input name="kwh" type="number" min="0" value="${system.kwh ?? ""}" /></div>
          <div class="field"><label>Number of systems</label><input name="systemCount" type="number" min="1" value="${system.systemCount ?? 1}" /></div>
          <div class="field"><label>Operating status</label><select name="status"><option ${system.status === "Status not confirmed" ? "selected" : ""}>Status not confirmed</option><option ${system.status === "Operational" ? "selected" : ""}>Operational</option><option ${system.status === "Attention required" ? "selected" : ""}>Attention required</option><option ${system.status === "Non-operational" ? "selected" : ""}>Non-operational</option></select></div>
          <div class="field"><label>COD date</label><input name="cod" value="${system.cod || ""}" placeholder="30 June 2024" /></div>
          <div class="field"><label>Monitoring platform</label><input name="platform" value="${system.platform || ""}" placeholder="e.g. Augos" /></div>
          <div class="field"><label>EPC installer</label><input name="epc" value="${system.epc || ""}" /></div>
          <div class="field"><label>O&amp;M contractor</label><input name="contractor" value="${system.contractor || ""}" /></div>
          <div class="field"><label>Site contact</label><input name="contactName" value="${system.contactName || ""}" /></div>
          <div class="field"><label>Contact email(s)</label><input name="contact" value="${system.contact || ""}" placeholder="One or more email addresses" /></div>
          <div class="field"><label>Offtaker</label><input name="offtaker" value="${system.offtaker || ""}" /></div>
          <div class="field"><label>Supply authority</label><select name="gridSupply"><option ${(!system.gridSupply || system.gridSupply === "Not confirmed") ? "selected" : ""}>Not confirmed</option><option ${system.gridSupply === "Municipal" ? "selected" : ""}>Municipal</option><option ${system.gridSupply === "Eskom" ? "selected" : ""}>Eskom</option></select></div>
          <div class="field"><label>Tariff name / code</label><input name="tariffName" value="${system.tariffName || ""}" placeholder="e.g. Megaflex / municipal tariff" /></div>
          <div class="field"><label>Grid tariff rate</label><input name="utilityTariff" value="${system.utilityTariff || ""}" placeholder="e.g. R 3.15/kWh" /></div>
          <div class="field"><label>Tariff effective date</label><input name="tariffEffectiveDate" value="${system.tariffEffectiveDate || ""}" placeholder="e.g. 01 July 2026" /></div>
          <div class="field"><label>Annual tariff increase</label><input name="tariffAnnualIncrease" value="${system.tariffAnnualIncrease || ""}" placeholder="e.g. 12.5%" /></div>
          <div class="field"><label>PPA rate — per kWh produced</label><input name="ppaRate" value="${system.ppaRate || ""}" placeholder="e.g. R 2.10/kWh" /></div>
          <div class="field"><label>PPA annual increase</label><input name="ppaAnnualIncrease" value="${system.ppaAnnualIncrease || ""}" placeholder="e.g. CPI + 1.5%" /></div>
          <div class="field"><label>PPA next increase date</label><input name="ppaIncreaseDate" value="${system.ppaIncreaseDate || ""}" placeholder="e.g. 01 January 2027" /></div>
          <div class="field"><label>PPA tenor (years)</label><input name="ppaTenor" type="number" min="0" value="${system.ppaTenor ?? ""}" /></div>
          <div class="field"><label>EaaS rate — battery cost</label><input name="eassRate" value="${system.eassRate || ""}" placeholder="e.g. R 15,000/month" /></div>
          <div class="field"><label>EaaS annual increase</label><input name="eassAnnualIncrease" value="${system.eassAnnualIncrease || ""}" placeholder="e.g. CPI + 1.5%" /></div>
          <div class="field"><label>EaaS next increase date</label><input name="eassIncreaseDate" value="${system.eassIncreaseDate || ""}" placeholder="e.g. 01 January 2027" /></div>
          <div class="field"><label>EaaS tenor (years)</label><input name="eassTenor" type="number" min="0" value="${system.eassTenor ?? ""}" /></div>
          <div class="field"><label>Next PM due</label><input name="nextPm" value="${system.nextPm || ""}" placeholder="Month and year" /></div>
          <div class="field"><label>Last PM completion</label><input name="lastPm" value="${system.lastPm || ""}" placeholder="Date completed" /></div>
          <div class="field full"><label>Share-folder link</label><input name="folder" value="${system.folder || ""}" placeholder="Paste SharePoint or OneDrive link" /></div>
          <div class="field full"><label>Monitoring link or reference</label><input name="monitoringUrl" value="${system.monitoringUrl || ""}" placeholder="Paste monitoring portal link" /></div>
        </div>
        <div class="form-actions"><button class="button button-muted" type="button" data-close-modal>Cancel</button><button class="button button-primary" type="submit">${isNew ? "Add system" : "Save system"}</button></div>
      </form>`;
  }
  if (kind === "new-ticket") {
    modalTitle.textContent = "Create ticket";
    modalContent.innerHTML = `<form class="modal-body" id="ticket-form"><div class="form-grid"><div class="field"><label>Ticket type</label><select name="type"><option>Operational issue</option><option>Safety issue</option><option>Improvement</option><option>Restorative work</option></select></div><div class="field"><label>System</label><select name="system">${systems.map((system) => `<option value="${system.id}">${system.name}</option>`).join("")}</select></div><div class="field"><label>Source / how it was picked up</label><select name="source"><option>Monitoring alert</option><option>PM visit</option><option>On-site inspection</option><option>Asset review</option><option>Asset review completed</option><option>Reported by off-taker</option><option>Other</option></select></div><div class="field"><label>Concern</label><select name="concern"><option>Critical</option><option>High</option><option selected>Medium</option><option>Low</option><option>Planned</option></select></div><div class="field full"><label>Issue / work item</label><input name="issue" required placeholder="Describe the issue or work item" /></div><div class="field full"><label>Work log / next action</label><textarea name="work" required placeholder="What is known, what has been done and what needs to happen next?"></textarea></div></div><div class="form-actions"><button class="button button-muted" type="button" data-close-modal>Cancel</button><button class="button button-primary" type="submit">Create ticket</button></div></form>`;
  }
  if (kind === "edit-ticket") {
    const ticket = context.ticket;
    modalTitle.textContent = `Edit ${ticket.id}`;
    modalContent.innerHTML = `<form class="modal-body" id="edit-ticket-form" data-ticket-id="${ticket.id}"><div class="form-grid">
      <div class="field"><label>Ticket type</label><select name="type"><option ${ticket.type === "Operational issue" ? "selected" : ""}>Operational issue</option><option ${ticket.type === "Safety issue" ? "selected" : ""}>Safety issue</option><option ${ticket.type === "Improvement" ? "selected" : ""}>Improvement</option><option ${ticket.type === "Restorative work" ? "selected" : ""}>Restorative work</option></select></div>
      <div class="field"><label>System</label><select name="system">${systems.map((system) => `<option value="${system.id}" ${ticket.system === system.id ? "selected" : ""}>${system.name}</option>`).join("")}</select></div>
      <div class="field"><label>Source / how it was picked up</label><select name="source"><option ${ticket.source === "Monitoring alert" ? "selected" : ""}>Monitoring alert</option><option ${ticket.source === "PM visit" ? "selected" : ""}>PM visit</option><option ${ticket.source === "On-site inspection" ? "selected" : ""}>On-site inspection</option><option ${ticket.source === "Asset review" ? "selected" : ""}>Asset review</option><option ${ticket.source === "Asset review completed" ? "selected" : ""}>Asset review completed</option><option ${ticket.source === "Reported by off-taker" ? "selected" : ""}>Reported by off-taker</option><option ${ticket.source === "Other" ? "selected" : ""}>Other</option></select></div>
      <div class="field"><label>Status</label><select name="status"><option ${ticket.status === "Open" ? "selected" : ""}>Open</option><option ${ticketWorkflow(ticket) === "Pending Quote" ? "selected" : ""}>Pending Quote</option><option ${ticketWorkflow(ticket) === "Quote Approval" ? "selected" : ""}>Quote Approval</option><option ${ticket.status === "Completed" ? "selected" : ""}>Completed</option></select></div>
      <div class="field"><label>Concern</label><select name="concern"><option ${ticket.concern === "Critical" ? "selected" : ""}>Critical</option><option ${ticket.concern === "High" ? "selected" : ""}>High</option><option ${ticket.concern === "Medium" ? "selected" : ""}>Medium</option><option ${ticket.concern === "Low" ? "selected" : ""}>Low</option><option ${ticket.concern === "Planned" ? "selected" : ""}>Planned</option></select></div>
      <div class="field"><label>Owner / contractor</label><input name="owner" value="${ticket.owner || ""}" /></div>
      <div class="field"><label>Date identified</label><input name="found" value="${ticket.found || ""}" placeholder="e.g. 15 September 2026" /></div>
      <div class="field"><label>Ticket opened date</label><input name="opened" value="${ticket.opened || ""}" placeholder="e.g. 15 September 2026" /></div>
      <div class="field"><label>Quote approver</label><input name="approver" value="${ticket.approver || ""}" placeholder="Only required for quote approval" /></div>
      <div class="field full"><label>Issue / work item</label><input name="issue" required value="${ticket.issue || ""}" /></div>
      <div class="field full"><label>Add work-log update</label><textarea name="workUpdate" placeholder="Add what has changed, what has been done or what happens next. This is added to the existing work log."></textarea></div>
    </div><div class="form-actions"><button class="button button-muted" type="button" data-close-modal>Cancel</button><button class="button button-primary" type="submit">Save ticket changes</button></div></form>`;
  }
  if (kind === "email") {
    modalTitle.textContent = context.title || "Prepare email";
    modalContent.innerHTML = `<div class="modal-body"><div class="field"><label>To</label><input value="${context.to || ""}" /></div><div class="field" style="margin-top:14px;"><label>CC</label><input value="operations@blueenergyafrica.example" /></div><div class="field" style="margin-top:14px;"><label>Subject</label><input value="${context.subject || "O&M update"}" /></div><div class="field" style="margin-top:14px;"><label>Message</label><textarea>${context.body || ""}</textarea></div><p class="muted" style="margin:15px 0 0;">This first build prepares the correct message and record. Sending is connected in the transactional-email phase.</p><div class="form-actions"><button class="button button-muted" data-close-modal>Close</button><button class="button button-primary" data-action="queue-email">Queue for sending</button></div></div>`;
  }
  if (kind === "files") {
    modalTitle.textContent = "Add photos or evidence";
    modalContent.innerHTML = `<div class="modal-body"><div class="upload-area"><input id="modal-file-input" type="file" multiple /><span class="muted">Choose photo, document or inspection evidence files for this record.</span></div><div class="form-actions"><button class="button button-muted" data-close-modal>Close</button></div></div>`;
  }
}

function closeModal() { modalLayer.hidden = true; modalContent.innerHTML = ""; }

function onAction(action, id) {
  if (action === "open-system") renderSystemRecord(id);
  if (action === "open-system-register") renderSystemRegister();
  if (action === "edit-system") openModal("system", { system: getSystem(id) });
  if (action === "view-monitoring") { state.monitoringSystem = id; renderMonitoring(); }
  if (action === "refresh-monitoring") refreshMonitoring();
  if (action === "open-ticket") renderTicketWorkroom(id);
  if (action === "edit-ticket") { const ticket = getTicket(id || state.selectedTicket); if (ticket) openModal("edit-ticket", { ticket }); }
  if (action === "select-maintenance") { state.selectedMaintenance = id; renderMaintenance(); }
  if (action === "folder") { const system = getSystem(id || state.selectedSystem); if (system.folder && /^https?:\/\//i.test(system.folder)) window.open(system.folder, "_blank", "noopener"); else showToast("Add the SharePoint or OneDrive folder link in the system record."); }
  if (action === "monitoring") { const system = getSystem(id || state.selectedSystem); if (system.monitoringUrl && /^https?:\/\//i.test(system.monitoringUrl)) window.open(system.monitoringUrl, "_blank", "noopener"); else showToast("Add the monitoring portal link in the system record."); }
  if (action === "document") showToast("Document access will connect to the selected system folder.");
  if (action === "add-photo") openModal("files");
  if (action === "copy-email") { navigator.clipboard?.writeText(ticketEmail(state.selectedTicket)); showToast("Dedicated ticket email copied."); }
  if (action === "prepare-email") { const ticket = getTicket(state.selectedTicket); openModal("email", { title: "Prepare ticket update", to: ticket.owner === "Blue Energy Africa" ? "operations@blueenergyafrica.example" : getSystem(ticket.system).contact, subject: `${ticket.id} — ${ticket.issue}`, body: `Please see the current update for ${ticket.id}.\n\nNext action: ${ticket.work.at(-1)}` }); }
  if (action === "prepare-pm-email") { const item = getMaintenance(state.selectedMaintenance); const system = getSystem(item.system); openModal("email", { title: "Prepare PM email package", to: system.contact, subject: `${item.month} PM — ${system.name}`, body: `Please find the PM scope and linked corrective work for ${system.name}. System documents are attached from the selected document library.` }); }
  if (action === "quote-approved") { const ticket = getTicket(state.selectedTicket); ticket.status = "Open"; saveWorkspace(); renderTicketWorkroom(ticket.id); showToast("Approval recorded; ticket returned to the active work queue."); }
  if (action === "queue-email") { closeModal(); showToast("Email package queued for the connected sending service."); }
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-nav]");
  if (nav) { const target = nav.dataset.nav; if (target === "overview") renderSystemRegister(); if (target === "monitoring") renderMonitoring(); if (target === "tickets") renderTickets(); if (target === "maintenance") renderMaintenance(); return; }
  const action = event.target.closest("[data-action]");
  if (action) onAction(action.dataset.action, action.dataset.id);
  const filter = event.target.closest("[data-filter]");
  if (filter) { state.ticketFilter = filter.dataset.filter; renderTickets(); }
  if (event.target.matches("[data-close-modal]")) closeModal();
});

primaryAction.addEventListener("click", () => {
  if (state.view === "tickets") openModal("new-ticket");
  if (state.view === "overview") openModal("system");
  if (state.view === "monitoring") refreshMonitoring();
  if (state.view === "maintenance") showToast("New PM event is ready for scheduling.");
});
backButton.addEventListener("click", () => { if (state.view === "system-record") renderSystemRegister(); if (state.view === "ticket-workroom") renderTickets(); });
modalLayer.addEventListener("click", (event) => { if (event.target === modalLayer) closeModal(); });
document.addEventListener("change", (event) => {
  if (event.target.id === "file-input") {
    const ticket = getTicket(state.selectedTicket);
    [...event.target.files].forEach((file) => ticket.files.push(file.name));
    saveWorkspace();
    renderTicketWorkroom(ticket.id);
    showToast("Files added to the ticket record.");
  }
  if (event.target.id === "modal-file-input") { showToast(`${event.target.files.length} file${event.target.files.length === 1 ? "" : "s"} selected for the record.`); }
  if (event.target.id === "pm-toggle") { const ticket = getTicket(state.selectedTicket); ticket.pm = event.target.checked; saveWorkspace(); showToast(ticket.pm ? "Ticket will be included in the next PM package." : "Ticket removed from the PM package."); }
});
modalContent.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  if (event.target.id === "system-form") {
    const editedId = event.target.dataset.systemId;
    const optionalNumber = (value) => value === "" ? null : Number(value);
    const nextSystem = {
      id: String(form.get("id")).trim().toUpperCase(), name: String(form.get("name")).trim(), kwp: optionalNumber(form.get("kwp")), kwh: optionalNumber(form.get("kwh")), systemCount: optionalNumber(form.get("systemCount")) || 1,
      status: form.get("status"), cod: String(form.get("cod")).trim(), platform: String(form.get("platform")).trim(), epc: String(form.get("epc")).trim(), contractor: String(form.get("contractor")).trim(),
      contactName: String(form.get("contactName")).trim(), contact: String(form.get("contact")).trim(), offtaker: String(form.get("offtaker")).trim(),
      gridSupply: String(form.get("gridSupply")).trim(), tariffName: String(form.get("tariffName")).trim(), utilityTariff: String(form.get("utilityTariff")).trim(), tariffEffectiveDate: String(form.get("tariffEffectiveDate")).trim(), tariffAnnualIncrease: String(form.get("tariffAnnualIncrease")).trim(),
      eassRate: String(form.get("eassRate")).trim(), eassAnnualIncrease: String(form.get("eassAnnualIncrease")).trim(), eassIncreaseDate: String(form.get("eassIncreaseDate")).trim(), eassTenor: optionalNumber(form.get("eassTenor")),
      ppaRate: String(form.get("ppaRate")).trim(), ppaAnnualIncrease: String(form.get("ppaAnnualIncrease")).trim(), ppaIncreaseDate: String(form.get("ppaIncreaseDate")).trim(), ppaTenor: optionalNumber(form.get("ppaTenor")),
      nextPm: String(form.get("nextPm")).trim(), lastPm: String(form.get("lastPm")).trim(), folder: String(form.get("folder")).trim(), monitoringUrl: String(form.get("monitoringUrl")).trim(),
      monitoring: String(form.get("platform")).trim() ? `${String(form.get("platform")).trim()} · connection pending` : "Monitoring platform not recorded", alert: "No monitoring exception recorded.", updates: ["System record updated today"], documents: []
    };
    if (editedId) {
      const index = systems.findIndex((system) => system.id === editedId);
      systems[index] = { ...systems[index], ...nextSystem, documents: systems[index].documents || [], updates: ["System record updated today", ...(systems[index].updates || [])] };
    } else if (systems.some((system) => system.id === nextSystem.id)) {
      showToast("That System ID already exists. Use a unique ID.");
      return;
    } else {
      systems.push(nextSystem);
    }
    saveWorkspace();
    closeModal();
    renderSystemRecord(nextSystem.id);
    showToast(editedId ? "System record updated." : "System added to the register.");
    return;
  }
  if (event.target.id === "edit-ticket-form") {
    const ticket = getTicket(event.target.dataset.ticketId);
    if (!ticket) return;
    ticket.type = String(form.get("type"));
    ticket.system = String(form.get("system"));
    ticket.source = String(form.get("source"));
    const selectedStage = String(form.get("status"));
    ticket.status = selectedStage === "Completed" ? "Completed" : "Open";
    ticket.workflow = ["Pending Quote", "Quote Approval"].includes(selectedStage) ? selectedStage : "";
    ticket.concern = String(form.get("concern"));
    ticket.owner = String(form.get("owner")).trim();
    ticket.found = String(form.get("found")).trim();
    ticket.opened = String(form.get("opened")).trim();
    ticket.approver = String(form.get("approver")).trim();
    ticket.issue = String(form.get("issue")).trim();
    const update = String(form.get("workUpdate")).trim();
    if (update) { ticket.work = Array.isArray(ticket.work) ? ticket.work : []; ticket.work.push(update); }
    saveWorkspace();
    closeModal();
    renderTicketWorkroom(ticket.id);
    showToast("Ticket updated.");
    return;
  }
  if (event.target.id !== "ticket-form") return;
  const ticket = { id: `TKT-2026-${String(43 + tickets.length - 5).padStart(4, "0")}`, type: form.get("type"), system: form.get("system"), source: form.get("source"), issue: form.get("issue"), concern: form.get("concern"), found: "Today", opened: "Today", status: "Open", pm: false, approver: "asset.manager@blueenergy.example", owner: getSystem(form.get("system")).contractor, work: [form.get("work")], files: [] };
  tickets.unshift(ticket); saveWorkspace(); closeModal(); state.ticketFilter = "All open"; renderTicketWorkroom(ticket.id); showToast("New ticket created with a dedicated email address.");
});

renderSystemRegister();



// Asset-name correction: retained IDs preserve linked tickets and maintenance history.
(() => {
  let changed = false;
  const updateSystem = (id, patch) => {
    const record = systems.find((system) => system.id === id);
    if (!record) return;
    Object.entries(patch).forEach(([key, value]) => {
      if (record[key] !== value) {
        record[key] = value;
        changed = true;
      }
    });
  };
  const addSystem = (record) => {
    if (!systems.some((system) => system.id === record.id)) {
      systems.push(importedSystem(record));
      changed = true;
    }
  };

  updateSystem("SYS-002", { name: "Smuts Boer Agri Dam", offtaker: "Smuts Boer Agri Dam", systemCount: 1 });
  updateSystem("SYS-003", { name: "Smuts Boer Agri Olyvendal", offtaker: "Smuts Boer Agri Olyvendal" });

  const sleepoverShared = {
    epc: "Coalition Africa", contractor: "Coalition Africa", offtaker: "Sleepover",
    contactName: "Sheldon Clements",
    contact: "sheldon.clements@sleepover.travel and theunis.bothma@sleepover.travel",
    platform: "Deye Cloud/Augos", cod: "28 February 2026",
    nextPm: "30 December 2026", lastPm: "1 July 2026", systemCount: 1
  };

  updateSystem("SYS-011", {
    ...sleepoverShared, name: "Sleepover Lanseria", kwp: 64.9, kwh: 122.88,
    updates: ["Imported from asset register", "Site record corrected from the former combined Sleepover entry."]
  });
  updateSystem("SYS-012", {
    ...sleepoverShared, name: "Sleepover Phabeni", kwp: 106.2, kwh: 61.44,
    ppaRate: "", ppaAnnualIncrease: "", ppaIncreaseDate: "", ppaTenor: null,
    eassRate: "", eassAnnualIncrease: "", eassIncreaseDate: "", eassTenor: null,
    updates: ["Imported from asset register", "Site separated from the former combined Sleepover entry; capacity follows the Coalition Africa Phabeni proposal."]
  });
  addSystem({
    ...sleepoverShared, id: "SYS-018", name: "Sleepover Kruger", kwp: 106.2, kwh: 245.76,
    updates: ["Imported from asset register", "Site separated from the former combined Sleepover entry; capacity follows the Coalition Africa Kruger Gate proposal."]
  });
  addSystem({
    ...sleepoverShared, id: "SYS-019", name: "Sleepover Orpen", kwp: 106.2, kwh: 245.76,
    updates: ["Imported from asset register", "Site separated from the former combined Sleepover entry; capacity follows the Coalition Africa Orpen Gate proposal."]
  });

  if (changed) saveWorkspace();
})();
