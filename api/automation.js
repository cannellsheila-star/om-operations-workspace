const validActions = new Set(["ticket-email", "quote-approval", "pm-package", "include-next-pm"]);

function addressList(value) {
  if (!value) return [];
  const addresses = Array.isArray(value) ? value : String(value).split(",");
  return addresses.map((address) => address.trim()).filter(Boolean);
}

function isEmail(address) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
}

function readBody(req) {
  if (typeof req.body === "string") return JSON.parse(req.body);
  return req.body || {};
}

function automationReady(req) {
  const expected = process.env.AUTOMATION_SECRET;
  const received = req.headers.authorization || "";
  return Boolean(expected && received === `Bearer ${expected}`);
}

async function sendWithResend(message, idempotencyKey) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(message),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "The email provider rejected this request.");
  return result;
}

module.exports = async function automation(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") {
    return res.status(200).json({
      deliveryEnabled: process.env.EMAIL_SENDING_ENABLED === "true",
      providerConfigured: Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM),
      protected: Boolean(process.env.AUTOMATION_SECRET),
    });
  }
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed." });

  try {
    const event = readBody(req);
    const action = String(event.action || "");
    const to = addressList(event.to);
    const cc = addressList(event.cc);
    const subject = String(event.subject || "").trim();
    const text = String(event.text || "").trim();
    const ticketId = String(event.ticketId || "").trim();

    if (!validActions.has(action)) return res.status(400).json({ message: "Unknown automation action." });
    if (!to.length || !to.every(isEmail) || !cc.every(isEmail) || !subject || !text) {
      return res.status(400).json({ message: "A recipient, subject and message are required." });
    }

    const providerConfigured = Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
    const deliveryEnabled = process.env.EMAIL_SENDING_ENABLED === "true";
    if (!providerConfigured || !deliveryEnabled || !automationReady(req)) {
      return res.status(202).json({
        status: "prepared",
        message: "Email prepared. Secure delivery is waiting for the approved mail-service configuration.",
      });
    }

    const idempotencyKey = String(event.idempotencyKey || `${action}:${ticketId}:${subject}`).slice(0, 255);
    const result = await sendWithResend({ from: process.env.MAIL_FROM, to, cc, subject, text }, idempotencyKey);
    return res.status(200).json({ status: "sent", id: result.id || null });
  } catch (error) {
    return res.status(500).json({ message: error.message || "The automation could not be completed." });
  }
};
