(() => {
  if (window.__fusionSolarApiSetupInstalled) return;
  window.__fusionSolarApiSetupInstalled = true;

  if (!document.querySelector('script[data-monitoring-value-safety]')) {
    const script = document.createElement("script");
    script.src = "monitoring-value-safety.js?v=20260916-2";
    script.dataset.monitoringValueSafety = "1";
    document.head.appendChild(script);
  }

  if (!document.querySelector('script[data-fusion-live-values]')) {
    const script = document.createElement("script");
    script.src = "fusion-live-values.js?v=20260916-1";
    script.dataset.fusionLiveValues = "1";
    document.head.appendChild(script);
  }
})();