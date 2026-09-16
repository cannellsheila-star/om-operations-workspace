(() => {
  const reportState = {
    type: "performance",
    systemId: "all",
    from: (() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0,10); })(),
    to: new Date().toISOString().slice(0,10),
  };

  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  const num = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
  const norm = (v) => String(v || "").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim();
  const fmt = (v, unit="", digits=1) => { const n=num(v); return n===null ? "—" : `${n.toLocaleString("en-ZA",{maximumFractionDigits:digits})}${unit?` ${unit}`:""}`; };
  const dateLabel = (v) => { const d=new Date(v); return Number.isNaN(d.getTime()) ? String(v||"—") : d.toLocaleDateString("en-ZA",{day:"2-digit",month:"short",year:"numeric"}); };

  function installStyles() {
    if (document.getElementById("reports-workspace-style")) return;
    const style=document.createElement("style");
    style.id="reports-workspace-style";
    style.textContent=`
      .rpt-shell{display:grid;gap:16px}.rpt-toolbar{border:1px solid #dfe2e8;background:#fff;padding:14px;display:grid;gap:12px}.rpt-tabs{display:flex;gap:6px;flex-wrap:wrap}.rpt-tab{border:1px solid #d9dde5;background:#fff;padding:8px 12px;border-radius:2px;font:inherit;font-weight:700;font-size:12px;cursor:pointer}.rpt-tab.active{background:#10176a;color:#fff;border-color:#10176a}.rpt-controls{display:grid;grid-template-columns:minmax(220px,1.5fr) minmax(150px,.8fr) minmax(150px,.8fr) auto;gap:10px;align-items:end}.rpt-field{display:grid;gap:5px}.rpt-field label{font-size:10px;text-transform:uppercase;letter-spacing:.05em;font-weight:800;color:#6b7084}.rpt-field select,.rpt-field input{height:40px;border:1px solid #d9dde5;border-radius:2px;background:#fff;padding:0 10px;font:inherit;color:#10133f}.rpt-actions{display:flex;gap:8px}.rpt-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid #dfe2e8;background:#fff}.rpt-metric{padding:16px;border-right:1px solid #e4e6eb;display:grid;gap:5px}.rpt-metric:last-child{border-right:0}.rpt-metric span{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#6b7084;font-weight:800}.rpt-metric strong{font-size:22px}.rpt-panel{border:1px solid #dfe2e8;background:#fff}.rpt-panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:14px 16px;border-bottom:1px solid #e4e6eb}.rpt-panel-head h2{margin:0;font-size:17px}.rpt-panel-head p{margin:4px 0 0;color:#73778a;font-size:11px}.rpt-table{width:100%;border-collapse:collapse;font-size:12px}.rpt-table th{background:#f4f5f8;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#5f6477;padding:10px 12px;border-bottom:1px solid #dfe2e8}.rpt-table td{padding:11px 12px;border-bottom:1px solid #eceef2;vertical-align:top}.rpt-table tr:last-child td{border-bottom:0}.rpt-status{display:inline-flex;align-items:center;gap:6px;font-weight:700}.rpt-dot{width:7px;height:7px;border-radius:50%;background:#9ca3af}.rpt-dot.ok{background:#17765c}.rpt-dot.warn{background:#b26b00}.rpt-dot.bad{background:#c23d50}.rpt-source{font-size:10px;color:#6f7486}.rpt-note{border:1px solid #dfe2e8;background:#f8f9fb;padding:12px 14px;font-size:11px;color:#626779}.rpt-warning{border-left:3px solid #b26b00;background:#fff9ef;padding:10px 12px;font-size:11px}.rpt-empty{padding:28px;text-align:center;color:#73778a}.rpt-pill{display:inline-block;border:1px solid #d9dde5;padding:3px 6px;border-radius:2px;font-size:10px;font-weight:700;background:#fff}.rpt-persistence{font-size:10px;color:#72768a}.rpt-persistence.live{color:#17765c}.rpt-persistence.warn{color:#a86400}@media(max-width:900px){.rpt-controls{grid-template-columns:1fr 1fr}.rpt-actions{grid-column:1/-1}.rpt-grid{grid-template-columns:1fr 1fr}.rpt-metric:nth-child(2){border-right:0}.rpt-metric:nth-child(-n+2){border-bottom:1px solid #e4e6eb}}@media(max-width:650px){.rpt-controls{grid-template-columns:1fr}.rpt-actions{grid-column:auto}.rpt-grid{grid-template-columns:1fr}.rpt-metric{border-right:0;border-bottom:1px solid #e4e6eb}.rpt-table{min-width:760px}.rpt-panel{overflow:auto}}
      @media print{.sidebar,.topbar-actions,.rpt-toolbar{display:none!important}.workspace{margin:0!important}.main-content{padding:0!important}.rpt-panel,.rpt-grid{break-inside:avoid}}
    `;
    document.head.appendChild(style);
  }

  function systemMonitoring(system) {
    const exact=(monitoringState.data?.systems||[]).find((item)=>String(item.systemId||"")===String(system.id));
    if (exact) return exact;
    return (monitoringState.data?.systems||[]).find((item)=>norm(item.name)===norm(system.name) && !item._fusionSynthetic) || null;
  }

  function fusionDetail(system) {
    return window.fusionSolarMonitoring?.detailCache?.get?.(system.id) || null;
  }

  function liveSnapshot(system) {
    const telemetry=systemMonitoring(system);
    const detail=fusionDetail(system);
    const aggregate=detail?.aggregate||{};
    const isFusion=Array.isArray(system.fusionSolarPlants)&&system.fusionSolarPlants.length>0;
    return {
      linked:Boolean(telemetry||isFusion),
      provider:isFusion?"FusionSolar":(telemetry?.provider||system.platform||"Not linked"),
      status:telemetry?.status||aggregate.status||system.status||"Not confirmed",
      generation:num(telemetry?.energyTodayKwh)??num(aggregate.energyTodayKwh),
      soc:num(telemetry?.batterySoc)??num(aggregate.batterySoc),
      alarms:Array.isArray(telemetry?.activeAlerts)?telemetry.activeAlerts.length:Number(aggregate.alarmCount??detail?.alarms?.length??0),
    };
  }

  function openTickets(system) { return tickets.filter((t)=>t.system===system.id&&t.status!=="Completed"); }
  function monitoringTickets(system) { return tickets.filter((t)=>t.system===system.id&&t.source==="Monitoring alert"); }
  function selectedSystems() { return reportState.systemId==="all" ? systems : systems.filter((s)=>s.id===reportState.systemId); }
  function statusTone(status) { const v=String(status||"").toLowerCase(); return /operational|online|normal/.test(v)?"ok":/critical|offline|non-operational|fault/.test(v)?"bad":/attention|warning|alert/.test(v)?"warn":""; }
  function parseTariffStructure(system) { try { return typeof system.tariffStructure==="string"?JSON.parse(system.tariffStructure||"{}"):system.tariffStructure||{}; } catch { return {}; } }
  function tariffReady(system) { return Boolean(system.tariffName && (system.tariffProvider || ["Eskom","Municipal"].includes(system.gridSupply))); }

  function toolbar() {
    return `<section class="rpt-toolbar">
      <div class="rpt-tabs">
        ${[["performance","Performance report"],["savings","Savings report"],["alarms","Alarm report"]].map(([id,label])=>`<button class="rpt-tab ${reportState.type===id?"active":""}" data-report-type="${id}">${label}</button>`).join("")}
      </div>
      <div class="rpt-controls">
        <div class="rpt-field"><label>Site</label><select data-report-system><option value="all">All systems</option>${systems.map((s)=>`<option value="${esc(s.id)}" ${reportState.systemId===s.id?"selected":""}>${esc(s.name)}</option>`).join("")}</select></div>
        <div class="rpt-field"><label>From</label><input type="date" data-report-from value="${esc(reportState.from)}"></div>
        <div class="rpt-field"><label>To</label><input type="date" data-report-to value="${esc(reportState.to)}"></div>
        <div class="rpt-actions"><button class="button button-primary" data-report-refresh>Refresh report</button><button class="button button-muted" data-report-print>Print / PDF</button></div>
      </div>
      <div class="rpt-persistence ${window.workspacePersistence?.persistent?"live":"warn"}">${esc(window.workspacePersistence?.persistent?"Workspace data is centrally persisted.":"Workspace data is currently browser-persisted; central persistence is not connected yet.")}</div>
    </section>`;
  }

  function performanceReport() {
    const rows=selectedSystems().map((system)=>({system,live:liveSnapshot(system),open:openTickets(system)}));
    const liveCount=rows.filter((r)=>r.live.linked).length;
    const operational=rows.filter((r)=>r.live.status==="Operational").length;
    const generation=rows.reduce((sum,r)=>sum+(r.live.generation||0),0);
    const alarmCount=rows.reduce((sum,r)=>sum+(r.live.alarms||0),0);
    return `<div class="rpt-grid"><div class="rpt-metric"><span>Systems in report</span><strong>${rows.length}</strong></div><div class="rpt-metric"><span>Live monitoring linked</span><strong>${liveCount}</strong></div><div class="rpt-metric"><span>Generation today</span><strong>${fmt(generation,"kWh",1)}</strong></div><div class="rpt-metric"><span>Active alarms</span><strong>${alarmCount}</strong></div></div>
      <section class="rpt-panel"><div class="rpt-panel-head"><div><h2>Performance report</h2><p>Monitoring status, generation, battery condition and open operational work.</p></div><span class="rpt-pill">${dateLabel(reportState.from)} – ${dateLabel(reportState.to)}</span></div>
      <table class="rpt-table"><thead><tr><th>Site</th><th>Status</th><th>Monitoring</th><th>PV capacity</th><th>Generation today</th><th>BESS SOC</th><th>Active alarms</th><th>Open tickets</th></tr></thead><tbody>${rows.map(({system,live,open})=>`<tr><td><strong>${esc(system.name)}</strong><div class="rpt-source">${esc(system.id)}</div></td><td><span class="rpt-status"><i class="rpt-dot ${statusTone(live.status)}"></i>${esc(live.status)}</span></td><td>${esc(live.provider)}</td><td>${fmt(system.kwp,"kWp",2)}</td><td>${fmt(live.generation,"kWh",2)}</td><td>${fmt(live.soc,"%",1)}</td><td>${live.alarms??0}</td><td>${open.length}</td></tr>`).join("")}</tbody></table></section>
      <div class="rpt-note">The current performance table is already linked to the live monitoring layer and ticket register. The selected date range is now part of the reporting framework; period yield, availability and PR calculations will use the same provider history endpoints as the site monitoring graphs rather than a separate data source.</div>`;
  }

  function savingsReport() {
    const rows=selectedSystems().map((system)=>({system,live:liveSnapshot(system),structure:parseTariffStructure(system)}));
    const tariffCount=rows.filter((r)=>tariffReady(r.system)).length;
    const monitorCount=rows.filter((r)=>r.live.linked).length;
    const ready=rows.filter((r)=>tariffReady(r.system)&&r.live.linked).length;
    const billCount=rows.filter((r)=>r.system.tariffBillName).length;
    return `<div class="rpt-grid"><div class="rpt-metric"><span>Tariffs configured</span><strong>${tariffCount}/${rows.length}</strong></div><div class="rpt-metric"><span>Monitoring linked</span><strong>${monitorCount}/${rows.length}</strong></div><div class="rpt-metric"><span>Inputs ready</span><strong>${ready}</strong></div><div class="rpt-metric"><span>Bills linked</span><strong>${billCount}</strong></div></div>
      <section class="rpt-panel"><div class="rpt-panel-head"><div><h2>Savings report</h2><p>Tariff basis, verified monitoring generation and contracted PPA/EaaS costs.</p></div><span class="rpt-pill">${dateLabel(reportState.from)} – ${dateLabel(reportState.to)}</span></div>
      <table class="rpt-table"><thead><tr><th>Site</th><th>Utility</th><th>Tariff</th><th>Monitoring</th><th>Generation today</th><th>PPA</th><th>EaaS</th><th>Calculation status</th></tr></thead><tbody>${rows.map(({system,live,structure})=>{const readySite=tariffReady(system)&&live.linked;const complexity=structure.type||"not stored";return `<tr><td><strong>${esc(system.name)}</strong></td><td>${esc(system.tariffProvider||system.gridSupply||"Not recorded")}</td><td><strong>${esc(system.tariffName||"Not recorded")}</strong><div class="rpt-source">${esc(complexity)}${system.tariffBillName?` · bill: ${esc(system.tariffBillName)}`:""}</div></td><td>${esc(live.provider)}</td><td>${fmt(live.generation,"kWh",2)}</td><td>${esc(system.ppaRate||"—")}</td><td>${esc(system.eassRate||"—")}</td><td><span class="rpt-pill">${readySite?"Inputs linked":"Missing input"}</span></td></tr>`}).join("")}</tbody></table></section>
      <div class="rpt-warning"><strong>Financial calculation rule:</strong> the report will not treat every tariff as a flat R/kWh number. TOU, seasonal, demand, block and Eskom complex tariffs must be calculated against interval monitoring data and the saved tariff structure. PPA and EaaS charges are then deducted to produce the net saving.</div>`;
  }

  function alarmReport() {
    const allowed=new Set(selectedSystems().map((s)=>s.id));
    const monitorTickets=tickets.filter((t)=>allowed.has(t.system)&&t.source==="Monitoring alert");
    const open=monitorTickets.filter((t)=>t.status!=="Completed");
    const critical=open.filter((t)=>t.concern==="Critical").length;
    const high=open.filter((t)=>t.concern==="High").length;
    const closed=monitorTickets.filter((t)=>t.status==="Completed").length;
    return `<div class="rpt-grid"><div class="rpt-metric"><span>Open monitoring tickets</span><strong>${open.length}</strong></div><div class="rpt-metric"><span>Critical</span><strong>${critical}</strong></div><div class="rpt-metric"><span>High</span><strong>${high}</strong></div><div class="rpt-metric"><span>Cleared / completed</span><strong>${closed}</strong></div></div>
      <section class="rpt-panel"><div class="rpt-panel-head"><div><h2>Alarm report</h2><p>Monitoring alarms and automatically managed site tickets.</p></div><span class="rpt-pill">${dateLabel(reportState.from)} – ${dateLabel(reportState.to)}</span></div>
      ${monitorTickets.length?`<table class="rpt-table"><thead><tr><th>Site</th><th>Urgency</th><th>Status</th><th>Opened</th><th>Current issue / latest update</th></tr></thead><tbody>${monitorTickets.map((ticket)=>{const system=getSystem(ticket.system);const work=Array.isArray(ticket.work)?ticket.work.at(-1):null;const note=work&&typeof work==="object"?(work.note||work.text||work.update||""):String(work||ticket.issue||"");return `<tr><td><strong>${esc(system?.name||ticket.system)}</strong></td><td>${esc(ticket.concern||"Medium")}</td><td>${esc(ticket.status)}</td><td>${esc(ticket.opened||ticket.found||"—")}</td><td><strong>${esc(ticket.issue||`Monitoring: ${system?.name||ticket.system}`)}</strong><div class="rpt-source">${esc(note)}</div></td></tr>`}).join("")}</tbody></table>`:`<div class="rpt-empty">No monitoring alarm tickets match this report.</div>`}</section>
      <div class="rpt-note">This report is linked directly to the monitoring ticket automation. When a monitored site clears, its site-level monitoring ticket is completed automatically and will appear in the cleared history rather than remaining open.</div>`;
  }

  function renderReports() {
    installStyles();
    state.view="reports";
    document.querySelectorAll(".nav-item,.nav-parent").forEach((item)=>item.classList.remove("active"));
    document.querySelector("[data-action='show-reports']")?.classList.add("active");
    pageHeader("Reports","O&M / REPORTING");
    primaryAction.hidden=true; backButton.hidden=true;
    const body=reportState.type==="savings"?savingsReport():reportState.type==="alarms"?alarmReport():performanceReport();
    appView.innerHTML=`<div class="rpt-shell">${toolbar()}${body}</div>`;
  }

  document.addEventListener("click",(event)=>{
    const reports=event.target.closest?.("[data-action='show-reports']");
    if(reports){event.preventDefault();event.stopImmediatePropagation();renderReports();return;}
    const type=event.target.closest?.("[data-report-type]");
    if(type){reportState.type=type.dataset.reportType;renderReports();return;}
    if(event.target.closest?.("[data-report-refresh]")){reportState.systemId=appView.querySelector("[data-report-system]")?.value||"all";reportState.from=appView.querySelector("[data-report-from]")?.value||reportState.from;reportState.to=appView.querySelector("[data-report-to]")?.value||reportState.to;renderReports();return;}
    if(event.target.closest?.("[data-report-print]")){window.print();return;}
  },true);

  document.addEventListener("change",(event)=>{
    if(event.target.matches?.("[data-report-system]")) reportState.systemId=event.target.value;
    if(event.target.matches?.("[data-report-from]")) reportState.from=event.target.value;
    if(event.target.matches?.("[data-report-to]")) reportState.to=event.target.value;
  });

  document.addEventListener("workspace-persistence-changed",()=>{ if(state.view==="reports") renderReports(); });
  window.renderReports=renderReports;
})();
