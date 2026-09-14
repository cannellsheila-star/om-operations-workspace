(() => {
  const baseOpenModal = openModal;
  const baseOnAction = onAction;

  function planningMonths() {
    const today = new Date();
    return Array.from({ length: 3 }, (_, index) => {
      const month = new Date(today.getFullYear(), today.getMonth() + index, 1);
      return new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric" }).format(month);
    });
  }

  function nextPmId() {
    const year = new Date().getFullYear();
    const highest = maintenance.reduce((number, item) => {
      const match = new RegExp(`^PM-${year}-(\\d+)$`).exec(item.id || "");
      return match ? Math.max(number, Number(match[1])) : number;
    }, 0);
    return `PM-${year}-${String(highest + 1).padStart(4, "0")}`;
  }

  renderTickets = function renderTicketsRestored() {
    state.view = "tickets";
    pageHeader("Tickets", "O&M / OPEN WORK", "New ticket");
    const filters = ["All open", "Monitoring alert", "PM visit", "On-site inspection", "Asset review", "Completed"];
    const visible = tickets.filter((ticket) => {
      if (state.ticketFilter === "All open") return ticket.status !== "Completed";
      if (state.ticketFilter === "Completed") return ticket.status === "Completed";
      return ticket.source === state.ticketFilter;
    });
    const rows = visible.map((ticket) => {
      const system = getSystem(ticket.system);
      return `<button class="ticket-row" data-action="open-ticket" data-id="${ticket.id}">
        <span class="ticket-number">${ticket.id.slice(-4)}</span>
        <span><span class="card-title">${ticket.issue}</span><span class="card-meta">${ticket.id} · ${system?.name || "System needs linking"} · ${ticket.source}</span></span>
        <span>${tag(ticket.status)}<span class="card-meta" style="display:block;margin-top:5px;">${ticket.type}</span></span>
        ${tag(ticket.concern)}
        <span class="card-meta"><strong>${ticket.status === "Completed" ? "Completed" : "Opened"}</strong><br />${ticket.opened}</span>
      </button>`;
    }).join("");
    appView.innerHTML = `
      <p class="subtitle">Every action is a ticket. The source tells you whether it came from monitoring, maintenance, an on-site issue or restorative work.</p>
      <div class="filters">${filters.map((filter) => `<button class="filter ${state.ticketFilter === filter ? "active" : ""}" data-filter="${filter}">${filter}</button>`).join("")}</div>
      <div class="section-header"><h2>Tickets</h2><span class="muted">Click a ticket to open its workroom</span></div>
      <div class="ticket-list">${rows || `<section class="surface" style="display:flex;align-items:center;justify-content:space-between;gap:24px;margin:0;border:0;">
        <div><p class="eyebrow">WORKSPACE READY</p><h3 style="margin:5px 0 7px;">No open tickets</h3><p class="muted" style="margin:0;max-width:660px;">Create a ticket for monitoring, maintenance, on-site issues or restorative work. It opens the full workroom with a log, attachments, dedicated email and PM routing.</p></div>
        <button class="button button-primary" data-action="new-ticket">Create ticket</button>
      </section>`}</div>
    `;
  };

  renderMaintenance = function renderMaintenanceRestored() {
    state.view = "maintenance";
    pageHeader("Maintenance", "O&M / SIX-MONTH PM CYCLE", "Schedule PM");
    const months = planningMonths();
    const selected = getMaintenance(state.selectedMaintenance) || maintenance[0] || null;
    const selectedSystem = selected ? getSystem(selected.system) : null;
    appView.innerHTML = `
      <p class="subtitle">Plan by month, retain the exact completion date and send one controlled package to the selected contacts.</p>
      <div class="calendar-grid">${months.map((month) => {
        const items = maintenance.filter((item) => item.month === month);
        return `<section class="month-card ${items.some((item) => item.id === selected?.id) ? "active" : ""}">
          <h3>${month}</h3><p class="muted">${items.length ? `${items.length} site visit${items.length === 1 ? "" : "s"} due` : "No visits due"}</p>
          ${items.map((item) => { const system = getSystem(item.system); const tone = item.status === "Completed" ? "green" : item.status === "PM pack prepared" ? "amber" : "blue"; return `<button class="maintenance-item ${tone}" data-action="select-maintenance" data-id="${item.id}"><strong>${system?.name || "System needs linking"}</strong><span>${item.status}${item.completion ? ` · Completed ${item.completion}` : item.linked ? ` · ${item.linked} linked ticket${item.linked === 1 ? "" : "s"}` : ""}</span></button>`; }).join("") || `<p class="muted" style="margin-top:16px;border-top:1px solid #ededf1;padding-top:11px;">Schedule a PM visit for a real system to build its work package.</p>`}
        </section>`;
      }).join("")}</div>
      ${selected && selectedSystem ? `
        <div class="section-header"><h2>PM email package</h2><span class="tag tag-${statusTone(selected.status)}">${selected.status}</span></div>
        <div class="email-package">
          <section class="email-card"><h3>1 · Request dates from off-taker</h3><span class="detail-label">TO</span><span class="detail-value">${selectedSystem.contact || "Offtaker email not recorded"}</span><span class="detail-label" style="margin-top:16px;">CC</span><span class="detail-value">Blue Energy Africa CC to be configured</span><div class="message-preview"><strong>Subject: </strong>${selected.month} PM — ${selectedSystem.name}<br /><br />Maintenance is due this month. Please confirm suitable access dates.</div></section>
          <section class="email-card"><h3>2 · Send the O&amp;M work package</h3><span class="detail-label">O&M CONTRACTOR</span><span class="detail-value">${selectedSystem.contractor || "Not recorded"}</span><span class="detail-label" style="margin-top:16px;">TO</span><span class="detail-value">${selectedSystem.contractorEmail || "O&M contractor email not recorded"}</span><div class="message-preview"><strong>Includes:</strong><br />${selected.scope || "Six-month preventative maintenance"} + ${selected.linked || 0} linked corrective ticket${selected.linked === 1 ? "" : "s"}<br /><br />The contractor reply remains with this maintenance event and its linked tickets.</div></section>
        </div>
        <section class="surface" style="margin-top:18px;"><div class="surface-title"><h3>Attachments selected from the system document library</h3><button class="button button-primary" data-action="prepare-pm-email">Prepare email package</button></div><div class="attachment-row">${selectedSystem.documents?.length ? selectedSystem.documents.map((document) => `<span class="tag tag-blue">${document}</span>`).join("") : `<span class="muted">No system documents are linked yet.</span>`}${openTicketsForSystem(selected.system).filter((ticket) => ticket.pm).map((ticket) => `<span class="tag tag-amber">${ticket.id} · ticket record</span>`).join("")}</div><p class="muted" style="margin:16px 0 0;">Once the visit is complete, save the exact completion date. The monthly calendar then turns green.</p></section>
      ` : `
        <div class="section-header"><h2>PM email package</h2><span class="tag tag-amber">Waiting for schedule</span></div>
        <section class="surface"><p class="eyebrow">NO PM VISIT SELECTED</p><h3 style="margin:5px 0 8px;">Schedule a site visit to prepare the two-part PM package.</h3><p class="muted" style="max-width:690px;">The package will request dates from the recorded off-taker contact, send the scope and linked corrective tickets to the O&amp;M contractor, and retain the exact completion date after the visit.</p><button class="button button-primary" data-action="schedule-pm">Schedule PM</button></section>
      `}
    `;
  };

  openModal = function openRestoredModal(kind, context = {}) {
    if (kind !== "pm") return baseOpenModal(kind, context);
    modalLayer.hidden = false;
    modalTitle.textContent = "Schedule PM visit";
    const months = planningMonths();
    modalContent.innerHTML = `<form class="modal-body" id="pm-form"><div class="form-grid"><div class="field"><label>System</label><select name="system">${systems.map((system) => `<option value="${system.id}" ${system.id === state.selectedSystem ? "selected" : ""}>${system.name}</option>`).join("")}</select></div><div class="field"><label>Planning month</label><select name="month">${months.map((month) => `<option value="${month}">${month}</option>`).join("")}</select></div><div class="field"><label>Maintenance type</label><select name="scope"><option>Six-month preventative maintenance</option><option>Corrective work during PM</option></select></div><div class="field"><label>Schedule status</label><select name="status"><option>Scheduled</option><option>Dates requested</option><option>PM pack prepared</option></select></div><div class="field full"><label>Scope / notes</label><textarea name="notes" placeholder="Record the expected maintenance scope, access constraints or work-package notes."></textarea></div></div><p class="muted" style="margin:15px 0 0;">A completion date is added only after the site visit takes place.</p><div class="form-actions"><button class="button button-muted" type="button" data-close-modal>Cancel</button><button class="button button-primary" type="submit">Schedule PM</button></div></form>`;
  };

  onAction = function restoredOnAction(action, id) {
    if (action === "schedule-pm") return openModal("pm");
    if (action === "new-ticket") return baseOpenModal("new-ticket");
    return baseOnAction(action, id);
  };

  primaryAction.addEventListener("click", () => {
    if (state.view === "maintenance") openModal("pm");
  });

  modalContent.addEventListener("submit", (event) => {
    if (event.target.id !== "pm-form") return;
    event.preventDefault();
    const form = new FormData(event.target);
    const systemId = String(form.get("system"));
    const visit = {
      id: nextPmId(), system: systemId, month: String(form.get("month")),
      scope: String(form.get("scope")), status: String(form.get("status")),
      notes: String(form.get("notes")).trim(), completion: "",
      linked: openTicketsForSystem(systemId).filter((ticket) => ticket.pm).length,
    };
    maintenance.unshift(visit);
    state.selectedMaintenance = visit.id;
    saveWorkspace();
    closeModal();
    renderMaintenance();
    showToast("PM visit scheduled. Its package is ready to prepare.");
  });
})();
