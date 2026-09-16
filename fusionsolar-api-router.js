(() => {
  if (window.__fusionSolarApiSetupInstalled) return;
  window.__fusionSolarApiSetupInstalled = true;

  if (!document.querySelector('script[data-monitoring-value-safety]')) {
    const script = document.createElement("script");
    script.src = "monitoring-value-safety.js?v=20260916-3";
    script.dataset.monitoringValueSafety = "1";
    document.head.appendChild(script);
  }

  // Use the shared, rate-safe snapshot endpoint as the only FusionSolar live
  // source. Do not load fusion-live-values.js here: that module polls
  // /api/fusionsolar-live separately and competes with getDevRealKpi limits.
  if (!document.querySelector('script[data-fusion-live-overview]')) {
    const script = document.createElement("script");
    script.src = "fusion-live-overview.js?v=20260916-2";
    script.dataset.fusionLiveOverview = "1";
    script.async = false;
    document.head.appendChild(script);
  }
})();