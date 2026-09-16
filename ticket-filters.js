(() => {
  state.ticketSearch = state.ticketSearch || "";
  state.ticketUrgency = state.ticketUrgency || "All urgencies";

  const esc = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

  function installStyles() {
    if (document.getElementById("ticket-filter-style")) return;
    const style = document.createElement("style");
    style.id = "ticket-filter-style";
    style.textContent = `
      .ticket-filter-toolbar{display:grid;grid-template-columns:minmax(260px,1.5fr) minmax(180px,.6fr);gap:10px;margin:0 0 14px;padding:12px;border:1px solid #e3e4e9;background:#fff}
      .ticket-filter-field{display:grid;gap:5px}.ticket-filter-field label{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#6d6f85}
      .ticket-filter-field input,.ticket-filter-field select{width:100%;height:38px;border:1px solid #d7d9e0;border-radius:2px;background:#fff;color:#10133f;padding:0 10px;font:inherit}
      .ticket-filter-field input:focus,.ticket-filter-field select:focus{outline:2px solid rgba(23,32,110,.12);border-color:#17206e}
      .ticket-filter-count{margin-left:auto;color:#6d6f85;font-size:12px}
      .ticket-filter-empty{padding:24px 18px;border:1px solid #e5e5ea;background:#fff;color:#6d6f85;text-align:center}
      .ticket-list-head{display:grid;grid-template-columns:66px minmax(220px,1.5fr) minmax(160px,1fr) minmax(128px,.7fr) 125px;gap:16px;align-items:center;padding:9px 17px;border:1px solid #e5e5ea;border-bottom:0;background:#f6f6f8;color:#6d6f85;font-size:10px;font-weight:800;letter-spacing:.045em;text-transform:uppercase}
      .ticket-list-head + .ticket-list{border-top-left-radius:0;border-top-right-radius:0}
      .ticket-row{cursor:pointer}
      @media(max-width:720px){.ticket-filter-toolbar{grid-template-columns:1fr}.ticket-list-head{display:none}}
    `;
    document.head.appendChild(style);
  }

  function sourceVisibleTickets() {
    return tickets.filter((ticket) => {
      if (state.ticketFilter === "All open") return ticket.status !== "Completed";
      if (state.ticketFilter === "Completed") return ticket.status === "Completed";
      return ticket.source === state.ticketFilter;
    });
  }

  function urgencyOptions() {
    const order = ["Critical", "High", "Medium", "Low"];
    const values = [...new Set(tickets.map((ticket) => String(ticket.concern || "").trim()).filter(Boolean))];
    return [...order.filter((value) => values.includes(value)), ...values.filter((value) => !order.includes(value)).sort()];
  }

  function applyLocalFilters() {
    const search = String(state.ticketSearch || "").trim().toLowerCase();
    const urgency = String(state.ticketUrgency || "All urgencies");
    const rows = [...document.querySelectorAll("[data-ticket-filter-row]")];
    let shown = 0;

    rows.forEach((row) => {
      const matchesSearch = !search || String(row.dataset.ticketSearch || "").includes(search);
      const matchesUrgency = urgency === "All urgencies" || row.dataset.ticketUrgency === urgency.toLowerCase();
      const visible = matchesSearch && matchesUrgency;
      row.hidden = !visible;
      if (visible) shown += 1;
    });

    const count = document.querySelector("[data-ticket-filter-count]");
    if (count) count.textContent = `${shown} ticket${shown === 1 ? "" : "s"}`;
    const empty = document.querySelector("[data-ticket-filter-empty]");
    if (empty) empty.hidden = shown !== 0;
  }

  const ticketRenderer = function renderTicketsWithSearchAndUrgency() {
    state.view = "tickets";
    pageHeader("Tickets", "O&M / OPEN WORK", "New ticket");
    installStyles();

    const sourceFilters = ["All open", "Monitoring alert", "PM visit", "On-site inspection", "Asset review", "Asset review completed", "Reported by off-taker", "Other", "Completed"];
    const visible = sourceVisibleTickets();
    const urgencies = urgencyOptions();

    const rows = visible.map((ticket) => {
      const system = getSystem(ticket.system);
      const systemName = system?.name || "System needs linking";
      const searchText = `${ticket.id} ${ticket.issue || ""} ${systemName} ${ticket.source || ""}`.toLowerCase();
      const urgency = String(ticket.concern || "").toLowerCase();
      return `<button class="ticket-row" type="button" data-action="open-ticket" data-id="${esc(ticket.id)}" data-ticket-filter-row data-ticket-search="${esc(searchText)}" data-ticket-urgency="${esc(urgency)}">
        <span class="ticket-number">${esc(ticket.id.slice(-4))}</span>
        <span><span class="card-title">${esc(ticket.issue)}</span><span class="card-meta">${esc(ticket.id)} | ${esc(systemName)} | ${esc(ticket.source)}</span></span>
        <span>${tag(ticket.status)}${ticketWorkflow(ticket) ? tag(ticketWorkflow(ticket)) : ""}</span>
        <span>${tag(ticket.concern)}</span>
        <span class="card-meta"><strong>${ticket.status === "Completed" ? "Completed" : "Opened"}</strong><br />${esc(ticket.opened)}</span>
      </button>`;
    }).join("");

    appView.innerHTML = `
      <p class="subtitle">Every action is a ticket. “Picked up from” records how it was identified.</p>
      <div class="filters">${sourceFilters.map((filter) => `<button class="filter ${state.ticketFilter === filter ? "active" : ""}" data-filter="${esc(filter)}">${esc(filter)}</button>`).join("")}</div>
      <div class="ticket-filter-toolbar">
        <div class="ticket-filter-field"><label>Find by site or ticket name</label><input type="search" data-ticket-search-input value="${esc(state.ticketSearch)}" placeholder="e.g. Riverstone, Penflex, Monitoring"></div>
        <div class="ticket-filter-field"><label>Urgency</label><select data-ticket-urgency-select><option>All urgencies</option>${urgencies.map((urgency) => `<option ${state.ticketUrgency === urgency ? "selected" : ""}>${esc(urgency)}</option>`).join("")}</select></div>
      </div>
      <div class="section-header"><h2>Tickets</h2><span class="ticket-filter-count" data-ticket-filter-count></span></div>
      <div class="ticket-list-head" aria-hidden="true"><span>Ticket</span><span>Ticket / Site</span><span>Status</span><span>Urgency</span><span>Opened</span></div>
      <div class="ticket-list">${rows}</div>
      <div class="ticket-filter-empty" data-ticket-filter-empty hidden>No tickets match the selected name and urgency filters.</div>
    `;

    applyLocalFilters();
  };

  function assertTicketRenderer() {
    try { renderTickets = ticketRenderer; } catch {}
    try { window.renderTickets = ticketRenderer; } catch {}
  }

  assertTicketRenderer();

  // Other monitoring modules load after this file and have historically
  // replaced renderTickets. Re-assert the intended ticket UI after the full
  // synchronous script chain has loaded so filters and labels cannot disappear.
  window.setTimeout(() => {
    assertTicketRenderer();
    if (typeof state !== "undefined" && state.view === "tickets") ticketRenderer();
  }, 0);

  document.addEventListener("input", (event) => {
    if (!event.target.matches("[data-ticket-search-input]")) return;
    state.ticketSearch = event.target.value;
    applyLocalFilters();
  });

  document.addEventListener("change", (event) => {
    if (!event.target.matches("[data-ticket-urgency-select]")) return;
    state.ticketUrgency = event.target.value;
    applyLocalFilters();
  });

  // Open ticket-list rows directly in the workroom. This deliberately bypasses
  // monitoring action wrappers so a later onAction override cannot swallow a
  // ticket click. Linked-ticket controls elsewhere still use the normal action chain.
  document.addEventListener("click", (event) => {
    const row = event.target.closest?.('.ticket-list [data-action="open-ticket"][data-id]');
    if (!row) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const id = row.dataset.id;
    if (id && typeof renderTicketWorkroom === "function") renderTicketWorkroom(id);
  }, true);
})();
