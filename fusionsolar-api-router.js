(() => {
  if (window.__fusionSolarApiSetupInstalled) return;
  window.__fusionSolarApiSetupInstalled = true;

  if (!document.querySelector('script[data-monitoring-value-safety]')) {
    const script = document.createElement("script");
    script.src = "monitoring-value-safety.js?v=20260916-2";
    script.dataset.monitoringValueSafety = "1";
    document.head.appendChild(script);
  }
})();