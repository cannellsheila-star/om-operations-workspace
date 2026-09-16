(() => {
  const GEN_OFFSET = {
    id: "eskom-gen-offset-2026-27",
    name: "Gen-offset",
    provider: "Eskom",
    providerId: "eskom",
    customerClass: "Net-billing / offset reconciliation",
    effectiveFrom: "2026-04-01",
    effectiveTo: "2027-03-31",
    structure: {
      type: "complex",
      transaction: "offset",
      tou: true,
      creditBasis: "Exported active energy credited by season and TOU using the applicable underlying tariff, excluding the GCC portion included in TOU energy rates; losses vary by voltage and Transmission zone.",
      ancillaryServiceCredit: true,
      administrationCharge: true,
      monthlyExportCreditLimitedToImportByTouPeriod: true
    },
    requirements: [
      "qualifying underlying TOU tariff",
      "Urban or Rural supply classification",
      "supply voltage",
      "Transmission zone",
      "exported kWh by peak / standard / off-peak period",
      "imported kWh by peak / standard / off-peak period"
    ],
    aliases: ["gen-offset", "gen offset", "offset", "net-billing", "net billing"]
  };

  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
  const norm = (v) => String(v || "").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim();
  const dateLabel = (v) => { const d = new Date(`${v}T00:00:00`); return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-ZA", { day:"2-digit", month:"long", year:"numeric" }); };

  function hiddenInput(form, name) {
    let input = form.elements[name];
    if (input) return input;
    input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    form.appendChild(input);
    return input;
  }

  function summary() {
    return "Complex Gen-offset structure · TOU export credit based on the eligible underlying tariff, supply voltage and Transmission zone · ancillary service credit · administration charge";
  }

  function previewHtml() {
    return `<div class="tariff-preview-grid">
      <span><small>Customer class</small><strong>${esc(GEN_OFFSET.customerClass)}</strong></span>
      <span><small>Structure</small><strong>complex net-billing / offset</strong></span>
      <span><small>Effective</small><strong>${esc(dateLabel(GEN_OFFSET.effectiveFrom))} – ${esc(dateLabel(GEN_OFFSET.effectiveTo))}</strong></span>
      <span class="tariff-preview-wide"><small>Rates / components</small><strong>Exported energy is credited by peak, standard and off-peak period using the applicable underlying Eskom TOU tariff. The credit excludes the GCC portion embedded in the TOU energy rate and includes applicable losses by voltage and Transmission zone. Ancillary-service credit and an administration charge also apply.</strong></span>
      <span class="tariff-preview-wide"><small>Additional billing inputs required</small><strong>${esc(GEN_OFFSET.requirements.join(" · "))}</strong></span>
    </div>`;
  }

  function applyGenOffset(form, source = "manual") {
    const set = (name, value) => { const input = form.elements[name]; if (input) input.value = value; };
    set("gridSupply", "Eskom");
    set("tariffName", GEN_OFFSET.name);
    set("utilityTariff", summary());
    set("tariffEffectiveDate", dateLabel(GEN_OFFSET.effectiveFrom));
    if (form.elements.tariffAnnualIncrease && !String(form.elements.tariffAnnualIncrease.value || "").trim()) form.elements.tariffAnnualIncrease.value = "Per published annual tariff schedule";
    hiddenInput(form, "tariffProvider").value = "Eskom";
    hiddenInput(form, "tariffProviderId").value = "eskom";
    hiddenInput(form, "tariffId").value = GEN_OFFSET.id;
    hiddenInput(form, "tariffStructure").value = JSON.stringify(GEN_OFFSET.structure);
    hiddenInput(form, "tariffCustomerClass").value = GEN_OFFSET.customerClass;
    hiddenInput(form, "tariffSource").value = source === "bill" ? "Electricity bill + Eskom 2026/27 Gen-offset schedule" : "Eskom 2026/27 Gen-offset schedule";
    const preview = form.querySelector("[data-tariff-preview]");
    if (preview) preview.innerHTML = previewHtml();
    const status = form.querySelector("[data-tariff-status]");
    if (status) {
      status.className = "tariff-status ok";
      status.textContent = source === "bill" ? "Eskom · Gen-offset identified from the uploaded bill." : "Eskom · Gen-offset selected.";
    }
  }

  function addOption(form) {
    const provider = form.querySelector("[data-tariff-provider]");
    const select = form.querySelector("[data-tariff-select]");
    if (!provider || !select || provider.value !== "eskom") return;
    if (!select.querySelector(`option[value="${GEN_OFFSET.id}"]`)) {
      const option = document.createElement("option");
      option.value = GEN_OFFSET.id;
      option.textContent = GEN_OFFSET.name;
      select.appendChild(option);
    }
    const system = getSystem?.(form.dataset.systemId);
    const saved = String(system?.tariffId || "");
    if (saved === GEN_OFFSET.id || norm(system?.tariffName) === "gen offset") {
      select.value = GEN_OFFSET.id;
      const preview = form.querySelector("[data-tariff-preview]");
      if (preview) preview.innerHTML = previewHtml();
    }
  }

  async function extractPdfText(file) {
    const pdfjs = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.mjs";
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      pages.push(content.items.map((i) => i.str).join(" "));
    }
    return pages.join("\n");
  }

  async function readBill(file) {
    if (/pdf/i.test(file.type) || /\.pdf$/i.test(file.name)) return extractPdfText(file);
    if (/text|json|csv|xml|html/i.test(file.type) || /\.(txt|csv|json|xml|html?)$/i.test(file.name)) return file.text();
    return "";
  }

  function wire(form) {
    if (!form || form.dataset.eskomExtraTariffs === "1") return;
    form.dataset.eskomExtraTariffs = "1";
    const provider = form.querySelector("[data-tariff-provider]");
    const select = form.querySelector("[data-tariff-select]");
    const bill = form.querySelector("[data-tariff-bill]");
    if (!provider || !select) return;

    const ensure = () => setTimeout(() => addOption(form), 0);
    provider.addEventListener("change", ensure);
    ensure();

    select.addEventListener("change", () => {
      if (select.value === GEN_OFFSET.id) applyGenOffset(form, "manual");
    });

    bill?.addEventListener("change", async () => {
      const file = bill.files?.[0];
      if (!file) return;
      try {
        const text = await readBill(file);
        const n = norm(text);
        if (!n.includes("gen offset") && !n.includes("net billing")) return;
        provider.value = "eskom";
        provider.dispatchEvent(new Event("change", { bubbles: true }));
        setTimeout(() => {
          addOption(form);
          select.disabled = false;
          select.value = GEN_OFFSET.id;
          hiddenInput(form, "tariffBillName").value = file.name;
          applyGenOffset(form, "bill");
        }, 30);
      } catch {}
    });
  }

  const baseOpenModal = openModal;
  openModal = function openModalWithEskomExtras(kind, context = {}) {
    const result = baseOpenModal(kind, context);
    if (kind === "system") setTimeout(() => wire(document.querySelector("#system-form")), 20);
    return result;
  };

  document.addEventListener("change", (event) => {
    const form = event.target.closest?.("#system-form");
    if (form) addOption(form);
  });
})();
