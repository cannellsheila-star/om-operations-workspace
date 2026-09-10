function readBody(req) {
  if (typeof req.body === "string") return JSON.parse(req.body);
  return req.body || {};
}

function hasValidSecret(req) {
  const expected = process.env.INBOUND_WEBHOOK_SECRET;
  const received = req.headers["x-inbound-secret"] || req.headers.authorization;
  return Boolean(expected && (received === expected || received === `Bearer ${expected}`));
}

module.exports = async function inboundTicket(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed." });
  if (!process.env.INBOUND_WEBHOOK_SECRET || !hasValidSecret(req)) {
    return res.status(401).json({ message: "Inbound ticket mail is not configured." });
  }

  try {
    const mail = readBody(req);
    const recipients = Array.isArray(mail.to) ? mail.to : String(mail.to || "").split(",");
    const ticketAddress = recipients.map((item) => item.trim().toLowerCase()).find((item) => /^tkt-\d{4}-\d{4}@records\.blueenergy\.co\.za$/.test(item));
    if (!ticketAddress) return res.status(422).json({ message: "A dedicated ticket address is required." });

    const ticketId = ticketAddress.split("@")[0].toUpperCase();
    return res.status(202).json({
      status: "received",
      ticketId,
      message: "Inbound email accepted. Connect the ticket database to retain this message in its history.",
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || "The inbound email could not be read." });
  }
};
