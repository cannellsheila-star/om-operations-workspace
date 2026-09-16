(() => {
  if (window.__fusionSolarUnifiedRouterInstalled) return;
  window.__fusionSolarUnifiedRouterInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  const targetPaths = new Set(["/api/fusionsolar", "/api/fusionsolar-range", "/api/fusionsolar-sg5"]);

  function rewriteUrl(value) {
    try {
      const url = new URL(String(value), window.location.origin);
      if (!targetPaths.has(url.pathname)) return null;
      url.pathname = "/api/fusionsolar-unified";
      return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : url.toString();
    } catch {
      return null;
    }
  }

  window.fetch = function fusionSolarUnifiedFetch(input, init) {
    if (typeof input === "string" || input instanceof URL) {
      const rewritten = rewriteUrl(input);
      return nativeFetch(rewritten || input, init);
    }
    if (input instanceof Request) {
      const rewritten = rewriteUrl(input.url);
      if (!rewritten) return nativeFetch(input, init);
      const request = new Request(rewritten, input);
      return nativeFetch(request, init);
    }
    return nativeFetch(input, init);
  };
})();
