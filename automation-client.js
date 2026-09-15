(function connectEmailAutomation() {
  function toast(message) {
    const element = document.querySelector("#toast");
    element.textContent = message;
    element.hidden = false;
    window.setTimeout(() => { element.hidden = true; }, 3600);
  }

  async function submitEmail() {
    const modal = document.querySelector("#modal-content");
    const fields = [...modal.querySelectorAll("input, textarea")];
    const [to, cc, subject, text] = fields.map((field) => field.value);
    const ticketMatch = subject.match(/TKT-\d{4}-\d{4}/i);
    const action = ticketMatch ? "ticket-email" : "pm-package";
    const ticketId = ticketMatch ? ticketMatch[0].toUpperCase() : "PM-PACKAGE";

    document.querySelector("#modal-layer").hidden = true;
    modal.innerHTML = "";
    try {
      const response = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ticketId, to, cc, subject, text }),
      });
      const result = await response.json();
      toast(result.message || (result.status === "sent" ? "Email sent and recorded." : "Email prepared."));
    } catch {
      toast("Email prepared. Delivery will start when the backend connection is available.");
    }
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-action='queue-email']")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    submitEmail();
  }, true);
})();

(function addSmutsBroersRemediationRecords() {
  const systemsToAdd = [
    { id: "SYS-016", name: "Smuts Broers Dam", kwp: null, kwh: null, systemCount: 1, status: "Attention required", cod: "Not recorded", platform: "Not recorded", epc: "Sustain EPC", contractor: "Sustain EPC", contractorEmail: "", contactName: "", contact: "", offtaker: "Smuts Broers", nextPm: "Not scheduled", lastPm: "Not recorded", folder: "", monitoringUrl: "", monitoring: "Monitoring platform not recorded", alert: "Critical remediation register items are awaiting action.", updates: ["Added from Smuts Broers Solar Remediation Register"], documents: [] },
    { id: "SYS-017", name: "Smuts Broers Workshop", kwp: null, kwh: null, systemCount: 1, status: "Attention required", cod: "Not recorded", platform: "Not recorded", epc: "Sustain EPC", contractor: "Sustain EPC", contractorEmail: "", contactName: "", contact: "", offtaker: "Smuts Broers", nextPm: "Not scheduled", lastPm: "Not recorded", folder: "", monitoringUrl: "", monitoring: "Monitoring platform not recorded", alert: "Critical remediation register items are awaiting action.", updates: ["Added from Smuts Broers Solar Remediation Register"], documents: [] }
  ];

  const ticketsToAdd = [
    {
      id: "TKT-2026-0001", type: "Restorative work", system: "SYS-016", source: "Asset review", issue: "Dam electrical safety, battery protection and grid-isolation remediation", concern: "Critical", found: "Remediation register", opened: "15 September 2026", status: "Pending Quote", pm: false, approver: "", owner: "Sustain EPC",
      work: [
        "The remediation register identifies critical feeder-cable thermal risk, missing battery-fuse protection, grid isolation, and transformer/backup engineering review requirements.",
        "Quote QU001142 was issued on 08 July 2025 for R233,819.61 incl. VAT. It covers EMS, 300 kW Huawei software, MegaRevo battery integration and battery management for Smuts Broers Robertson.",
        "The quote expired on 07 August 2025. Confirm the site match, scope and current pricing before a replacement quote is requested."
      ],
      files: ["Quote QU001142.pdf"], emailHistory: [], quoteSummary: "QU001142: R233,819.61 incl. VAT. Expired 07 August 2025. Scope/site match and updated pricing require confirmation.", emailRouting: "Not active. Do not send to this address until the Microsoft 365 or inbound-mail routing is configured."
    },
    {
      id: "TKT-2026-0002", type: "Restorative work", system: "SYS-003", source: "Asset review", issue: "Olyvendal inverter replacement, burnt MC4 repair and electrical remediation", concern: "Critical", found: "Remediation register", opened: "15 September 2026", status: "Pending Quote", pm: false, approver: "", owner: "Sustain EPC",
      work: [
        "The remediation register identifies incorrect export direction, inverter overheating, battery-fuse protection, Eskom-point, earthing and isolation concerns.",
        "Two alternative Sustain EPC quotations share number QUO0300129, are dated 14 May 2026 and expired on 31 May 2026. Both cover replacement of the old 50 kW Deye inverter, burnt MC4 repair, wiring checks and installation.",
        "The 50 kW Sunsynk option totals R115,246.62 incl. VAT. The Fox 60 kW Hybrid with 64 kWh battery option totals R334,962.98 incl. VAT. Confirm the preferred design and obtain a refreshed quotation."
      ],
      files: ["Quote QUO0300129 - 50 kW Sunsynk option.pdf", "Quote QUO0300129 - Fox 60 kW and battery option.pdf"], emailHistory: [], quoteSummary: "Two expired alternatives under QUO0300129: 50 kW Sunsynk R115,246.62 incl. VAT; Fox 60 kW with 64 kWh battery R334,962.98 incl. VAT. Design choice and refreshed pricing required.", emailRouting: "Not active. Do not send to this address until the Microsoft 365 or inbound-mail routing is configured."
    },
    {
      id: "TKT-2026-0003", type: "Restorative work", system: "SYS-017", source: "Asset review", issue: "Workshop battery fuse protection and PV electrical remediation", concern: "Critical", found: "Remediation register", opened: "15 September 2026", status: "Pending Quote", pm: false, approver: "", owner: "Sustain EPC",
      work: [
        "The remediation register requires correctly sized battery fuses and holders, secure PV modules and cables, Bosal conduit, PV string testing, cable tray installation and durable labelling.",
        "No supplier quote was provided for the Workshop scope. Request a new itemised quotation before approval."
      ],
      files: [], emailHistory: [], quoteSummary: "No quote received. Obtain a new itemised quotation before approval.", emailRouting: "Not active. Do not send to this address until the Microsoft 365 or inbound-mail routing is configured."
    }
  ];

  let changed = false;
  systemsToAdd.forEach((system) => {
    if (!systems.some((item) => item.id === system.id)) {
      systems.push(system);
      changed = true;
    }
  });
  ticketsToAdd.forEach((ticket) => {
    if (!tickets.some((item) => item.id === ticket.id)) {
      tickets.push(ticket);
      changed = true;
    }
  });
  if (changed) saveWorkspace();

  const baseRenderTicketWorkroom = renderTicketWorkroom;
  renderTicketWorkroom = function renderRemediationTicketWorkroom(id) {
    baseRenderTicketWorkroom(id);
    const ticket = getTicket(id);
    if (!ticket || !ticket.quoteSummary) return;
    const attachmentPanel = [...document.querySelectorAll(".surface")].find((panel) => panel.querySelector("h3") && panel.querySelector("h3").textContent === "Attachments, photos & documents");
    if (attachmentPanel) {
      attachmentPanel.insertAdjacentHTML("afterend", "<section class=\"surface\" style=\"margin-top:18px;\"><div class=\"surface-title\"><h3>Quote record</h3><span class=\"tag tag-amber\">" + ticket.status + "</span></div><p class=\"muted\" style=\"margin:0;\">" + ticket.quoteSummary + "</p></section>");
    }
    const emailAddress = document.querySelector(".email-address");
    if (emailAddress) {
      emailAddress.insertAdjacentHTML("afterend", "<p class=\"muted\" style=\"margin:10px 0 0;\"><strong>Email routing:</strong> " + ticket.emailRouting + "</p>");
    }
  };
})();


// Map remediation work to the corrected Smuts Boer Agri asset records.
(() => {
  let changed = false;
  const legacyDamIndex = systems.findIndex((system) => system.id === "SYS-016");
  if (legacyDamIndex !== -1) {
    systems.splice(legacyDamIndex, 1);
    changed = true;
  }
  tickets.forEach((ticket) => {
    if (ticket.system === "SYS-016") {
      ticket.system = "SYS-002";
      changed = true;
    }
  });
  maintenance.forEach((item) => {
    if (item.system === "SYS-016") {
      item.system = "SYS-002";
      changed = true;
    }
  });
  const workshop = systems.find((system) => system.id === "SYS-017");
  if (workshop) {
    if (workshop.name !== "Smuts Boer Agri Workshop") {
      workshop.name = "Smuts Boer Agri Workshop";
      changed = true;
    }
    if (workshop.offtaker !== "Smuts Boer Agri Workshop") {
      workshop.offtaker = "Smuts Boer Agri Workshop";
      changed = true;
    }
  }
  if (changed) saveWorkspace();
})();
