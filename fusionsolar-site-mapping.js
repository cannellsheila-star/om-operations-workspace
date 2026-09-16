(() => {
  const normalise = (value) => String(value || "").trim().toLowerCase();

  const fusionMappings = {
    "SYS-002": ["SBADAM"],
    "SYS-005": ["Penflex"],
    "SYS-006": ["Riverstone Mall Room 1", "Riverstone Mall Room 2", "Riverstone Mall Room 3", "Riverstone Mall Room 4", "Riverstone Mall BESS"],
    "SYS-008": ["Borbet SA Plant 1 PV", "Borbet SA BESS and Plant 2", "Borbet SA"],
    "SYS-021": ["amanzi heights"],
    "SYS-022": ["libertas mews"],
    "SYS-023": ["AR Illovo 2"],
    "SYS-024": ["vosloorus alleyroads"],
    "SYS-025": ["sandy lane"],
    "SYS-026": ["SUMMIT"],
  };

  let changed = false;

  // Treat this table as the authoritative owner of every FusionSolar plant.
  // This also cleans up mappings that were persisted in localStorage by older
  // versions of the workspace. A Huawei plant must never be attached to more
  // than one workspace system.
  const plantOwner = new Map();
  Object.entries(fusionMappings).forEach(([systemId, plantNames]) => {
    plantNames.forEach((plantName) => plantOwner.set(normalise(plantName), systemId));
  });

  systems.forEach((system) => {
    if (!Array.isArray(system.fusionSolarPlants) || !system.fusionSolarPlants.length) return;
    const cleaned = system.fusionSolarPlants.filter((plantName) => {
      const owner = plantOwner.get(normalise(plantName));
      return !owner || owner === system.id;
    });
    const same = cleaned.length === system.fusionSolarPlants.length && cleaned.every((name, index) => normalise(name) === normalise(system.fusionSolarPlants[index]));
    if (!same) {
      system.fusionSolarPlants = cleaned;
      changed = true;
    }
  });

  // SYS-006 is the original 2.23 MW / 4 MWh Meyerton Mall asset and is Riverstone.
  // A later remediation import created SYS-020 as a duplicate. Merge everything back
  // into the original asset so Monitoring, tickets and maintenance all use one site.
  const riverstone = systems.find((system) => system.id === "SYS-006");
  if (riverstone) {
    if (riverstone.name !== "Riverstone") { riverstone.name = "Riverstone"; changed = true; }
    if (riverstone.offtaker !== "Riverstone") { riverstone.offtaker = "Riverstone"; changed = true; }
    if (!String(riverstone.platform || "").includes("FusionSolar")) {
      riverstone.platform = riverstone.platform ? `${riverstone.platform}/FusionSolar` : "FusionSolar";
      changed = true;
    }
  }

  tickets.forEach((ticket) => {
    if (ticket.system === "SYS-020") {
      ticket.system = "SYS-006";
      changed = true;
    }
  });
  maintenance.forEach((item) => {
    if (item.system === "SYS-020") {
      item.system = "SYS-006";
      changed = true;
    }
  });
  const duplicateRiverstoneIndex = systems.findIndex((system) => system.id === "SYS-020");
  if (duplicateRiverstoneIndex !== -1) {
    systems.splice(duplicateRiverstoneIndex, 1);
    changed = true;
  }

  const legacyAr = systems.find((system) => system.id === "SYS-007");
  const arBase = {
    status: "Status not confirmed",
    documents: [],
    folder: "",
    monitoringUrl: "",
    monitoring: "FusionSolar | connected through Northbound API",
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

  try {
    const overrideKey = "om-system-user-overrides-v1";
    const overrides = JSON.parse(localStorage.getItem(overrideKey) || "{}");
    if (overrides && typeof overrides === "object") {
      if (overrides["SYS-007"]) delete overrides["SYS-007"];
      if (overrides["SYS-020"]) delete overrides["SYS-020"];
      overrides["SYS-006"] = { ...(overrides["SYS-006"] || {}), name: "Riverstone", offtaker: "Riverstone" };
      localStorage.setItem(overrideKey, JSON.stringify(overrides));
    }
  } catch {}

  window.FUSIONSOLAR_WORKSPACE_MAP = fusionMappings;

  if (changed) saveWorkspace();
  if (state.view === "overview") renderSystemRegister();
})();
