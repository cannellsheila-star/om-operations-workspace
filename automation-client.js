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
    { id: "SYS-017", name: "Smuts Broers Workshop", kwp: null, kwh: null, systemCount: 1, status: "Attention required", cod: "Not recorded", platform: "Not recorded", epc: "Sustain EPC", contractor: "Sustain EPC", contractorEmail: "", contactName: "", contact: "", offtaker: "Smuts Broers", nextPm: "Not scheduled", lastPm: "Not recorded", folder: "", monitoringUrl: "", monitoring: "Monitoring platform not recorded", alert: "Critical remediation register items are awaiting action.", updates: ["Added from Smuts Broers Solar Remediation Register"], documents: [] },
    { id: "SYS-020", name: "Riverstone", kwp: null, kwh: null, systemCount: 1, status: "Attention required", cod: "Not recorded", platform: "FusionSolar/Augos", epc: "Blue EPcM", contractor: "Blue EPcM", contractorEmail: "", contactName: "", contact: "", offtaker: "Riverstone", nextPm: "Not scheduled", lastPm: "Not recorded", folder: "", monitoringUrl: "", monitoring: "FusionSolar/Augos", alert: "Operational issues identified in the August 2026 site review.", updates: ["Added to record incident work identified in the Riverstone and Borbet review"], documents: [] }
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
    },
    {
      id: "TKT-2026-0004", type: "Operational issue", system: "SYS-005", source: "On-site inspection", issue: "11 kV shutdown and electrical isolation incident", concern: "Critical", found: "4 September 2026", opened: "15 September 2026", status: "Open", pm: false, approver: "", owner: "Technoserve Medium Voltage",
      work: [
        "An electrical fault occurred during an attempted earth on the Eskom incomer on 4 September 2026. Upstream protection operated; the formal root-cause investigation remains open.",
        "Penflex is operating islanded while the Eskom path is unavailable: PV and BESS supply the site during the day, with a 650 kVA generator as backup and for night supply.",
        "Technoserve Medium Voltage is replacing the RM AirSet and affected 11 kV cables and VT terminations, followed by electrical testing, commissioning and restoration.",
        "Next: add investigation evidence, rectification test results, commissioning evidence and the final restoration status."
      ],
      files: [{ name: "SN Electrical Technical Incident Report - SNIR001 (view)", url: "/documents/tickets/Penflex_SN_Electrical_Incident_Report.html" }], emailHistory: [], emailRouting: "Not active. Do not send to this address until the Microsoft 365 or inbound-mail routing is configured."
    },
    { id: "TKT-2026-0005", type: "Operational issue", system: "SYS-008", source: "Asset review", issue: "Confirmed PV string losses across Borbet Plants 1 and 2", concern: "High", found: "26 September 2025 - 12 August 2026", opened: "15 September 2026", status: "Open", pm: false, approver: "", owner: "Blue EPcM", work: ["Site review confirmed 16 strings without a corresponding reassigned Fusion PV input: five in Plant 1 and 11 in Plant 2.", "Verify each string on site, trace DC circuits and restore confirmed failed strings. Update this ticket with test results and completed repairs."], files: [], emailHistory: [] },
    { id: "TKT-2026-0006", type: "Operational issue", system: "SYS-008", source: "Asset review", issue: "Isolator 6 handle not operational", concern: "High", found: "20 August 2026", opened: "15 September 2026", status: "Open", pm: false, approver: "", owner: "Blue EPcM", work: ["Inspection identified a non-working handle on Isolator 6.", "Inspect, make safe, repair or replace the isolator handle and record functional testing."], files: [], emailHistory: [] },
    { id: "TKT-2026-0007", type: "Operational issue", system: "SYS-008", source: "Asset review", issue: "Hotspot identified on Plant 2 Inverter 4 String 2", concern: "High", found: "20 August 2026", opened: "15 September 2026", status: "Open", pm: false, approver: "", owner: "Blue EPcM", work: ["A hotspot was identified on Plant 2, Inverter 4, String 2.", "Inspect the module and associated connections, repair or replace affected equipment, and capture thermal evidence after rectification."], files: [], emailHistory: [] },
    { id: "TKT-2026-0008", type: "Operational issue", system: "SYS-020", source: "Asset review", issue: "Confirmed PV string losses across Riverstone Rooms 1 and 4", concern: "High", found: "26 November 2025 - 8 May 2026", opened: "15 September 2026", status: "Open", pm: false, approver: "", owner: "Blue EPcM", work: ["Site review confirmed eight strings without a corresponding reassigned Fusion PV input: four in Room 1 and four in Room 4.", "Verify each string on site, trace DC circuits and restore confirmed failed strings. Update this ticket with test results and completed repairs."], files: [], emailHistory: [] },
    { id: "TKT-2026-0009", type: "Operational issue", system: "SYS-020", source: "Asset review", issue: "Displaced PV module mounting or retaining clip", concern: "High", found: "20 August 2026", opened: "15 September 2026", status: "Open", pm: false, approver: "", owner: "Blue EPcM", work: ["The review identified a displaced PV module mounting or retaining clip.", "Inspect the affected module, secure it with compliant retention hardware and record photographic evidence after completion."], files: [], emailHistory: [] },
    { id: "TKT-2026-0010", type: "Operational issue", system: "SYS-020", source: "Asset review", issue: "Low insulation resistance reported - Room 4 Inverter 1", concern: "Critical", found: "20 August 2026", opened: "15 September 2026", status: "Open", pm: false, approver: "", owner: "Blue EPcM", work: ["Low insulation resistance was reported at Room 4, Inverter 1.", "Isolate and investigate the affected circuit, complete insulation-resistance testing after repairs and record the safe restoration."], files: [], emailHistory: [] },
    { id: "TKT-2026-0011", type: "Operational issue", system: "SYS-020", source: "Asset review", issue: "Metering review required across Riverstone Rooms 1 to 4", concern: "Medium", found: "20 August 2026", opened: "15 September 2026", status: "Open", pm: false, approver: "", owner: "Blue EPcM", work: ["The review called for metering attention across Rooms 1 to 4.", "Verify meter communications, readings and configuration; record discrepancies and corrective actions in this ticket."], files: [], emailHistory: [] }
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
  tickets.forEach((ticket) => {
    const stage = ticket.workflow || (["Pending Quote", "Quote Approval"].includes(ticket.status) ? ticket.status : "");
    if (stage && ticket.status !== "Completed") {
      if (ticket.status !== "Open") {
        ticket.status = "Open";
        changed = true;
      }
      if (ticket.workflow !== stage) {
        ticket.workflow = stage;
        changed = true;
      }
    }
  });
  if (changed) saveWorkspace();
})();

// Repaint the overview only after the corrected records and linked tickets are in place.
if (state.view === "overview") renderSystemRegister();
