(() => {
  const normalise = (value) => String(value || "").trim().toLowerCase();

  const fusionMappings = {
    "SYS-002": ["SBADAM"],
    "SYS-005": ["Penflex"],
    "SYS-008": ["Borbet SA Plant 1 PV", "Borbet SA BESS and Plant 2", "Borbet SA"],
    "SYS-020": ["Riverstone Mall Room 1", "Riverstone Mall Room 2", "Riverstone Mall Room 3", "Riverstone Mall Room 4", "Riverstone Mall BESS"],
    "SYS-021": ["amanzi heights"],
    "SYS-022": ["libertas mews"],
    "SYS-023": ["AR Illovo 2"],
    "SYS-024": ["vosloorus alleyroads"],
    "SYS-025": ["sandy lane"],
    "SYS-026": ["SUMMIT"],
  };

  const legacyAr = systems.find((system) => system.id === "SYS-007");
  const arBase = {
    status: "Status not confirmed",
    documents: [],
    folder: "",
    monitoringUrl: "",
    monitoring: "FusionSolar · connected through Northbound API",
    alert: "No monitoring exception recorded.",
    updates: ["Separated from the former AR Residential aggregate record for site-level O&M monitoring."],
    contactName: legacyAr?.contactName || "",
    contact: legacyAr?.contact || "",
    platform: "FusionSolar",
    systemCount: 1,
    gridSupply: legacyAr?.gridSupply || "Not confirmed",
    tariffName: "",
    utilityTariff: "",
    tariffEffectiveDate: "",
    tariffAnnualIncrease: "",
    ppaRate: "",
    ppaAnnualIncrease: "",
    ppaIncreaseDate: "",
    ppaTenor: null,
    eassRate: "",
    eassAnnualIncrease: legacyAr?.eassAnnualIncrease || "CPI + 1.5%",
    eassIncreaseDate: legacyAr?.eassIncreaseDate || "1 August 2026",
    eassTenor: legacyAr?.eassTenor || 15,
    kwp: null,
    kwh: null,
    epc: legacyAr?.epc || "Sustain EPC",
    contractor: legacyAr?.contractor || "Sustain EPC",
    cod: legacyAr?.cod || "31 July 2025",
    nextPm: legacyAr?.nextPm || "-",
    lastPm: legacyAr?.lastPm || "-",
  };

  const arSites = [
    { id: "SYS-021", name: "Alley Roads Amanzi Heights", offtaker: "Amanzi Heights" },
    { id: "SYS-022", name: "Alley Roads Libertas Mews", offtaker: "Libertas Mews" },
    { id: "SYS-023", name: "Alley Roads Illovo 2", offtaker: "Illovo 2" },
    { id: "SYS-024", name: "Alley Roads Vosloorus", offtaker: "Vosloorus" },
    { id: "SYS-025", name: "Alley Roads Sandy Lane", offtaker: "Sandy Lane" },
    { id: "SYS-026", name: "Alley Roads Summit", offtaker: "Summit" },
  ];

  let changed = false;

  const legacyIndex = systems.findIndex((system) => system.id === "SYS-007");
  if (legacyIndex !== -1) {
    systems.splice(legacyIndex, 1);
    changed = true;
  }

  arSites.forEach((site) => {
    let system = systems.find((item) => item.id === site.id);
    if (!system) {
      system = { ...arBase, ...site };
      systems.push(system);
      changed = true;
    } else {
      if (system.name !== site.name) { system.name = site.name; changed = true; }
      if (system.offtaker !== site.offtaker) { system.offtaker = site.offtaker; changed = true; }
      if (!String(system.platform || "").includes("FusionSolar")) { system.platform = "FusionSolar"; changed = true; }
    }
  });

  Object.entries(fusionMappings).forEach(([systemId, plantNames]) => {
    const system = systems.find((item) => item.id === systemId);
    if (!system) return;
    const current = Array.isArray(system.fusionSolarPlants) ? system.fusionSolarPlants : [];
    const same = current.length === plantNames.length && current.every((name, index) => normalise(name) === normalise(plantNames[index]));
    if (!same) {
      system.fusionSolarPlants = [...plantNames];
      changed = true;
    }
    if (!String(system.platform || "").includes("FusionSolar")) {
      system.platform = system.platform ? `${system.platform}/FusionSolar` : "FusionSolar";
      changed = true;
    }
  });

  // Remove any obsolete user override for the deleted aggregate AR record.
  try {
    const overrideKey = "om-system-user-overrides-v1";
    const overrides = JSON.parse(localStorage.getItem(overrideKey) || "{}");
    if (overrides && typeof overrides === "object" && overrides["SYS-007"]) {
      delete overrides["SYS-007"];
      localStorage.setItem(overrideKey, JSON.stringify(overrides));
    }
  } catch {}

  window.FUSIONSOLAR_WORKSPACE_MAP = fusionMappings;

  if (changed) saveWorkspace();
  if (state.view === "overview") renderSystemRegister();
})();
