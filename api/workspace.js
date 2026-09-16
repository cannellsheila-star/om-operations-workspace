const SNAPSHOT_PATH = "om-workspace/workspace.json";

function bodyObject(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try { return JSON.parse(String(req.body)); } catch { return {}; }
}

async function blobSdk() {
  return import("@vercel/blob");
}

async function readJsonBlob() {
  const { get } = await blobSdk();
  const result = await get(SNAPSHOT_PATH, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  const text = await new Response(result.stream).text();
  return text ? JSON.parse(text) : null;
}

module.exports = async function workspace(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({
      configured: false,
      persistent: false,
      message: "Persistent workspace storage is not connected yet. Browser storage remains active until a Vercel Blob store is connected.",
    });
  }

  try {
    if (req.method === "GET") {
      const snapshot = await readJsonBlob();
      return res.status(200).json({ configured: true, persistent: true, snapshot });
    }

    if (req.method === "POST" || req.method === "PUT") {
      const payload = bodyObject(req);
      const source = payload.snapshot && typeof payload.snapshot === "object" ? payload.snapshot : payload;
      if (!Array.isArray(source.systems) || !Array.isArray(source.tickets) || !Array.isArray(source.maintenance)) {
        return res.status(400).json({ message: "Workspace snapshot must contain systems, tickets and maintenance arrays." });
      }

      const snapshot = {
        version: 1,
        updatedAt: new Date().toISOString(),
        systems: source.systems,
        tickets: source.tickets,
        maintenance: source.maintenance,
      };
      const serialised = JSON.stringify(snapshot);
      if (Buffer.byteLength(serialised, "utf8") > 4 * 1024 * 1024) {
        return res.status(413).json({ message: "Workspace snapshot is too large to save." });
      }

      const { put } = await blobSdk();
      const blob = await put(SNAPSHOT_PATH, serialised, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
      });
      return res.status(200).json({ configured: true, persistent: true, updatedAt: snapshot.updatedAt, pathname: blob.pathname });
    }

    return res.status(405).json({ message: "Method not allowed." });
  } catch (error) {
    return res.status(500).json({ configured: true, persistent: false, message: error?.message || "Workspace storage failed." });
  }
};
