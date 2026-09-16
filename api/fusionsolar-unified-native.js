const https = require("https");

// The SG5 Northbound endpoint resolves correctly from Vercel's Singapore
// region. The unified client still contains the former direct-IP transport as
// a fallback implementation; this wrapper converts only those SG5 requests
// back to native DNS before the handler runs so Huawei sees the same endpoint
// path as the proven SG5 connector.
const nativeRequest = https.request;
const SG5_HOST = "sg5.fusionsolar.huawei.com";
const SG5_IPS = new Set(["43.128.81.107", "119.8.160.213"]);

https.request = function requestWithNativeSg5(options, ...args) {
  if (options && typeof options === "object") {
    const host = String(options.hostname || options.host || "");
    const isSg5Direct = SG5_IPS.has(host) || String(options.servername || "") === SG5_HOST;
    if (isSg5Direct) {
      const headers = { ...(options.headers || {}) };
      delete headers.Host;
      delete headers.host;
      options = {
        ...options,
        host: undefined,
        hostname: SG5_HOST,
        servername: SG5_HOST,
        headers,
      };
    }
  }
  return nativeRequest.call(https, options, ...args);
};

module.exports = require("./fusionsolar-unified");
