const https = require("https");

const HOST = "intl.fusionsolar.huawei.com";
const PATH = "/thirdData/login";
const VERSION = "intl-probe-v1-20260915";

const clean = (value) => String(value ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();

function postLogin(userName, systemCode) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ userName, systemCode });
    const req = https.request({
      protocol: "https:",
      hostname: HOST,
      port: 443,
      path: PATH,
      method: "POST",
      timeout: 20000,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, */*",
        "Content-Length": Buffer.byteLength(payload),
        "User-Agent": "BlueEnergy-OandM/1.0",
      },
    }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => {
        let json = {};
        try { json = text ? JSON.parse(text) : {}; } catch {}
        resolve({ status: Number(response.statusCode || 0), json, headers: response.headers || {}, raw: text });
      });
    });
    req.on("timeout", () => {
      const error = new Error("FusionSolar intl probe timed out after 20 seconds.");
      error.code = "ETIMEDOUT";
      req.destroy(error);
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed.", version: VERSION });

  const userName = clean(process.env.FUSIONSOLAR_USERNAME);
  const systemCode = clean(process.env.FUSIONSOLAR_SYSTEM_CODE);
  if (!userName || !systemCode) {
    return res.status(200).json({ configured: false, version: VERSION, host: HOST });
  }

  try {
    const result = await postLogin(userName, systemCode);
    const tokenPresent = Boolean(result.headers?.["xsrf-token"] || result.headers?.["x-xsrf-token"] || result.headers?.["set-cookie"]);
    return res.status(200).json({
      configured: true,
      version: VERSION,
      region: process.env.VERCEL_REGION || null,
      host: HOST,
      httpStatus: result.status,
      success: result.json?.success === true,
      failCode: result.json?.failCode ?? null,
      message: result.json?.message ?? null,
      tokenPresent,
      username: userName,
      systemCodeLength: systemCode.length,
    });
  } catch (error) {
    return res.status(502).json({
      configured: true,
      version: VERSION,
      region: process.env.VERCEL_REGION || null,
      host: HOST,
      message: `${error.code || error.name || "ERR"}: ${error.message || error}`,
      username: userName,
      systemCodeLength: systemCode.length,
    });
  }
};
