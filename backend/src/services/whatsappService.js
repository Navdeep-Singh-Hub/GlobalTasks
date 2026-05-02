const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const ADMIN_PHONE = process.env.WHATSAPP_ADMIN_PHONE || "";
const API_URL = PHONE_NUMBER_ID ? `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages` : "";

export function normalizePhone(phone) {
  const raw = String(phone || "").replace(/[^\d+]/g, "");
  if (!raw) return "";
  return raw.startsWith("+") ? raw.slice(1) : raw;
}

export function isWhatsAppConfigured() {
  return Boolean(API_URL && ACCESS_TOKEN);
}

async function sendPayload(phone, payload, stubLogText) {
  if (!API_URL || !ACCESS_TOKEN) {
    console.log(`[whatsapp:stub] to=${phone} ${stubLogText}`);
    return { ok: true, stub: true };
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`WhatsApp send failed (${res.status}): ${errText || "unknown error"}`);
  }
  return { ok: true };
}

export async function sendWhatsAppText({ to, text, fallbackToAdmin = false }) {
  let phone = normalizePhone(to);
  if (!phone && fallbackToAdmin) phone = normalizePhone(ADMIN_PHONE);
  if (!phone || !text) return { ok: false, skipped: true, reason: "missing_phone_or_text" };

  return sendPayload(
    phone,
    {
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: text },
    },
    `text=${text}`
  );
}

export async function sendWhatsAppTemplate({ to, name, languageCode = "en", parameters = [], fallbackToAdmin = false }) {
  let phone = normalizePhone(to);
  if (!phone && fallbackToAdmin) phone = normalizePhone(ADMIN_PHONE);
  if (!phone || !name) return { ok: false, skipped: true, reason: "missing_phone_or_template" };

  return sendPayload(
    phone,
    {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name,
        language: { code: languageCode },
        components: [
          {
            type: "body",
            parameters: parameters.map((p) => ({ type: "text", text: String(p ?? "") })),
          },
        ],
      },
    },
    `template=${name} params=${JSON.stringify(parameters)}`
  );
}

