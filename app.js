const systems = [
  {
    id: "SYS-001", name: "Lakeview Hybrid", kwp: 800, kwh: 1200, epc: "SunBuild", cod: "14 May 2023",
    contractor: "SolarCare", offtaker: "Lakeview Properties", contact: "operations@solarcare.example",
    status: "Attention required", nextPm: "September 2026", lastPm: "14 March 2026",
    documents: ["SLD.pdf", "Asset Register.xlsx", "Module Layout.pdf"],
    folder: "Secure system folder — connect URL", monitoring: "Inverter portal · last sync 09:20",
    alert: "Inverter B output is below its expected range. An operational ticket is in progress.",
    updates: ["Monitoring created TKT-2026-0042", "PM date request is due this month", "System documents last reviewed 18 Aug 2026"],
  },
  {
    id: "SYS-002", name: "Mhlabeni Retail", kwp: 1200, kwh: 600, epc: "Renew Works", cod: "02 November 2022",
    contractor: "EcoServe", offtaker: "Mhlabeni Retail", contact: "support@ecoserve.example",
    status: "Operational", nextPm: "October 2026", lastPm: "16 April 2026",
    documents: ["SLD.pdf", "Asset Register.xlsx", "Site photos"],
    folder: "Secure system folder — connect URL", monitoring: "Monitoring dashboard · no current issue",
    alert: "No active monitoring exception.", updates: ["DC string balance review is open", "Monitoring synchronised 09:10", "Site photos available in record"],
  },
  {
    id: "SYS-003", name: "Northgate Logistics", kwp: 650, kwh: 900, epc: "SunBuild", cod: "18 March 2024",
    contractor: "SolarCare", offtaker: "Northgate Logistics", contact: "operations@solarcare.example",
    status: "Non-operational", nextPm: "September 2026", lastPm: "22 March 2026",
    documents: ["SLD.pdf", "Asset Register.xlsx", "Inverter report.pdf"],
    folder: "Secure system folder — connect URL", monitoring: "SCADA alert · communication issue open",
    alert: "Communication loss requires quote approval before corrective work can start.", updates: ["Quote Approval requested for TKT-2026-0042", "SCADA stopped reporting at 08:14", "Corrective work flagged for next PM"],
  },
  {
    id: "SYS-004", name: "Umzi Foods", kwp: 450, kwh: 400, epc: "SolarBuild Co.", cod: "11 August 2023",
    contractor: "Bright O&M", offtaker: "Umzi Foods", contact: "service@brightom.example",
    status: "Operational", nextPm: "November 2026", lastPm: "14 May 2026",
    documents: ["SLD.pdf", "Module Layout.pdf", "PM history.pdf"],
    folder: "Secure system folder — connect URL", monitoring: "Monitoring dashboard · last PM complete",
    alert: "No active monitoring exception.", updates: ["Safety signage ticket completed", "PM completion saved 14 May 2026", "Close-out photographs attached"],
  },
];

