(() => {
  const baseOpenModal = openModal;
  const baseRenderSystemRecord = renderSystemRecord;

  const CATALOG = {
    eskom: {
      provider: "Eskom",
      supply: "Eskom",
      version: "2026/2027",
      tariffs: [
        { id:"eskom-megaflex", name:"Megaflex", customerClass:"Large power Urban", effectiveFrom:"2026-04-01", effectiveTo:"2027-03-31", structure:{type:"complex"}, requirements:["supply voltage","transmission zone / distance band","NMD/AUC","30-minute demand","reactive energy if applicable"], aliases:["megaflex"] },
        { id:"eskom-miniflex", name:"Miniflex", customerClass:"Urban TOU", effectiveFrom:"2026-04-01", effectiveTo:"2027-03-31", structure:{type:"complex"}, requirements:["supply voltage","transmission zone / distance band","NMD/AUC"], aliases:["miniflex"] },
        { id:"eskom-ruraflex", name:"Ruraflex", customerClass:"Rural TOU", effectiveFrom:"2026-04-01", effectiveTo:"2027-03-31", structure:{type:"complex"}, requirements:["supply voltage","transmission zone / distance band","NMD/AUC"], aliases:["ruraflex"] },
        { id:"eskom-nightsave-urban", name:"Nightsave Urban", customerClass:"Urban high-load-factor", effectiveFrom:"2026-04-01", effectiveTo:"2027-03-31", structure:{type:"complex"}, requirements:["supply voltage","transmission zone / distance band","maximum demand"], aliases:["nightsave urban","night save urban"] },
        { id:"eskom-nightsave-rural", name:"Nightsave Rural", customerClass:"Rural high-load-factor", effectiveFrom:"2026-04-01", effectiveTo:"2027-03-31", structure:{type:"complex"}, requirements:["supply voltage","transmission zone / distance band","maximum demand"], aliases:["nightsave rural","night save rural"] },
        { id:"eskom-municflex", name:"Municflex", customerClass:"Local Authority large power", effectiveFrom:"2026-07-01", effectiveTo:"2027-06-30", structure:{type:"complex"}, requirements:["supply voltage","transmission zone / distance band","NMD/AUC","30-minute demand"], aliases:["municflex"] },
        { id:"eskom-megaflex-gen", name:"Megaflex Gen", customerClass:"Urban load + generator", effectiveFrom:"2026-04-01", effectiveTo:"2027-03-31", structure:{type:"complex"}, requirements:["connection voltage","transmission zone","NMD","maximum export capacity","import/export interval data"], aliases:["megaflex gen"] },
        { id:"eskom-ruraflex-gen", name:"Ruraflex Gen", customerClass:"Rural load + generator", effectiveFrom:"2026-04-01", effectiveTo:"2027-03-31", structure:{type:"complex"}, requirements:["connection voltage","transmission zone","NMD","maximum export capacity","import/export interval data"], aliases:["ruraflex gen"] }
      ]
    },
    midvaal: {
      provider: "Midvaal Local Municipality",
      supply: "Municipal",
      version: "2026/2027",
      tariffs: [
        { id:"midvaal-domestic", name:"Domestic Supplies — Conventional / Prepaid", customerClass:"Residential", effectiveFrom:"2026-07-01", effectiveTo:"2027-06-30", structure:{type:"inclining",blocks:[{from:0,to:50,ratePerKwh:2.1786},{from:50,to:350,ratePerKwh:2.8010},{from:350,to:600,ratePerKwh:3.8412},{from:600,to:null,ratePerKwh:4.4694}]}, aliases:["domestic supplies","domestic conventional","domestic prepaid"] },
        { id:"midvaal-nondomestic-lt100", name:"Non-Domestic Supplies — <100 kVA", customerClass:"Commercial / Industrial", effectiveFrom:"2026-07-01", effectiveTo:"2027-06-30", structure:{type:"flat",components:{energyPerKwh:4.6894}}, aliases:["non domestic supplies","less than 100 kva","<100 kva"] },
        { id:"midvaal-demand-lv", name:"Non-Domestic Demand — Low Voltage ≥100 kVA", customerClass:"Commercial / Industrial demand", effectiveFrom:"2026-07-01", effectiveTo:"2027-06-30", structure:{type:"flat",components:{energyPerKwh:3.4507,demandPerKva:311.97}}, aliases:["non domestic demand low voltage","low voltage 100 kva"] },
        { id:"midvaal-demand-mv", name:"Non-Domestic Demand — Medium Voltage ≥100 kVA", customerClass:"Commercial / Industrial demand", effectiveFrom:"2026-07-01", effectiveTo:"2027-06-30", structure:{type:"flat",components:{energyPerKwh:3.4751,demandPerKva:305.20}}, aliases:["non domestic demand medium voltage","medium voltage 100 kva"] },
        { id:"midvaal-offpeak-lv", name:"Midvaal Off-Peak Tariff — Low Voltage", customerClass:"Commercial / Industrial TOU", effectiveFrom:"2026-07-01", effectiveTo:"2027-06-30", structure:{type:"flat",components:{energyPerKwh:2.1532,demandPerKva:674.57}}, aliases:["off peak low voltage","off-peak low voltage"] },
        { id:"midvaal-offpeak-mv", name:"Midvaal Off-Peak Tariff — Medium Voltage", customerClass:"Commercial / Industrial TOU", effectiveFrom:"2026-07-01", effectiveTo:"2027-06-30", structure:{type:"flat",components:{energyPerKwh:2.1532,demandPerKva:642.51}}, aliases:["off peak medium voltage","off-peak medium voltage"] },
        { id:"midvaal-megaflex", name:"Midvaal Megaflex", customerClass:"Large Commercial / Industrial TOU", effectiveFrom:"2026-07-01", effectiveTo:"2027-06-30", structure:{type:"tou",components:{demandPerKva:205.03},seasons:{low:{months:[9,10,11,12,1,2,3,4,5],rates:{peak:5.1906,standard:2.3292,offPeak:1.8334}},high:{months:[6,7,8],rates:{peak:7.8303,standard:3.2423,offPeak:1.9625}}}}, aliases:["midvaal megaflex","megaflex"] },
        { id:"midvaal-bulk-lv", name:"Bulk Supplies — Low Voltage", customerClass:"Major Bulk", effectiveFrom:"2026-07-01", effectiveTo:"2027-06-30", structure:{type:"flat",components:{energyPerKwh:3.5474,demandPerKva:320.72}}, aliases:["bulk supplies low voltage","bulk low voltage"] },
        { id:"midvaal-bulk-mv", name:"Bulk Supplies — Medium Voltage", customerClass:"Major Bulk", effectiveFrom:"2026-07-01", effectiveTo:"2027-06-30", structure:{type:"flat",components:{energyPerKwh:3.5725,demandPerKva:313.75}}, aliases:["bulk supplies medium voltage","bulk medium voltage"] },
        { id:"midvaal-agricultural-standard", name:"Agricultural Supplies — Standard", customerClass:"Agricultural", effectiveFrom:"2026-07-01", effectiveTo:"2027-06-30", structure:{type:"flat",components:{energyPerKwh:5.0685}}, aliases:["agricultural supplies standard","agricultural standard"] }
      ]
    },
    citypower: {
      provider: "City Power Johannesburg",
      supply: "Municipal",
      version: "2026/2027",
      tariffs: [
        { id:"cp-business", name:"Business Conventional / Prepaid", customerClass:"Business", effectiveFrom:"2026-07-01", effectiveTo:"2027-06-30", structure:{type:"seasonal-inclining",fixedMonthly:1744.17,seasons:{summer:{blocks:[{from:0,to:500,ratePerKwh:3.8052},{from:500,to:1000,ratePerKwh:4.1767},{from:1000,to:2000,ratePerKwh:4.3799},{from:2000,to:3000,ratePerKwh:4.5396},{from:3000,to:null,ratePerKwh:4.6869}]},winter:{blocks:[{from:0,to:500,ratePerKwh:3.9837},{from:500,to:1000,ratePerKwh:4.3370},{from:1000,to:2000,ratePerKwh:4.5306},{from:2000,to:3000,ratePerKwh:4.6871},{from:3000,to:null,ratePerKwh:4.8228}]}}}, aliases:["business conventional","business prepaid"] },
        { id:"cp-industrial-lv", name:"Industrial LV", customerClass:"Industrial", effectiveFrom:"2026-07-01", effectiveTo:"2027-06-30", structure:{type:"seasonal-flat",fixedMonthly:3860.67,components:{demandPerKva:461.22,reactivePerKvarh:0.4625},seasons:{summer:{energyPerKwh:2.8496},winter:{energyPerKwh:3.3379}}}, aliases:["industrial lv","industrial low voltage"] },
        { id:"cp-industrial-mv", name:"Industrial MV", customerClass:"Industrial", effectiveFrom:"2026-07-01", effectiveTo:"2027-06-30", structure:{type:"seasonal-flat",fixedMonthly:11732.89,components:{demandPerKva:431.11,reactivePerKvarh:0.4625},seasons:{summer:{energyPerKwh:2.6601},winter:{energyPerKwh:3.1485}}}, aliases:["industrial mv","industrial medium voltage"] },
        { id:"cp-industrial-lv-tou", name:"Industrial LV (TOU)", customerClass:"Industrial", effectiveFrom:"2026-07-01", effectiveTo:"2027-06-30", structure:{type:"tou",fixedMonthly:4629.64,components:{demandPerKva:461.28,reactivePerKvarh:0.4625},seasons:{summer:{rates:{peak:3.2200,standard:2.4242,offPeak:1.8635}},winter:{rates:{peak:7.6624,standard:2.9256,offPeak:2.0044}}}}, aliases:["industrial lv tou","industrial low voltage tou","time of use low voltage"] },
        { id:"cp-industrial-mv-tou", name:"Industrial MV (TOU)", customerClass:"Industrial", effectiveFrom:"2026-07-01", effectiveTo:"2027-06-30", structure:{type:"tou",fixedMonthly:12708.47,components:{demandPerKva:431.11,reactivePerKvarh:0.4625},seasons:{}}, aliases:["industrial mv tou","industrial medium voltage tou","time of use medium voltage"] },
        { id:"cp-res-tou", name:"Residential Time of Use (≤80A)", customerClass:"Residential", effectiveFrom:"2026-07-01", effectiveTo:"2027-06-30", structure:{type:"tou",fixedMonthly:1531.30,exportRate:1.2460,seasons:{summer:{rates:{peak:3.4042,standard:2.6930,offPeak:2.1186}},winter:{rates:{peak:7.8320,standard:3.2083,offPeak:2.2639}}}}, aliases:["residential time of use","residential tou"] },
        { id:"cp-prepaid-low", name:"Residential Prepaid Low", customerClass:"Residential", effectiveFrom:"2026-07-01", effectiveTo:"2027-06-30", structure:{type:"inclining",blocks:[{from:0,to:350,ratePerKwh:2.7237},{from:350,to:500,ratePerKwh:3.3318},{from:500,to:null,ratePerKwh:4.1306}]}, aliases:["residential prepaid low","prepaid low"] },
        { id:"cp-prepaid-high", name:"Residential Prepaid High", customerClass:"Residential", effectiveFrom:"2026-07-01", effectiveTo:"2027-06-30", structure:{type:"inclining",fixedMonthly:210,blocks:[{from:0,to:350,ratePerKwh:2.9046},{from:350,to:500,ratePerKwh:3.3318},{from:500,to:null,ratePerKwh:3.7964}]}, aliases:["residential prepaid high","prepaid high"] }
      ]
    }
  };

  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
  const norm = (v) => String(v || "").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim();
  const money = (v) => Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const dateLabel = (v) => { if (!v) return ""; const d = new Date(`${v}T00:00:00`); return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-ZA",{day:"2-digit",month:"long",year:"numeric"}); };

  function rateSummary(tariff) {
    if (!tariff) return "";
    const s = tariff.structure || {};
    if (s.type === "complex") return `Complex ${tariff.name} structure · voltage/zone/NMD parameters required`;
    const bits = [];
    if (s.components?.energyPerKwh != null) bits.push(`Energy R${money(s.components.energyPerKwh)}/kWh`);
    if (s.components?.demandPerKva != null) bits.push(`Demand R${money(s.components.demandPerKva)}/kVA`);
    if (s.fixedMonthly != null) bits.push(`Fixed R${money(s.fixedMonthly)}/month`);
    if (Array.isArray(s.blocks)) bits.push(s.blocks.map((b) => `${b.from}-${b.to ?? "+"} kWh: R${money(b.ratePerKwh)}`).join(" · "));
    if (s.seasons) {
      Object.entries(s.seasons).forEach(([season, data]) => {
        if (data.energyPerKwh != null) bits.push(`${season}: R${money(data.energyPerKwh)}/kWh`);
        if (data.rates) bits.push(`${season}: peak R${money(data.rates.peak)} · standard R${money(data.rates.standard)} · off-peak R${money(data.rates.offPeak)}/kWh`);
      });
    }
    if (s.exportRate != null) bits.push(`Export R${money(s.exportRate)}/kWh`);
    return bits.join(" · ") || `${String(s.type || "Tariff")} structure`;
  }

  function structureHtml(tariff) {
    if (!tariff) return `<span class="tariff-empty">Select a tariff to see its structure.</span>`;
    return `<div class="tariff-preview-grid">
      <span><small>Customer class</small><strong>${esc(tariff.customerClass || "—")}</strong></span>
      <span><small>Structure</small><strong>${esc(String(tariff.structure?.type || "—").replace(/-/g," "))}</strong></span>
      <span><small>Effective</small><strong>${esc(dateLabel(tariff.effectiveFrom))} – ${esc(dateLabel(tariff.effectiveTo))}</strong></span>
      <span class="tariff-preview-wide"><small>Rates / components</small><strong>${esc(rateSummary(tariff))}</strong></span>
      ${tariff.requirements?.length ? `<span class="tariff-preview-wide"><small>Additional billing inputs required</small><strong>${esc(tariff.requirements.join(" · "))}</strong></span>` : ""}
    </div>`;
  }

  function installStyles() {
    if (document.getElementById("system-tariff-editor-style")) return;
    const style = document.createElement("style");
    style.id = "system-tariff-editor-style";
    style.textContent = `
      .tariff-editor{grid-column:1/-1;border:1px solid #dedfe6;background:#fafafd;padding:14px 16px;margin:4px 0 2px}
      .tariff-editor-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:13px}.tariff-editor-head h3{margin:0;font-size:15px}.tariff-editor-head p{margin:4px 0 0;font-size:11px;color:#6d6f85}
      .tariff-editor-grid{display:grid;grid-template-columns:1fr 1.4fr;gap:12px}.tariff-editor label{display:grid;gap:6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#6d6f85}.tariff-editor select,.tariff-editor input[type=file]{min-height:40px;border:1px solid #d9dae1;background:#fff;padding:8px 10px;font:inherit;color:#10133f;border-radius:2px}
      .tariff-upload{grid-column:1/-1;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;border-top:1px solid #e5e5ea;padding-top:12px}.tariff-upload-copy{display:grid;gap:3px}.tariff-upload-copy strong{font-size:12px}.tariff-upload-copy span{font-size:11px;color:#6d6f85}.tariff-upload input{max-width:390px}
      .tariff-status{grid-column:1/-1;font-size:11px;color:#5f6377;min-height:16px}.tariff-status.ok{color:#17765c}.tariff-status.warn{color:#a86400}
      .tariff-preview{grid-column:1/-1;border:1px solid #e4e4e9;background:#fff;padding:12px}.tariff-preview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.tariff-preview-grid span{display:grid;gap:4px}.tariff-preview-grid small{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#73768a}.tariff-preview-grid strong{font-size:11px;font-weight:600;line-height:1.4}.tariff-preview-wide{grid-column:1/-1}.tariff-empty{font-size:11px;color:#777a8d}
      .tariff-legacy-field-hidden{display:none!important}
      @media(max-width:720px){.tariff-editor-grid,.tariff-upload{grid-template-columns:1fr}.tariff-preview-grid{grid-template-columns:1fr}.tariff-upload input{max-width:none;width:100%}}
    `;
    document.head.appendChild(style);
  }

  function providerFromSystem(system) {
    const saved = norm(system?.tariffProvider || "");
    if (saved.includes("midvaal")) return "midvaal";
    if (saved.includes("city power") || saved.includes("johannesburg")) return "citypower";
    if (saved.includes("eskom")) return "eskom";
    const t = norm(system?.tariffName || "");
    if (t.includes("midvaal")) return "midvaal";
    if (norm(system?.gridSupply) === "eskom") return "eskom";
    return "";
  }

  function findTariff(providerId, value) {
    const provider = CATALOG[providerId];
    if (!provider) return null;
    const target = norm(value);
    if (!target) return null;
    return provider.tariffs.find((t) => t.id === value) || provider.tariffs.find((t) => norm(t.name) === target) || provider.tariffs.find((t) => (t.aliases || []).some((a) => target.includes(norm(a)) || norm(a).includes(target))) || null;
  }

  function hiddenInput(form, name) {
    let input = form.elements[name];
    if (input) return input;
    input = document.createElement("input"); input.type = "hidden"; input.name = name; form.appendChild(input); return input;
  }

  function legacyField(form, name) { return form.elements[name] || null; }
  function hideLegacyFields(form, hide) {
    ["gridSupply","tariffName","utilityTariff","tariffEffectiveDate","tariffAnnualIncrease"].forEach((name) => {
      const input = legacyField(form,name); const field = input?.closest?.(".field"); if (field) field.classList.toggle("tariff-legacy-field-hidden", hide);
    });
  }

  function applyTariff(form, providerId, tariff, source = "manual") {
    const provider = CATALOG[providerId];
    if (!provider || !tariff) return;
    const grid = legacyField(form,"gridSupply"); if (grid) grid.value = provider.supply;
    const name = legacyField(form,"tariffName"); if (name) name.value = tariff.name;
    const rate = legacyField(form,"utilityTariff"); if (rate) rate.value = rateSummary(tariff);
    const date = legacyField(form,"tariffEffectiveDate"); if (date) date.value = dateLabel(tariff.effectiveFrom);
    const increase = legacyField(form,"tariffAnnualIncrease"); if (increase && !String(increase.value||"").trim()) increase.value = "Per published annual tariff schedule";
    hiddenInput(form,"tariffProvider").value = provider.provider;
    hiddenInput(form,"tariffProviderId").value = providerId;
    hiddenInput(form,"tariffId").value = tariff.id;
    hiddenInput(form,"tariffStructure").value = JSON.stringify(tariff.structure || {});
    hiddenInput(form,"tariffCustomerClass").value = tariff.customerClass || "";
    hiddenInput(form,"tariffSource").value = source === "bill" ? "Electricity bill + 2026/27 tariff library" : "2026/27 tariff library";
    const preview = form.querySelector("[data-tariff-preview]"); if (preview) preview.innerHTML = structureHtml(tariff);
  }

  function detectProvider(text) {
    const n = norm(text);
    if (/midvaal/.test(n)) return "midvaal";
    if (/city power|city of johannesburg|johannesburg city power|joburg/.test(n)) return "citypower";
    if (/eskom/.test(n)) return "eskom";
    return "";
  }

  function detectTariff(providerId, text) {
    const provider = CATALOG[providerId]; if (!provider) return null;
    const n = norm(text);
    let best = null, score = 0;
    provider.tariffs.forEach((tariff) => {
      const phrases = [tariff.name, ...(tariff.aliases || [])].map(norm).filter(Boolean);
      let s = 0;
      phrases.forEach((p) => { if (n.includes(p)) s = Math.max(s, 100 + p.length); else { const tokens = p.split(" ").filter((x) => x.length > 2); const hits = tokens.filter((x) => n.includes(x)).length; s = Math.max(s, hits * 10 - (tokens.length - hits) * 3); } });
      if (s > score) { score = s; best = tariff; }
    });
    return score >= 20 ? best : null;
  }

  async function extractPdfText(file) {
    const pdfjs = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.mjs";
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      const page = await pdf.getPage(pageNo); const content = await page.getTextContent(); pages.push(content.items.map((i) => i.str).join(" "));
    }
    return pages.join("\n");
  }

  async function extractBillText(file) {
    if (/pdf/i.test(file.type) || /\.pdf$/i.test(file.name)) return extractPdfText(file);
    if (/text|json|csv|xml|html/i.test(file.type) || /\.(txt|csv|json|xml|html?)$/i.test(file.name)) return file.text();
    throw new Error("This bill format cannot be text-read yet. Upload a PDF, text, CSV or HTML bill.");
  }

  function enhanceSystemForm(system) {
    const form = document.querySelector("#system-form");
    if (!form || form.dataset.tariffEnhanced === "1") return;
    installStyles(); form.dataset.tariffEnhanced = "1";
    const formGrid = form.querySelector(".form-grid"); if (!formGrid) return;
    const editor = document.createElement("section"); editor.className = "tariff-editor";
    editor.innerHTML = `<div class="tariff-editor-head"><div><h3>Electricity tariff</h3><p>Choose from the 2026/27 utility tariff library or upload the latest bill for automatic identification.</p></div><span class="tag tag-blue">2026/27</span></div>
      <div class="tariff-editor-grid">
        <label>Utility<select data-tariff-provider><option value="">Select utility</option><option value="eskom">Eskom</option><option value="midvaal">Midvaal Local Municipality</option><option value="citypower">City Power Johannesburg</option><option value="other">Other / manual</option></select></label>
        <label>Tariff<select data-tariff-select disabled><option value="">Select utility first</option></select></label>
        <div class="tariff-upload"><div class="tariff-upload-copy"><strong>Upload electricity bill</strong><span>PDF is read in the browser to identify the utility and tariff. The bill itself is not sent to a third party.</span></div><input type="file" accept=".pdf,.txt,.csv,.json,.html,text/plain,application/pdf" data-tariff-bill /></div>
        <div class="tariff-status" data-tariff-status></div>
        <div class="tariff-preview" data-tariff-preview>${structureHtml(null)}</div>
      </div>`;
    formGrid.appendChild(editor);

    const providerSelect = editor.querySelector("[data-tariff-provider]");
    const tariffSelect = editor.querySelector("[data-tariff-select]");
    const status = editor.querySelector("[data-tariff-status]");
    const bill = editor.querySelector("[data-tariff-bill]");

    function populate(providerId, selectedId = "") {
      const provider = CATALOG[providerId];
      if (!provider) { tariffSelect.innerHTML = `<option value="">${providerId === "other" ? "Enter tariff manually below" : "Select utility first"}</option>`; tariffSelect.disabled = true; hideLegacyFields(form, providerId !== "other"); return; }
      tariffSelect.disabled = false;
      tariffSelect.innerHTML = `<option value="">Select tariff</option>${provider.tariffs.map((t) => `<option value="${esc(t.id)}" ${t.id === selectedId ? "selected" : ""}>${esc(t.name)}</option>`).join("")}`;
      hideLegacyFields(form, true);
    }

    providerSelect.addEventListener("change", () => {
      const id = providerSelect.value; populate(id); status.textContent = "";
      if (id === "other") { hideLegacyFields(form,false); editor.querySelector("[data-tariff-preview]").innerHTML = `<span class="tariff-empty">Use the manual tariff fields below.</span>`; }
    });
    tariffSelect.addEventListener("change", () => { const t = findTariff(providerSelect.value, tariffSelect.value); if (t) { applyTariff(form,providerSelect.value,t,"manual"); status.className="tariff-status ok"; status.textContent=`${CATALOG[providerSelect.value].provider} · ${t.name} selected.`; } });

    bill.addEventListener("change", async () => {
      const file = bill.files?.[0]; if (!file) return;
      status.className = "tariff-status"; status.textContent = `Reading ${file.name}…`;
      try {
        const text = await extractBillText(file);
        const providerId = detectProvider(text);
        if (!providerId) throw new Error("The utility could not be identified from this bill.");
        const tariff = detectTariff(providerId,text);
        providerSelect.value = providerId; populate(providerId, tariff?.id || "");
        hiddenInput(form,"tariffBillName").value = file.name;
        if (!tariff) { status.className="tariff-status warn"; status.textContent=`${CATALOG[providerId].provider} identified, but the exact tariff was not clear. Choose the tariff from the dropdown.`; return; }
        tariffSelect.value = tariff.id; applyTariff(form,providerId,tariff,"bill");
        status.className = "tariff-status ok"; status.textContent = `${CATALOG[providerId].provider} and ${tariff.name} identified from ${file.name}.`;
      } catch (error) { status.className="tariff-status warn"; status.textContent = error?.message || "The bill could not be read."; }
    });

    const currentProvider = providerFromSystem(system);
    const currentTariff = currentProvider ? findTariff(currentProvider, system?.tariffId || system?.tariffName) : null;
    if (currentProvider) { providerSelect.value = currentProvider; populate(currentProvider,currentTariff?.id || ""); if (currentTariff) { tariffSelect.value = currentTariff.id; editor.querySelector("[data-tariff-preview]").innerHTML = structureHtml(currentTariff); } }
    else { hideLegacyFields(form,false); providerSelect.value = "other"; populate("other"); }
  }

  function patchTariffCard(system) {
    const card = [...appView.querySelectorAll(".surface")].find((s) => s.querySelector(".surface-title h3")?.textContent?.trim() === "Grid tariff & savings basis");
    if (!card) return;
    const provider = system.tariffProvider || (system.gridSupply === "Eskom" ? "Eskom" : system.gridSupply || "Not confirmed");
    const values = { "Supply authority": provider, "Tariff name / code": system.tariffName || "Not recorded", "Grid tariff rate": system.utilityTariff || "Not recorded", "Tariff effective date": system.tariffEffectiveDate || "Not recorded", "Annual tariff increase": system.tariffAnnualIncrease || "Not recorded" };
    card.querySelectorAll(".details-grid > span").forEach((item) => { const label = item.querySelector(".detail-label")?.textContent?.trim(); const value = item.querySelector(".detail-value"); if (label && value && Object.prototype.hasOwnProperty.call(values,label)) value.textContent = values[label]; });
    const note = card.querySelector("p.muted"); if (note && system.tariffName) note.textContent = system.tariffSource ? `Tariff basis: ${system.tariffSource}. Savings calculations use the saved tariff structure together with verified monitoring data and PPA/EaaS charges.` : note.textContent;
  }

  openModal = function openModalWithTariff(kind, context = {}) {
    const result = baseOpenModal(kind, context);
    if (kind === "system") setTimeout(() => enhanceSystemForm(context.system || getSystem(document.querySelector("#system-form")?.dataset.systemId)), 0);
    return result;
  };

  renderSystemRecord = function renderSystemRecordWithTariff(id) {
    const result = baseRenderSystemRecord(id); const system = getSystem(id); if (system) patchTariffCard(system); return result;
  };
})();
