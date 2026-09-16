(() => {
  const META_KEY = "om-workspace-persistence-v1";
  const baseSaveWorkspace = saveWorkspace;
  let syncTimer = null;
  let syncPromise = null;
  let applyingRemote = false;

  const stateInfo = window.workspacePersistence || (window.workspacePersistence = {
    checked: false,
    configured: false,
    persistent: false,
    saving: false,
    lastSavedAt: "",
    message: "Checking persistent workspace storage…",
  });

  function readMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || "{}"); } catch { return {}; }
  }

  function writeMeta(patch) {
    const next = { ...readMeta(), ...patch };
    localStorage.setItem(META_KEY, JSON.stringify(next));
    return next;
  }

  function snapshot() {
    return {
      systems: JSON.parse(JSON.stringify(systems || [])),
      tickets: JSON.parse(JSON.stringify(tickets || [])),
      maintenance: JSON.parse(JSON.stringify(maintenance || [])),
    };
  }

  function replaceArray(target, incoming) {
    target.splice(0, target.length, ...(Array.isArray(incoming) ? incoming : []));
  }

  async function pushSnapshot(force = false) {
    if (syncPromise) return syncPromise;
    const local = readMeta();
    if (!force && !local.dirty) return null;
    stateInfo.saving = true;
    syncPromise = (async () => {
      try {
        const response = await fetch("/api/workspace", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ snapshot: snapshot() }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          stateInfo.checked = true;
          stateInfo.configured = payload.configured !== false;
          stateInfo.persistent = false;
          stateInfo.message = payload.message || "Workspace changes are currently saved in this browser only.";
          return payload;
        }
        stateInfo.checked = true;
        stateInfo.configured = true;
        stateInfo.persistent = true;
        stateInfo.lastSavedAt = payload.updatedAt || new Date().toISOString();
        stateInfo.message = "Workspace changes are saved centrally and will survive deployments.";
        writeMeta({ updatedAt: stateInfo.lastSavedAt, dirty: false });
        return payload;
      } catch (error) {
        stateInfo.checked = true;
        stateInfo.persistent = false;
        stateInfo.message = error?.message || "Workspace changes are currently saved in this browser only.";
        return null;
      } finally {
        stateInfo.saving = false;
        syncPromise = null;
        document.dispatchEvent(new CustomEvent("workspace-persistence-changed", { detail: { ...stateInfo } }));
      }
    })();
    return syncPromise;
  }

  function schedulePush() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => pushSnapshot(), 700);
  }

  saveWorkspace = function persistentSaveWorkspace() {
    const result = baseSaveWorkspace.apply(this, arguments);
    if (!applyingRemote) {
      writeMeta({ updatedAt: new Date().toISOString(), dirty: true });
      schedulePush();
    }
    return result;
  };
  try { window.saveWorkspace = saveWorkspace; } catch {}

  async function initialise() {
    try {
      const response = await fetch("/api/workspace", { cache: "no-store", headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({}));
      stateInfo.checked = true;
      stateInfo.configured = payload.configured !== false;
      stateInfo.persistent = response.ok && payload.persistent === true;
      stateInfo.message = payload.message || (stateInfo.persistent ? "Persistent workspace storage connected." : "Workspace is using browser storage.");

      if (!response.ok || !stateInfo.persistent) {
        document.dispatchEvent(new CustomEvent("workspace-persistence-changed", { detail: { ...stateInfo } }));
        return;
      }

      const remote = payload.snapshot;
      const localMeta = readMeta();
      const localTime = Date.parse(localMeta.updatedAt || "") || 0;
      const remoteTime = Date.parse(remote?.updatedAt || "") || 0;

      if (remote && remoteTime > localTime) {
        applyingRemote = true;
        replaceArray(systems, remote.systems);
        replaceArray(tickets, remote.tickets);
        replaceArray(maintenance, remote.maintenance);
        baseSaveWorkspace();
        applyingRemote = false;
        writeMeta({ updatedAt: remote.updatedAt, dirty: false });
        stateInfo.lastSavedAt = remote.updatedAt;
        if (state.view === "overview" && typeof renderSystemRegister === "function") renderSystemRegister();
        if (state.view === "tickets" && typeof renderTickets === "function") renderTickets();
        if (state.view === "maintenance" && typeof renderMaintenance === "function") renderMaintenance();
      } else if (!remote || localMeta.dirty || localTime > remoteTime) {
        writeMeta({ ...(localMeta.updatedAt ? {} : { updatedAt: new Date().toISOString() }), dirty: true });
        await pushSnapshot(true);
      } else {
        stateInfo.lastSavedAt = remote.updatedAt || "";
      }
    } catch (error) {
      stateInfo.checked = true;
      stateInfo.persistent = false;
      stateInfo.message = error?.message || "Workspace is using browser storage.";
    }
    document.dispatchEvent(new CustomEvent("workspace-persistence-changed", { detail: { ...stateInfo } }));
  }

  window.workspacePersistence.syncNow = () => {
    writeMeta({ updatedAt: new Date().toISOString(), dirty: true });
    return pushSnapshot(true);
  };
  window.workspacePersistence.getSnapshot = snapshot;
  setTimeout(initialise, 0);
})();
