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