const tickets = [
  { id: "TKT-2026-0042", type: "Operational issue", system: "SYS-003", source: "Monitoring alert", issue: "Inverter communication loss", concern: "Critical", found: "18 Aug 2026", opened: "18 Aug 2026", status: "Quote Approval", pm: true, approver: "asset.manager@blueenergy.example", owner: "SolarCare", work: ["Fault finding completed", "Await quote approval", "Install replacement module and verify SCADA data"], files: ["SCADA fault report.pdf", "Supplier quotation.pdf"] },
  { id: "TKT-2026-0041", type: "Maintenance finding", system: "SYS-001", source: "PM visit", issue: "Module clamp replacement", concern: "Medium", found: "20 Aug 2026", opened: "20 Aug 2026", status: "Pending Quote", pm: true, approver: "asset.manager@blueenergy.example", owner: "SolarCare", work: ["Loose clamp logged during PM", "Receive contractor quote", "Approve repair and add to PM pack"], files: ["PM inspection report.pdf"] },
  { id: "TKT-2026-0040", type: "Restorative work", system: "SYS-001", source: "Asset review", issue: "Replace degraded battery isolators", concern: "Planned", found: "19 Aug 2026", opened: "19 Aug 2026", status: "Open", pm: false, approver: "operations.lead@blueenergy.example", owner: "SolarCare", work: ["Scope restorative replacement", "Agree site date", "Close after installation and testing"], files: ["Asset condition review.pdf"] },
  { id: "TKT-2026-0038", type: "Operational issue", system: "SYS-002", source: "On-site inspection", issue: "DC string balance review", concern: "Medium", found: "30 Jul 2026", opened: "30 Jul 2026", status: "Open", pm: false, approver: "asset.manager@blueenergy.example", owner: "EcoServe", work: ["Review current readings", "Review inverter history", "Decide whether corrective work is required"], files: ["Site inspection photos.zip"] },
  { id: "TKT-2026-0035", type: "Maintenance finding", system: "SYS-004", source: "PM visit", issue: "Refresh site safety signage", concern: "Low", found: "12 Jul 2026", opened: "12 Jul 2026", status: "Completed", pm: false, approver: "asset.manager@blueenergy.example", owner: "Blue Energy Africa", work: ["Signage replacement complete", "Close-out photographs saved", "Completion recorded 03 Aug 2026"], files: ["Close-out photos.zip"] },
];

const maintenance = [
  { id: "MNT-2026-09-01", system: "SYS-001", month: "September 2026", status: "Dates requested", completion: "", linked: 1 },
  { id: "MNT-2026-09-03", system: "SYS-003", month: "September 2026", status: "PM pack prepared", completion: "", linked: 1 },
  { id: "MNT-2026-10-02", system: "SYS-002", month: "October 2026", status: "Scheduled", completion: "", linked: 0 },
  { id: "MNT-2026-11-04", system: "SYS-004", month: "November 2026", status: "Completed", completion: "14 November 2026", linked: 0 },
];

const state = { view: "systems", selectedSystem: "SYS-001", selectedTicket: "TKT-2026-0040", selectedMaintenance: "MNT-2026-09-03", ticketFilter: "All open" };

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

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { toast.hidden = true; }, 3400);
}

function setNav() {
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.nav === state.view));
}

function pageHeader(nextTitle, nextEyebrow, actionLabel = "") {
  title.textContent = nextTitle;
  eyebrow.textContent = nextEyebrow;
  primaryAction.textContent = actionLabel;
  primaryAction.hidden = !actionLabel;
  backButton.hidden = ["systems", "tickets", "maintenance", "automation"].includes(state.view);
}

