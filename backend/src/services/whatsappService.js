const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const ADMIN_PHONE = process.env.WHATSAPP_ADMIN_PHONE || "";
const API_URL = PHONE_NUMBER_ID ? `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages` : "";

function normalizePhone(phone) {
  const raw = String(phone || "").replace(/[^\d+]/g, "");
  if (!raw) return "";
  return raw.startsWith("+") ? raw.slice(1) : raw;
}

export function isWhatsAppConfigured() {
  return Boolean(API_URL && ACCESS_TOKEN);
}

export async function sendWhatsAppText({ to, text }) {
  const phone = normalizePhone(to || ADMIN_PHONE);
  if (!phone || !text) return { ok: false, skipped: true, reason: "missing_phone_or_text" };

  if (!API_URL || !ACCESS_TOKEN) {
    console.log(`[whatsapp:stub] to=${phone} text=${text}`);
    return { ok: true, stub: true };
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`WhatsApp send failed (${res.status}): ${errText || "unknown error"}`);
  }
  return { ok: true };
}

