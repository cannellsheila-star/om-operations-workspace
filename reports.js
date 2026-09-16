(() => {
  const reportState = {
    type: "performance",
    systemId: "all",
    from: (() => { const d = new Date(); d.setDate(1); return localDate(d); })(),
    to: localDate(new Date()),
    loading: false,
    loadedKey: "",
    rows: [],
    progress: "",
    error: "",
  };
  const historyCache = new Map();
  const fusionDetailCache = new Map();
  let fusionListPromise = null;

  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
  const num = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
  const norm = (v) => String(v || "").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim();
  const fmt = (v, unit="", digits=1) => { const n=num(v); return n===null ? "-" : `${n.toLocaleString("en-ZA",{maximumFractionDigits:digits})}${unit?` ${unit}`:""}`; };
  const money = (v) => { const n=num(v); return n===null ? "-" : n.toLocaleString("en-ZA",{style:"currency",currency:"ZAR",minimumFractionDigits:2,maximumFractionDigits:2}); };
  const dateLabel = (v) => { const d=new Date(`${String(v||"").slice(0,10)}T12:00:00`); return Number.isNaN(d.getTime()) ? String(v||"-") : d.toLocaleDateString("en-ZA",{day:"2-digit",month:"short",year:"numeric"}); };

  function localDate(value) {
    const d = value instanceof Date ? value : new Date(value);
    const p = (n) => String(n).padStart(2,"0");
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  }
  function bounds() {
    const from = new Date(`${reportState.from}T00:00:00`);
    const to = new Date(`${reportState.to}T23:59:59.999`);
    return { from, to, fromMs:from.getTime(), toMs:to.getTime(), fromSec:Math.floor(from.getTime()/1000), toSec:Math.floor(to.getTime()/1000) };
  }
  function inRange(time) {
    const d = time instanceof Date ? time : new Date(time);
    if (Number.isNaN(d.getTime())) return false;
    const b=bounds(); return d.getTime()>=b.fromMs && d.getTime()<=b.toMs;
  }
  function selectedSystems() { return reportState.systemId==="all" ? systems : systems.filter((s)=>s.id===reportState.systemId); }
  function key() { return `${reportState.systemId}|${reportState.from}|${reportState.to}`; }
  function sum(rows, field) { const values=rows.map((r)=>num(r[field])).filter((v)=>v!==null); return values.length ? values.reduce((a,b)=>a+b,0) : null; }
  function parseTariffStructure(system) { try { return typeof system.tariffStructure==="string"?JSON.parse(system.tariffStructure||"{}"):system.tariffStructure||{}; } catch { return {}; } }
  function parseMoneyValue(value) { const text=String(value||"").replace(/[^0-9,.-]/g,"").replace(/,/g,""); const n=Number(text); return Number.isFinite(n)?n:null; }
  function parsePerKwh(value) { return /kwh/i.test(String(value||"")) ? parseMoneyValue(value) : null; }
  function tariffReady(system) { return Boolean(system.tariffName && (system.tariffProvider || system.gridSupply)); }

  function installStyles() {
    if (document.getElementById("reports-workspace-style")) return;
    const style=document.createElement("style");
    style.id="reports-workspace-style";
    style.textContent=`
      .rpt-shell{display:grid;gap:16px}.rpt-toolbar{border:1px solid #dfe2e8;background:#fff;padding:14px;display:grid;gap:12px}.rpt-tabs{display:flex;gap:6px;flex-wrap:wrap}.rpt-tab{border:1px solid #d9dde5;background:#fff;padding:8px 12px;border-radius:2px;font:inherit;font-weight:700;font-size:12px;cursor:pointer}.rpt-tab.active{background:#10176a;color:#fff;border-color:#10176a}.rpt-controls{display:grid;grid-template-columns:minmax(220px,1.5fr) minmax(150px,.8fr) minmax(150px,.8fr) auto;gap:10px;align-items:end}.rpt-field{display:grid;gap:5px}.rpt-field label{font-size:10px;text-transform:uppercase;letter-spacing:.05em;font-weight:800;color:#6b7084}.rpt-field select,.rpt-field input{height:40px;border:1px solid #d9dde5;border-radius:2px;background:#fff;padding:0 10px;font:inherit;color:#10133f}.rpt-actions{display:flex;gap:8px;flex-wrap:wrap}.rpt-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid #dfe2e8;background:#fff}.rpt-metric{padding:16px;border-right:1px solid #e4e6eb;display:grid;gap:5px}.rpt-metric:last-child{border-right:0}.rpt-metric span{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#6b7084;font-weight:800}.rpt-metric strong{font-size:22px}.rpt-panel{border:1px solid #dfe2e8;background:#fff;overflow:auto}.rpt-panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:14px 16px;border-bottom:1px solid #e4e6eb}.rpt-panel-head h2{margin:0;font-size:17px}.rpt-panel-head p{margin:4px 0 0;color:#73778a;font-size:11px}.rpt-table{width:100%;border-collapse:collapse;font-size:12px}.rpt-table th{background:#f4f5f8;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#5f6477;padding:10px 12px;border-bottom:1px solid #dfe2e8;white-space:nowrap}.rpt-table td{padding:11px 12px;border-bottom:1px solid #eceef2;vertical-align:top}.rpt-table tr:last-child td{border-bottom:0}.rpt-status{display:inline-flex;align-items:center;gap:6px;font-weight:700}.rpt-dot{width:7px;height:7px;border-radius:50%;background:#9ca3af}.rpt-dot.ok{background:#17765c}.rpt-dot.warn{background:#b26b00}.rpt-dot.bad{background:#c23d50}.rpt-source{font-size:10px;color:#6f7486;margin-top:3px}.rpt-note{border:1px solid #dfe2e8;background:#f8f9fb;padding:12px 14px;font-size:11px;color:#626779}.rpt-warning{border-left:3px solid #b26b00;background:#fff9ef;padding:10px 12px;font-size:11px}.rpt-empty{padding:28px;text-align:center;color:#73778a}.rpt-pill{display:inline-block;border:1px solid #d9dde5;padding:3px 6px;border-radius:2px;font-size:10px;font-weight:700;background:#fff}.rpt-persistence{font-size:10px;color:#72768a}.rpt-persistence.live{color:#17765c}.rpt-persistence.warn{color:#a86400}.rpt-loading{border:1px solid #dfe2e8;background:#fff;padding:24px;text-align:center;color:#6b7084}.rpt-error{border-left:3px solid #c23d50;background:#fff5f6;padding:10px 12px;color:#8d2837;font-size:11px}.rpt-calc-ok{color:#17765c}.rpt-calc-warn{color:#a86400}
      @media(max-width:900px){.rpt-controls{grid-template-columns:1fr 1fr}.rpt-actions{grid-column:1/-1}.rpt-grid{grid-template-columns:1fr 1fr}.rpt-metric:nth-child(2){border-right:0}.rpt-metric:nth-child(-n+2){border-bottom:1px solid #e4e6eb}}@media(max-width:650px){.rpt-controls{grid-template-columns:1fr}.rpt-actions{grid-column:auto}.rpt-grid{grid-template-columns:1fr}.rpt-metric{border-right:0;border-bottom:1px solid #e4e6eb}.rpt-table{min-width:900px}}
      @media print{.sidebar,.topbar-actions,.rpt-toolbar{display:none!important}.workspace{margin:0!important}.main-content{padding:0!important}.rpt-panel,.rpt-grid{break-inside:avoid}}
    `;
    document.head.appendChild(style);
  }

  function exactTelemetry(system) {
    const feeds=monitoringState.data?.systems||[];
    return feeds.find((x)=>String(x.systemId||"")===String(system.id)) || feeds.find((x)=>!x._fusionSynthetic&&norm(x.name)===norm(system.name)) || null;
  }
  function liveSnapshot(system) {
    const telemetry=exactTelemetry(system);
    const detail=window.fusionSolarMonitoring?.detailCache?.get?.(system.id)||fusionDetailCache.get(system.id)||null;
    const aggregate=detail?.aggregate||{};
    const fusion=Array.isArray(system.fusionSolarPlants)&&system.fusionSolarPlants.length>0;
    return { linked:Boolean(telemetry||fusion), provider:fusion?"FusionSolar":(telemetry?.provider||system.platform||"Not linked"), status:telemetry?.status||aggregate.status||system.status||"Not confirmed", generation:num(telemetry?.energyTodayKwh)??num(aggregate.energyTodayKwh), soc:num(telemetry?.batterySoc)??num(aggregate.batterySoc), alarms:Array.isArray(telemetry?.activeAlerts)?telemetry.activeAlerts.length:Number(aggregate.alarmCount??detail?.alarms?.length??0) };
  }
  function statusTone(status) { const v=String(status||"").toLowerCase(); return /operational|online|normal/.test(v)?"ok":/critical|offline|non-operational|fault/.test(v)?"bad":/attention|warning|alert/.test(v)?"warn":""; }
  function openTickets(system) { return tickets.filter((t)=>t.system===system.id&&t.status!=="Completed"); }

  async function fetchJson(url) {
    const response=await fetch(url,{cache:"no-store",headers:{Accept:"application/json"}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(payload.message||`Request failed (${response.status}).`);
    return payload;
  }
  async function ensureFeeds() {
    if (monitoringState.status!=="ready" && typeof refreshMonitoring==="function") { try { await refreshMonitoring(); } catch {} }
    const fusion=window.fusionSolarMonitoring||(window.fusionSolarMonitoring={status:"idle",data:null,message:"",detailCache:new Map(),selectedPlant:new Map()});
    if (!fusion.data?.systems?.length) {
      if (!fusionListPromise) fusionListPromise=fetchJson("/api/fusionsolar-sg5").then((p)=>{ if(p.connected!==false){fusion.data=p;fusion.status="ready";} return p; }).finally(()=>{fusionListPromise=null;});
      try { await fusionListPromise; } catch {}
    }
  }
  function fusionCodes(system) {
    const wanted=new Set((system.fusionSolarPlants||[]).map(norm));
    return (window.fusionSolarMonitoring?.data?.systems||[]).filter((p)=>wanted.has(norm(p.name))).map((p)=>String(p.providerStationId||p.stationCode||"")).filter(Boolean);
  }
  async function fusionDetail(system,codes) {
    const existing=window.fusionSolarMonitoring?.detailCache?.get?.(system.id)||fusionDetailCache.get(system.id);
    if(existing)return existing;
    const detail=await fetchJson(`/api/fusionsolar?stationCodes=${encodeURIComponent(codes.join(","))}`);
    fusionDetailCache.set(system.id,detail);
    if(window.fusionSolarMonitoring?.detailCache instanceof Map)window.fusionSolarMonitoring.detailCache.set(system.id,detail);
    return detail;
  }

  function integrateSamples(samples) {
    let pv=0,load=0,imp=0,exp=0,charge=0,discharge=0, hasPv=false,hasLoad=false,hasImp=false,hasExp=false,hasCharge=false,hasDischarge=false;
    const rows=[...samples].sort((a,b)=>(num(a.timeStamp)||0)-(num(b.timeStamp)||0));
    rows.forEach((r,i)=>{
      const t=num(r.timeStamp); if(t===null)return;
      const next=num(rows[i+1]?.timeStamp); const hours=Math.max(0,Math.min(next===null?300:next-t,900))/3600;
      const pvKw=(num(r.generationPower)??0)/1000, loadKw=(num(r.consumptionPower)??0)/1000;
      const gp=num(r.gridPower),purchase=num(r.purchasePower),wire=num(r.wirePower);
      const importKw=gp!==null?Math.max(gp/1000,0):purchase!==null?Math.max(purchase/1000,0):wire!==null?Math.max(wire/1000,0):null;
      const exportKw=gp!==null?Math.max(-gp/1000,0):wire!==null?Math.max(-wire/1000,0):null;
      const c=num(r.chargePower),d=num(r.dischargePower),b=num(r.batteryPower);
      const cKw=c!==null?Math.abs(c)/1000:(b!==null&&b<0?Math.abs(b)/1000:null), dKw=d!==null?Math.abs(d)/1000:(b!==null&&b>0?b/1000:null);
      if(num(r.generationPower)!==null){pv+=pvKw*hours;hasPv=true;} if(num(r.consumptionPower)!==null){load+=loadKw*hours;hasLoad=true;} if(importKw!==null){imp+=importKw*hours;hasImp=true;} if(exportKw!==null){exp+=exportKw*hours;hasExp=true;} if(cKw!==null){charge+=cKw*hours;hasCharge=true;} if(dKw!==null){discharge+=dKw*hours;hasDischarge=true;}
    });
    return {pvKwh:hasPv?pv:null,loadKwh:hasLoad?load:null,importKwh:hasImp?imp:null,exportKwh:hasExp?exp:null,chargeKwh:hasCharge?charge:null,dischargeKwh:hasDischarge?discharge:null};
  }

  function normaliseDeye(raw) {
    const daily=Array.isArray(raw.daily)?raw.daily:[];
    const energyRows=daily.map((r)=>{
      const time=new Date(Number(r.year),Number(r.month)-1,Number(r.day)).getTime();
      return { time,pvKwh:num(r.generationValue),loadKwh:num(r.consumptionValue),importKwh:num(r.purchaseValue),exportKwh:num(r.gridValue),chargeKwh:num(r.chargeValue),dischargeKwh:num(r.dischargeValue) };
    }).filter((r)=>r.time>=bounds().fromMs-86400000&&r.time<=bounds().toMs+86400000);
    let totals={pvKwh:sum(energyRows,"pvKwh"),loadKwh:sum(energyRows,"loadKwh"),importKwh:sum(energyRows,"importKwh"),exportKwh:sum(energyRows,"exportKwh"),chargeKwh:sum(energyRows,"chargeKwh"),dischargeKwh:sum(energyRows,"dischargeKwh")};
    if(!energyRows.length)totals=integrateSamples(raw.power||[]);
    const socs=(raw.power||[]).map((r)=>({time:(num(r.timeStamp)||0)*1000,soc:num(r.batterySOC)})).filter((r)=>r.time&&r.soc!==null).sort((a,b)=>a.time-b.time);
    return {provider:"Deye Cloud",energyRows,totals,socEnd:socs.at(-1)?.soc??null,coverage:daily.length?"daily API":"integrated 5-minute power"};
  }

  function bessTotals(raw) {
    const rows=Array.isArray(raw.bess)?raw.bess:[];
    const socs=rows.map((r)=>({time:num(r.time),soc:num(r.soc)})).filter((r)=>r.time!==null&&r.soc!==null).sort((a,b)=>a.time-b.time);
    if(!rows.length)return {chargeKwh:null,dischargeKwh:null,socEnd:null};
    if(String(raw.bessGranularity||"").includes("5-minute")) {
      let charge=0,discharge=0,hasC=false,hasD=false;
      rows.forEach((r,i)=>{const t=num(r.time),next=num(rows[i+1]?.time);if(t===null)return;const h=Math.max(0,Math.min(next===null?t+300:next,t+900)-t)/3600000;const c=num(r.chargePowerKw),d=num(r.dischargePowerKw);if(c!==null){charge+=Math.max(c,0)*h;hasC=true;}if(d!==null){discharge+=Math.max(d,0)*h;hasD=true;}});
      return {chargeKwh:hasC?charge:null,dischargeKwh:hasD?discharge:null,socEnd:socs.at(-1)?.soc??null};
    }
    return {chargeKwh:sum(rows,"chargeEnergyKwh"),dischargeKwh:sum(rows,"dischargeEnergyKwh"),socEnd:socs.at(-1)?.soc??null};
  }
  function normaliseFusion(raw) {
    const bt=bessTotals(raw);
    const bByDay=new Map();
    (raw.bess||[]).forEach((r)=>{const t=num(r.time);if(t===null)return;const k=localDate(t);if(!bByDay.has(k))bByDay.set(k,{charge:0,discharge:0,hasC:false,hasD:false});const b=bByDay.get(k);const c=num(r.chargeEnergyKwh),d=num(r.dischargeEnergyKwh);if(c!==null){b.charge+=c;b.hasC=true;}if(d!==null){b.discharge+=d;b.hasD=true;}});
    const energyRows=(raw.daily||[]).map((r)=>{
      const t=num(r.time);if(t===null)return null;const b=bByDay.get(localDate(t))||{};
      const pv=num(r.generationKwh),load=num(r.consumptionKwh),exportKwh=num(r.gridKwh);
      const chargeKwh=b.hasC?b.charge:null,dischargeKwh=b.hasD?b.discharge:null;
      let importKwh=null;
      if(load!==null&&pv!==null){const net=load+(chargeKwh||0)-pv-(dischargeKwh||0)+(exportKwh||0);importKwh=Math.max(net,0);}
      return {time:t,pvKwh:pv,loadKwh:load,importKwh,exportKwh,chargeKwh,dischargeKwh};
    }).filter(Boolean);
    return {provider:"FusionSolar",energyRows,totals:{pvKwh:sum(energyRows,"pvKwh"),loadKwh:sum(energyRows,"loadKwh"),importKwh:sum(energyRows,"importKwh"),exportKwh:sum(energyRows,"exportKwh"),chargeKwh:bt.chargeKwh??sum(energyRows,"chargeKwh"),dischargeKwh:bt.dischargeKwh??sum(energyRows,"dischargeKwh")},socEnd:bt.socEnd,coverage:(raw.apiCoverage||[]).filter((x)=>x.ok).map((x)=>x.granularity||x.path).filter(Boolean).join(", ")||"station history"};
  }

  async function loadPeriod(system) {
    const cacheKey=`${system.id}|${reportState.from}|${reportState.to}`;
    if(historyCache.has(cacheKey))return historyCache.get(cacheKey);
    const b=bounds();
    let result;
    if(Array.isArray(system.fusionSolarPlants)&&system.fusionSolarPlants.length){
      const codes=fusionCodes(system); if(!codes.length)throw new Error("FusionSolar plant mapping is not available for this site.");
      const detail=await fusionDetail(system,codes);
      const bessIds=(detail.bessDevices||[]).filter((d)=>codes.includes(String(d.stationCode||""))).map((d)=>String(d.id)).filter(Boolean).slice(0,10);
      const raw=await fetchJson(`/api/fusionsolar-range?stationCodes=${encodeURIComponent(codes.join(","))}&bessIds=${encodeURIComponent(bessIds.join(","))}&from=${b.fromMs}&to=${b.toMs}`);
      result=normaliseFusion(raw);
    } else {
      const telemetry=exactTelemetry(system); if(!telemetry?.providerStationId)throw new Error("No historical monitoring API is linked to this site.");
      const raw=await fetchJson(`/api/monitoring-range?stationId=${encodeURIComponent(telemetry.providerStationId)}&from=${b.fromSec}&to=${b.toSec}`);
      result=normaliseDeye(raw);
    }
    historyCache.set(cacheKey,result);return result;
  }

  function reportTickets(system) {
    const b=bounds();
    return tickets.filter((t)=>{
      if(t.system!==system.id)return false;
      const first=new Date(t.monitorData?.firstSeen||t.opened||t.found||"").getTime();
      const recovered=new Date(t.monitorData?.recoveredAt||"").getTime();
      if(!Number.isFinite(first))return true;
      return first<=b.toMs && (!Number.isFinite(recovered)||recovered>=b.fromMs);
    });
  }
  function monitoringReportTickets(system) { return reportTickets(system).filter((t)=>t.source==="Monitoring alert"); }
  function durationLabel(ticket) {
    const start=new Date(ticket.monitorData?.firstSeen||ticket.opened||ticket.found||"").getTime();
    const end=new Date(ticket.monitorData?.recoveredAt||"").getTime();
    if(!Number.isFinite(start))return "-";const stop=Number.isFinite(end)?end:Date.now();const h=Math.max(0,(stop-start)/3600000);return h<24?`${h.toFixed(1)} h`:`${(h/24).toFixed(1)} d`;
  }

  function proratedMonthly(amount) {
    if(num(amount)===null)return null;const b=bounds();let total=0;let d=new Date(b.from.getFullYear(),b.from.getMonth(),b.from.getDate());const end=new Date(b.to.getFullYear(),b.to.getMonth(),b.to.getDate());
    while(d<=end){const days=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();total+=amount/days;d.setDate(d.getDate()+1);}return total;
  }
  function tariffValue(system,history) {
    const s=parseTariffStructure(system);const rows=history?.energyRows||[];const pv=history?.totals?.pvKwh,exp=history?.totals?.exportKwh;
    const self=pv===null?null:(exp===null?null:Math.max(pv-exp,0));
    let avoided=null,exportCredit=null,status="",exact=false;
    if(s.type==="flat"&&num(s.components?.energyPerKwh)!==null&&self!==null){avoided=self*num(s.components.energyPerKwh);exact=true;status="Flat energy tariff calculated";}
    else if(!s.type){const legacy=parsePerKwh(system.utilityTariff);if(legacy!==null&&self!==null){avoided=self*legacy;exact=true;status="Recorded flat energy rate calculated";}else status="Tariff structure not stored";}
    else if(s.type==="complex")status="Additional tariff inputs required";
    else if(/tou/.test(String(s.type)))status="TOU interval classification required";
    else if(/inclining/.test(String(s.type)))status="Billing-block counterfactual required";
    else if(/seasonal/.test(String(s.type)))status="Seasonal billing calculation required";
    else status="Tariff calculation not yet supported";
    if(num(s.exportRate)!==null&&exp!==null)exportCredit=Math.max(exp,0)*num(s.exportRate);
    return {avoided,exportCredit,selfConsumedKwh:self,status,exact};
  }
  function financials(system,history) {
    const tariff=tariffValue(system,history);const ppaRate=parsePerKwh(system.ppaRate);const ppa=ppaRate===null||history?.totals?.pvKwh===null?null:ppaRate*history.totals.pvKwh;const eassMonthly=parseMoneyValue(system.eassRate);const eass=eassMonthly===null?null:proratedMonthly(eassMonthly);
    const utilityTotal=tariff.avoided===null?null:tariff.avoided+(tariff.exportCredit||0);const contract=(ppa||0)+(eass||0);const net=utilityTotal===null?null:utilityTotal-contract;
    return {...tariff,ppa,eass,net,ppaRate,eassMonthly};
  }

  async function loadRows(force=false) {
    if(reportState.loading)return;const currentKey=key();if(!force&&reportState.loadedKey===currentKey&&reportState.rows.length)return;
    reportState.loading=true;reportState.error="";reportState.progress="Connecting monitoring sources…";renderReports(false);
    try{await ensureFeeds();const list=selectedSystems();const rows=[];for(let i=0;i<list.length;i+=1){const system=list[i],live=liveSnapshot(system);reportState.progress=`Loading ${i+1} of ${list.length}: ${system.name}`;renderReports(false);let history=null,error="";if(live.linked){try{history=await loadPeriod(system);}catch(e){error=e?.message||"History unavailable";}}rows.push({system,live,history,error,tickets:reportTickets(system)});if(Array.isArray(system.fusionSolarPlants)&&system.fusionSolarPlants.length)await new Promise((r)=>setTimeout(r,180));}reportState.rows=rows;reportState.loadedKey=currentKey;}catch(e){reportState.error=e?.message||"Report data could not be loaded.";}finally{reportState.loading=false;reportState.progress="";renderReports(false);}
  }

  function toolbar() {
    return `<section class="rpt-toolbar"><div class="rpt-tabs">${[["performance","Performance report"],["savings","Savings report"],["alarms","Alarm report"]].map(([id,label])=>`<button class="rpt-tab ${reportState.type===id?"active":""}" data-report-type="${id}">${label}</button>`).join("")}</div><div class="rpt-controls"><div class="rpt-field"><label>Site</label><select data-report-system><option value="all">All systems</option>${systems.map((s)=>`<option value="${esc(s.id)}" ${reportState.systemId===s.id?"selected":""}>${esc(s.name)}</option>`).join("")}</select></div><div class="rpt-field"><label>From</label><input type="date" data-report-from value="${esc(reportState.from)}"></div><div class="rpt-field"><label>To</label><input type="date" data-report-to value="${esc(reportState.to)}"></div><div class="rpt-actions"><button class="button button-primary" data-report-refresh>Refresh report</button><button class="button button-muted" data-report-csv>Export CSV</button><button class="button button-muted" data-report-print>Print / PDF</button></div></div><div class="rpt-persistence ${window.workspacePersistence?.persistent?"live":"warn"}">${esc(window.workspacePersistence?.persistent?"Workspace changes are centrally persisted and survive deployments.":"Workspace changes are currently saved in this browser only. Connect the workspace data store to make live edits deployment-safe.")}</div></section>`;
  }
  function periodLabel(){return `${dateLabel(reportState.from)} - ${dateLabel(reportState.to)}`;}
  function dataRows(){return reportState.loadedKey===key()?reportState.rows:[];}

  function performanceReport() {
    const rows=dataRows();const monitored=rows.filter((r)=>r.history);const pv=monitored.reduce((a,r)=>a+(r.history.totals.pvKwh||0),0);const imp=monitored.reduce((a,r)=>a+(r.history.totals.importKwh||0),0);const alarms=rows.reduce((a,r)=>a+monitoringReportTickets(r.system).length,0);
    return `<div class="rpt-grid"><div class="rpt-metric"><span>Systems in report</span><strong>${rows.length||selectedSystems().length}</strong></div><div class="rpt-metric"><span>Period PV generation</span><strong>${monitored.length?fmt(pv,"kWh",1):"-"}</strong></div><div class="rpt-metric"><span>Grid import</span><strong>${monitored.length?fmt(imp,"kWh",1):"-"}</strong></div><div class="rpt-metric"><span>Monitoring events</span><strong>${alarms}</strong></div></div><section class="rpt-panel"><div class="rpt-panel-head"><div><h2>Performance report</h2><p>Period energy performance, battery throughput and linked operational work.</p></div><span class="rpt-pill">${periodLabel()}</span></div>${rows.length?`<table class="rpt-table"><thead><tr><th>Site</th><th>Status</th><th>Source</th><th>PV generation</th><th>Specific yield</th><th>Load</th><th>Grid import</th><th>Grid export</th><th>BESS charge</th><th>BESS discharge</th><th>End SOC</th><th>Tickets</th></tr></thead><tbody>${rows.map(({system,live,history,error,tickets:rt})=>{const h=history?.totals||{};const sy=num(system.kwp)&&num(h.pvKwh)!==null?h.pvKwh/Number(system.kwp):null;return `<tr><td><strong>${esc(system.name)}</strong><div class="rpt-source">${esc(system.id)}${error?` | ${esc(error)}`:""}</div></td><td><span class="rpt-status"><i class="rpt-dot ${statusTone(live.status)}"></i>${esc(live.status)}</span></td><td>${esc(history?.provider||live.provider)}</td><td>${fmt(h.pvKwh,"kWh",2)}</td><td>${fmt(sy,"kWh/kWp",2)}</td><td>${fmt(h.loadKwh,"kWh",2)}</td><td>${fmt(h.importKwh,"kWh",2)}</td><td>${fmt(h.exportKwh,"kWh",2)}</td><td>${fmt(h.chargeKwh,"kWh",2)}</td><td>${fmt(h.dischargeKwh,"kWh",2)}</td><td>${fmt(history?.socEnd,"%",1)}</td><td>${rt.length}</td></tr>`}).join("")}</tbody></table>`:`<div class="rpt-empty">No report data loaded yet.</div>`}</section><div class="rpt-note">Specific yield is period PV generation divided by installed PV capacity. Energy values come from the same Deye/FusionSolar historical APIs used by the monitoring pages. Availability and PR are not shown unless a provider supplies defensible source data for those metrics.</div>`;
  }

  function savingsReport() {
    const rows=dataRows();const computed=rows.map((r)=>({...r,fin:r.history?financials(r.system,r.history):null}));const exact=computed.filter((r)=>r.fin?.net!==null);const avoided=exact.reduce((a,r)=>a+(r.fin.avoided||0)+(r.fin.exportCredit||0),0);const contract=exact.reduce((a,r)=>a+(r.fin.ppa||0)+(r.fin.eass||0),0);const net=exact.reduce((a,r)=>a+(r.fin.net||0),0);
    return `<div class="rpt-grid"><div class="rpt-metric"><span>Sites calculated</span><strong>${exact.length}/${rows.length||selectedSystems().length}</strong></div><div class="rpt-metric"><span>Utility value</span><strong>${exact.length?money(avoided):"-"}</strong></div><div class="rpt-metric"><span>PPA + EaaS</span><strong>${exact.length?money(contract):"-"}</strong></div><div class="rpt-metric"><span>Net saving</span><strong>${exact.length?money(net):"-"}</strong></div></div><section class="rpt-panel"><div class="rpt-panel-head"><div><h2>Savings report</h2><p>Verified monitoring energy combined with saved utility tariffs and PPA/EaaS terms.</p></div><span class="rpt-pill">${periodLabel()}</span></div>${rows.length?`<table class="rpt-table"><thead><tr><th>Site</th><th>Utility / tariff</th><th>PV</th><th>Self-consumed PV</th><th>Export</th><th>Avoided utility</th><th>Export credit</th><th>PPA charge</th><th>EaaS charge</th><th>Net saving</th><th>Status</th></tr></thead><tbody>${computed.map(({system,history,error,fin})=>`<tr><td><strong>${esc(system.name)}</strong><div class="rpt-source">${system.tariffBillName?`Bill: ${esc(system.tariffBillName)}`:"No bill linked"}</div></td><td><strong>${esc(system.tariffProvider||system.gridSupply||"Not recorded")}</strong><div class="rpt-source">${esc(system.tariffName||"Tariff not recorded")}</div></td><td>${fmt(history?.totals?.pvKwh,"kWh",2)}</td><td>${fmt(fin?.selfConsumedKwh,"kWh",2)}</td><td>${fmt(history?.totals?.exportKwh,"kWh",2)}</td><td>${money(fin?.avoided)}</td><td>${money(fin?.exportCredit)}</td><td>${money(fin?.ppa)}</td><td>${money(fin?.eass)}</td><td><strong>${money(fin?.net)}</strong></td><td><span class="${fin?.net!==null?"rpt-calc-ok":"rpt-calc-warn"}">${esc(error||fin?.status||"Monitoring/tariff input missing")}</span></td></tr>`).join("")}</tbody></table>`:`<div class="rpt-empty">No savings data loaded yet.</div>`}</section><div class="rpt-warning"><strong>Savings control:</strong> a net saving is only produced when the utility energy value can be calculated from the stored tariff structure. Complex Eskom, TOU and block tariffs stay marked as requiring further inputs rather than being reduced to a false flat R/kWh rate. PPA is calculated from period PV energy using the recorded R/kWh rate; EaaS is pro-rated by calendar day from the recorded monthly charge.</div>`;
  }

  function alarmReport() {
    const allowed=new Set(selectedSystems().map((s)=>s.id));const b=bounds();const all=tickets.filter((t)=>allowed.has(t.system)&&t.source==="Monitoring alert").filter((t)=>{const first=new Date(t.monitorData?.firstSeen||t.opened||t.found||"").getTime();const rec=new Date(t.monitorData?.recoveredAt||"").getTime();return !Number.isFinite(first)||(first<=b.toMs&&(!Number.isFinite(rec)||rec>=b.fromMs));});const opened=all.filter((t)=>inRange(t.monitorData?.firstSeen||t.opened||t.found)).length;const cleared=all.filter((t)=>t.monitorData?.recoveredAt&&inRange(t.monitorData.recoveredAt)).length;const open=all.filter((t)=>t.status!=="Completed");const critical=all.filter((t)=>t.concern==="Critical").length;
    return `<div class="rpt-grid"><div class="rpt-metric"><span>Alarm tickets in period</span><strong>${all.length}</strong></div><div class="rpt-metric"><span>Opened in period</span><strong>${opened}</strong></div><div class="rpt-metric"><span>Cleared in period</span><strong>${cleared}</strong></div><div class="rpt-metric"><span>Still open</span><strong>${open.length}</strong></div></div><section class="rpt-panel"><div class="rpt-panel-head"><div><h2>Alarm report</h2><p>Site-level monitoring events linked to the automatic ticket workflow.</p></div><span class="rpt-pill">${periodLabel()}</span></div>${all.length?`<table class="rpt-table"><thead><tr><th>Site</th><th>Urgency</th><th>Status</th><th>First seen</th><th>Cleared</th><th>Duration</th><th>Monitoring issue / latest update</th></tr></thead><tbody>${all.map((ticket)=>{const system=getSystem(ticket.system);const work=Array.isArray(ticket.work)?ticket.work.at(-1):null;const note=work&&typeof work==="object"?(work.note||work.text||work.update||""):String(work||"");return `<tr><td><strong>${esc(system?.name||ticket.system)}</strong></td><td>${esc(ticket.concern||"Medium")}</td><td>${esc(ticket.status)}</td><td>${esc(ticket.monitorData?.firstSeen?new Date(ticket.monitorData.firstSeen).toLocaleString("en-ZA"):(ticket.opened||ticket.found||"-"))}</td><td>${esc(ticket.monitorData?.recoveredAt?new Date(ticket.monitorData.recoveredAt).toLocaleString("en-ZA"):"-")}</td><td>${durationLabel(ticket)}</td><td><strong>${esc(ticket.issue||`Monitoring: ${system?.name||ticket.system}`)}</strong><div class="rpt-source">${esc(note)}</div></td></tr>`}).join("")}</tbody></table>`:`<div class="rpt-empty">No monitoring alarm tickets overlap this period.</div>`}</section><div class="rpt-note">The alarm report uses the monitoring ticket timestamps: first seen, last seen and recovered. A ticket remains in a historical period if the fault was active during any part of that period, even if it was opened before the selected start date.</div>`;
  }

  function csvRows() {
    const rows=dataRows();if(reportState.type==="performance")return [["Site","Status","Source","PV kWh","Specific yield kWh/kWp","Load kWh","Grid import kWh","Grid export kWh","BESS charge kWh","BESS discharge kWh","End SOC %","Tickets"],...rows.map((r)=>{const h=r.history?.totals||{};return [r.system.name,r.live.status,r.history?.provider||r.live.provider,h.pvKwh,num(r.system.kwp)&&num(h.pvKwh)!==null?h.pvKwh/Number(r.system.kwp):"",h.loadKwh,h.importKwh,h.exportKwh,h.chargeKwh,h.dischargeKwh,r.history?.socEnd,r.tickets.length];})];if(reportState.type==="savings")return [["Site","Utility","Tariff","PV kWh","Self-consumed PV kWh","Export kWh","Avoided utility","Export credit","PPA charge","EaaS charge","Net saving","Status"],...rows.map((r)=>{const f=r.history?financials(r.system,r.history):null;return [r.system.name,r.system.tariffProvider||r.system.gridSupply,r.system.tariffName,r.history?.totals?.pvKwh,f?.selfConsumedKwh,r.history?.totals?.exportKwh,f?.avoided,f?.exportCredit,f?.ppa,f?.eass,f?.net,r.error||f?.status||""];})];const allowed=new Set(selectedSystems().map((s)=>s.id));const all=tickets.filter((t)=>allowed.has(t.system)&&t.source==="Monitoring alert");return [["Site","Urgency","Status","Opened","Recovered","Issue"],...all.map((t)=>[getSystem(t.system)?.name||t.system,t.concern,t.status,t.monitorData?.firstSeen||t.opened||t.found,t.monitorData?.recoveredAt||"",t.issue])];
  }
  function exportCsv() { const csv=csvRows().map((row)=>row.map((v)=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`${reportState.type}-${reportState.systemId}-${reportState.from}-${reportState.to}.csv`;document.body.appendChild(a);a.click();URL.revokeObjectURL(a.href);a.remove(); }

  function renderReports(autoLoad=true) {
    installStyles();state.view="reports";document.querySelectorAll(".nav-item,.nav-parent").forEach((item)=>item.classList.remove("active"));document.querySelector("[data-action='show-reports']")?.classList.add("active");pageHeader("Reports","O&M / REPORTING");primaryAction.hidden=true;backButton.hidden=true;
    const body=reportState.type==="savings"?savingsReport():reportState.type==="alarms"?alarmReport():performanceReport();appView.innerHTML=`<div class="rpt-shell">${toolbar()}${reportState.error?`<div class="rpt-error">${esc(reportState.error)}</div>`:""}${reportState.loading?`<div class="rpt-loading">${esc(reportState.progress||"Loading report data…")}</div>`:""}${body}</div>`;
    if(autoLoad&&reportState.loadedKey!==key()&&!reportState.loading)setTimeout(()=>loadRows(false),0);
  }

  document.addEventListener("click",(event)=>{const reports=event.target.closest?.("[data-action='show-reports']");if(reports){event.preventDefault();event.stopImmediatePropagation();renderReports(true);return;}const type=event.target.closest?.("[data-report-type]");if(type){reportState.type=type.dataset.reportType;renderReports(false);return;}if(event.target.closest?.("[data-report-refresh]")){reportState.systemId=appView.querySelector("[data-report-system]")?.value||"all";reportState.from=appView.querySelector("[data-report-from]")?.value||reportState.from;reportState.to=appView.querySelector("[data-report-to]")?.value||reportState.to;reportState.loadedKey="";loadRows(true);return;}if(event.target.closest?.("[data-report-csv]")){exportCsv();return;}if(event.target.closest?.("[data-report-print]")){window.print();return;}},true);
  document.addEventListener("change",(event)=>{if(event.target.matches?.("[data-report-system]")){reportState.systemId=event.target.value;reportState.loadedKey="";}if(event.target.matches?.("[data-report-from]")){reportState.from=event.target.value;reportState.loadedKey="";}if(event.target.matches?.("[data-report-to]")){reportState.to=event.target.value;reportState.loadedKey="";}});
  document.addEventListener("workspace-persistence-changed",()=>{if(state.view==="reports")renderReports(false);});
  window.renderReports=renderReports;
})();
