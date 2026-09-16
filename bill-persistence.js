(() => {
  function hidden(form, name) {
    let input = form.elements[name];
    if (input) return input;
    input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    form.appendChild(input);
    return input;
  }

  async function archiveBill(input) {
    const file = input.files?.[0];
    const form = input.closest("form");
    if (!file || !form) return;
    const systemId = form.dataset.systemId || "unassigned";
    const status = form.querySelector("[data-tariff-status]");

    try {
      const response = await fetch(`/api/workspace-bill?systemId=${encodeURIComponent(systemId)}&fileName=${encodeURIComponent(file.name)}`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": file.type || "application/octet-stream", Accept: "application/json" },
        body: file,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        hidden(form, "tariffBillPersistent").value = "false";
        if (status && response.status !== 503) status.textContent = `${status.textContent ? status.textContent + " " : ""}Bill archive: ${payload.message || "upload failed"}`;
        return;
      }
      hidden(form, "tariffBillPath").value = payload.pathname || "";
      hidden(form, "tariffBillName").value = payload.fileName || file.name;
      hidden(form, "tariffBillPersistent").value = "true";
      hidden(form, "tariffBillArchivedAt").value = new Date().toISOString();
      if (status) {
        status.className = "tariff-status ok";
        status.textContent = `${status.textContent ? status.textContent + " " : ""}Bill archived to the workspace.`;
      }
    } catch (error) {
      hidden(form, "tariffBillPersistent").value = "false";
    }
  }

  document.addEventListener("change", (event) => {
    const input = event.target.closest?.("[data-tariff-bill]");
    if (input) archiveBill(input);
  });
})();
