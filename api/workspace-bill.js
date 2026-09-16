const path = require("path");

function safePart(value, fallback) {
  const text = String(value || "").trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return text || fallback;
}

async function readRaw(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

module.exports = async function workspaceBill(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed." });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ configured: false, persistent: false, message: "Persistent bill storage is not connected yet." });
  }

  try {
    const systemId = safePart(req.query?.systemId, "unassigned");
    const suppliedName = safePart(req.query?.fileName, "electricity-bill.pdf");
    const ext = path.extname(suppliedName).slice(0, 12);
    const base = safePart(path.basename(suppliedName, ext), "electricity-bill");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const pathname = `om-workspace/bills/${systemId}/${stamp}-${base}${ext}`;
    const bytes = await readRaw(req);
    if (!bytes.length) return res.status(400).json({ message: "The bill file was empty." });
    if (bytes.length > 4 * 1024 * 1024) return res.status(413).json({ message: "Bill files are limited to 4 MB for direct upload." });

    const { put } = await import("@vercel/blob");
    const blob = await put(pathname, bytes, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: String(req.headers["content-type"] || "application/octet-stream"),
    });
    return res.status(200).json({ configured: true, persistent: true, pathname: blob.pathname, fileName: suppliedName, contentType: blob.contentType || req.headers["content-type"] || "" });
  } catch (error) {
    return res.status(500).json({ configured: true, persistent: false, message: error?.message || "Bill upload failed." });
  }
};