function renderSystems() {
  state.view = "systems";
  pageHeader("Systems overview", "PORTFOLIO COMMAND CENTRE", "Add system");
  const operational = systems.filter((system) => system.status === "Operational").length;
  const attention = systems.filter((system) => system.status === "Attention required").length;
  const nonOperational = systems.filter((system) => system.status === "Non-operational").length;
  appView.innerHTML = `
    <p class="subtitle"><span class="status-dot"></span>Live status across ${systems.length} solar systems. Click a system to open its full operating record.</p>
    <div class="stat-grid">
      <article class="stat-card"><span>Operational</span><strong>${operational}</strong><span>Systems operating normally</span></article>
      <article class="stat-card"><span>Attention required</span><strong>${attention}</strong><span>Needs O&amp;M action</span></article>
      <article class="stat-card"><span>Non-operational</span><strong>${nonOperational}</strong><span>Critical recovery open</span></article>
    </div>
    <div class="section-header"><h2>Managed assets</h2><button class="text-link" data-action="open-system" data-id="${systems[0].id}">Open system register →</button></div>
    <div class="system-list">
      ${systems.map((system) => `
        <button class="system-card" data-action="open-system" data-id="${system.id}">
          <span><span class="card-title">${system.name}</span><span class="card-meta">${system.id} · EPC: ${system.epc} · COD ${system.cod}</span></span>
          <span class="card-meta"><strong>${system.kwp.toLocaleString()} kWp · ${system.kwh.toLocaleString()} kWh</strong><br />O&amp;M: ${system.contractor}</span>
          ${tag(system.status)}
          <span class="card-meta"><strong>${openTicketsForSystem(system.id).length ? `Open tickets ${openTicketsForSystem(system.id).length}` : "Next PM"}</strong><br />${system.nextPm}</span>
        </button>
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
      <div><p class="eyebrow">${system.id}</p><h2>${system.name}</h2><p class="muted">${system.kwp.toLocaleString()} kWp · ${system.kwh.toLocaleString()} kWh · COD ${system.cod}</p></div>
      <div>${tag(system.status)} <button class="button button-muted" data-action="folder">Open share folder ↗</button></div>
    </div>
    <div class="record-grid">
      <div>
        <section class="surface">
          <div class="surface-title"><h3>Asset profile</h3><span class="muted">Primary contacts and dates</span></div>
          <div class="details-grid">
            ${detail("EPC installer", system.epc)}${detail("O&M contractor", system.contractor)}${detail("COD date", system.cod)}${detail("Offtaker", system.offtaker)}${detail("O&M contact", system.contact)}${detail("Next PM due", system.nextPm)}${detail("Last PM completion", system.lastPm)}${detail("Open tickets", String(related.length))}
          </div>
        </section>
        <section class="surface">
          <div class="surface-title"><h3>Live monitoring</h3><span class="tag tag-blue">CONNECTED</span></div>
          <div class="monitor-alert"><strong>●</strong><span>${system.alert}<br /><small>${system.monitoring}</small></span></div>
          <div class="timeline" style="margin-top:18px;">${system.updates.map((update, index) => `<div class="timeline-item"><span class="timeline-date">${index === 0 ? "LATEST" : "UPDATE"}</span><span class="timeline-copy">${update}</span></div>`).join("")}</div>
        </section>
      </div>
      <div>
        <section class="surface">
          <div class="surface-title"><h3>Document library</h3><button class="text-link" data-action="folder">Add folder link</button></div>
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
  pageHeader("One tickets area", "ALL ACTIONS IN ONE PLACE", "New ticket");
  const filters = ["All open", "Monitoring alert", "PM visit", "On-site inspection", "Asset review", "Completed"];
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
          <span>${tag(ticket.status)}<span class="card-meta" style="display:block;margin-top:5px;">${ticket.type}</span></span>
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
      <div>${tag(ticket.status)} ${tag(ticket.concern)}</div>
    </div>
    <div class="workroom-grid">
      <div>
        <section class="surface">
          <div class="surface-title"><h3>Work log & next action</h3><span class="muted">Owner: ${ticket.owner}</span></div>
          <div class="timeline">${ticket.work.map((item, index) => `<div class="timeline-item"><span class="timeline-date">${index === 0 ? ticket.opened : `STEP ${index + 1}`}</span><span class="timeline-copy">${item}</span></div>`).join("")}</div>
          <div class="monitor-alert" style="margin-top:18px;background:#e9f3ff;color:#164b7c;"><strong>NEXT</strong><span>${ticket.status === "Quote Approval" ? `Approval email is ready for ${ticket.approver}.` : `Keep the work log updated and move the ticket through the workflow.`}</span></div>
        </section>
        <section class="surface">
          <div class="surface-title"><h3>Attachments, photos & documents</h3></div>
          <div class="upload-area"><input id="file-input" type="file" multiple aria-label="Add files or photos" /><span class="muted">Files are held with this ticket record.</span><div id="file-list">${ticket.files.map((file) => `<span class="file-chip">${file}</span>`).join("")}</div></div>
        </section>
      </div>
      <div>
        <section class="surface">
          <div class="surface-title"><h3>Dedicated ticket email</h3><button class="text-link" data-action="copy-email">Copy</button></div>
          <div class="email-address">${ticketEmail(ticket.id)}</div>
          <p class="muted">Every sent and received message belongs to this record.</p>
          <div class="email-row"><strong>${ticket.owner}</strong><span>Inspection or quote update</span><span class="tag tag-blue">Reply</span></div>
          <div class="email-row"><strong>Blue Energy</strong><span>Work package and evidence</span><span class="tag tag-green">Sent</span></div>
          <div class="email-row"><strong>${ticket.owner}</strong><span>${ticket.status === "Quote Approval" ? "Supplier quote received" : "Update requested"}</span><span class="tag tag-blue">Reply</span></div>
          <button class="button button-primary" style="width:100%;margin-top:16px;" data-action="prepare-email">Prepare update email</button>
        </section>
        <section class="surface">
          <div class="surface-title"><h3>Routing controls</h3></div>
          <label class="checkbox-line"><input type="checkbox" id="pm-toggle" ${ticket.pm ? "checked" : ""} /> Include in next PM package</label>
          <p class="muted">When selected, this ticket travels with the next relevant maintenance package.</p>
          <label class="checkbox-line"><input type="checkbox" id="approval-toggle" ${ticket.status === "Quote Approval" ? "checked" : ""} /> Quote approval needed</label>
          <p class="muted">Selected approver: <strong>${ticket.approver}</strong></p>
          ${ticket.status === "Quote Approval" ? `<button class="button button-muted" data-action="quote-approved">Record approval</button>` : ""}
        </section>
      </div>
    </div>
  `;
}

function renderMaintenance() {
  state.view = "maintenance";
  pageHeader("Maintenance planner", "SIX-MONTH PM CYCLE", "Schedule PM");
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

function renderAutomation() {
  state.view = "automation";
  pageHeader("Automation rules", "WORKFLOW REQUIREMENTS");
  const rules = [
    ["Quote approval", "Ticket status changes to Quote Approval", "Prepare email to the selected approver with the quote and ticket documents", "Approval response returns to the ticket"],
    ["Include next PM", "Ticket PM checkbox is selected", "Add the ticket to the next relevant PM package with linked documents", "Corrective or restorative work appears in scope"],
    ["PM scheduling", "System becomes due in its six-month cycle", "Prepare date request to off-taker and work package for O&M contractor", "Email history stays with the maintenance event"],
    ["PM complete", "Actual completion date is saved", "Notify off-taker and write completion into system PM history", "Monthly view turns completed"],
  ];
  appView.innerHTML = `<p class="subtitle">These are the product rules for the developer build. The visible controls in Systems, Tickets and Maintenance map directly to each rule.</p><div class="rule-list">${rules.map(([event, trigger, action, outcome]) => `<article class="rule"><div><strong>${event}</strong><span>Workflow event</span></div><div><strong>Trigger</strong><span>${trigger}</span></div><div><strong>System action</strong><span>${action}</span></div><div><strong>Record kept</strong><span>${outcome}</span></div></article>`).join("")}</div>`;
}

function openModal(kind, context = {}) {
  modalLayer.hidden = false;
  if (kind === "new-ticket") {
    modalTitle.textContent = "Create ticket";
    modalContent.innerHTML = `<form class="modal-body" id="ticket-form"><div class="form-grid"><div class="field"><label>Ticket type</label><select name="type"><option>Operational issue</option><option>Maintenance finding</option><option>Restorative work</option></select></div><div class="field"><label>System</label><select name="system">${systems.map((system) => `<option value="${system.id}">${system.name}</option>`).join("")}</select></div><div class="field"><label>Source</label><select name="source"><option>Monitoring alert</option><option>PM visit</option><option>On-site inspection</option><option>Asset review</option></select></div><div class="field"><label>Concern</label><select name="concern"><option>Critical</option><option>High</option><option selected>Medium</option><option>Low</option><option>Planned</option></select></div><div class="field full"><label>Issue / work item</label><input name="issue" required placeholder="Describe the issue or work item" /></div><div class="field full"><label>Work log / next action</label><textarea name="work" required placeholder="What is known, what has been done and what needs to happen next?"></textarea></div></div><div class="form-actions"><button class="button button-muted" type="button" data-close-modal>Cancel</button><button class="button button-primary" type="submit">Create ticket</button></div></form>`;
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
  if (action === "open-ticket") renderTicketWorkroom(id);
  if (action === "select-maintenance") { state.selectedMaintenance = id; renderMaintenance(); }
  if (action === "folder") showToast("Secure folder link is ready to connect.");
  if (action === "document") showToast("Document access will connect to the selected system folder.");
  if (action === "add-photo") openModal("files");
  if (action === "copy-email") { navigator.clipboard?.writeText(ticketEmail(state.selectedTicket)); showToast("Dedicated ticket email copied."); }
  if (action === "prepare-email") { const ticket = getTicket(state.selectedTicket); openModal("email", { title: "Prepare ticket update", to: ticket.owner === "Blue Energy Africa" ? "operations@blueenergyafrica.example" : getSystem(ticket.system).contact, subject: `${ticket.id} — ${ticket.issue}`, body: `Please see the current update for ${ticket.id}.\n\nNext action: ${ticket.work.at(-1)}` }); }
  if (action === "prepare-pm-email") { const item = getMaintenance(state.selectedMaintenance); const system = getSystem(item.system); openModal("email", { title: "Prepare PM email package", to: system.contact, subject: `${item.month} PM — ${system.name}`, body: `Please find the PM scope and linked corrective work for ${system.name}. System documents are attached from the selected document library.` }); }
  if (action === "quote-approved") { const ticket = getTicket(state.selectedTicket); ticket.status = "Open"; renderTicketWorkroom(ticket.id); showToast("Approval recorded; ticket returned to the active work queue."); }
  if (action === "queue-email") { closeModal(); showToast("Email package queued for the connected sending service."); }
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-nav]");
  if (nav) { const target = nav.dataset.nav; if (target === "systems") renderSystems(); if (target === "tickets") renderTickets(); if (target === "maintenance") renderMaintenance(); if (target === "automation") renderAutomation(); return; }
  const action = event.target.closest("[data-action]");
  if (action) onAction(action.dataset.action, action.dataset.id);
  const filter = event.target.closest("[data-filter]");
  if (filter) { state.ticketFilter = filter.dataset.filter; renderTickets(); }
  if (event.target.matches("[data-close-modal]")) closeModal();
});

primaryAction.addEventListener("click", () => {
  if (state.view === "tickets") openModal("new-ticket");
  if (state.view === "systems") showToast("System creation is ready for the connected database phase.");
  if (state.view === "maintenance") showToast("New PM event is ready for scheduling.");
});
backButton.addEventListener("click", () => { if (state.view === "system-record") renderSystems(); if (state.view === "ticket-workroom") renderTickets(); });
modalLayer.addEventListener("click", (event) => { if (event.target === modalLayer) closeModal(); });
document.addEventListener("change", (event) => {
  if (event.target.id === "file-input") {
    const ticket = getTicket(state.selectedTicket);
    [...event.target.files].forEach((file) => ticket.files.push(file.name));
    renderTicketWorkroom(ticket.id);
    showToast("Files added to the ticket record.");
  }
  if (event.target.id === "modal-file-input") { showToast(`${event.target.files.length} file${event.target.files.length === 1 ? "" : "s"} selected for the record.`); }
  if (event.target.id === "pm-toggle") { const ticket = getTicket(state.selectedTicket); ticket.pm = event.target.checked; showToast(ticket.pm ? "Ticket will be included in the next PM package." : "Ticket removed from the PM package."); }
});
modalContent.addEventListener("submit", (event) => {
  if (event.target.id !== "ticket-form") return;
  event.preventDefault();
  const form = new FormData(event.target);
  const ticket = { id: `TKT-2026-${String(43 + tickets.length - 5).padStart(4, "0")}`, type: form.get("type"), system: form.get("system"), source: form.get("source"), issue: form.get("issue"), concern: form.get("concern"), found: "Today", opened: "Today", status: "Open", pm: false, approver: "asset.manager@blueenergy.example", owner: getSystem(form.get("system")).contractor, work: [form.get("work")], files: [] };
  tickets.unshift(ticket); closeModal(); state.ticketFilter = "All open"; renderTicketWorkroom(ticket.id); showToast("New ticket created with a dedicated email address.");
});

renderSystems();
