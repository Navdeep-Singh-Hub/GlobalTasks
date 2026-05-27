const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const ADMIN_PHONE = process.env.WHATSAPP_ADMIN_PHONE || "";
const API_URL = PHONE_NUMBER_ID ? `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages` : "";

export function normalizePhone(phone) {
  const raw = String(phone || "").replace(/[^\d+]/g, "");
  if (!raw) return "";
  let digits = raw.startsWith("+") ? raw.slice(1) : raw;
  // India mobile stored as 10 digits without country code
  if (digits.length === 10 && /^[6-9]/.test(digits)) digits = `91${digits}`;
  return digits;
}

function parseMetaErrorBody(errText) {
  try {
    const j = JSON.parse(errText);
    const err = j?.error || {};
    return {
      message: err.message || errText,
      code: err.code,
      subcode: err.error_subcode,
      type: err.type,
    };
  } catch {
    return { message: errText || "unknown error" };
  }
}

export function isWhatsAppConfigured() {
  return Boolean(API_URL && ACCESS_TOKEN);
}

/** Normalize template variable text; keeps line breaks (one detail per line). */
export function sanitizeTemplateParam(value, maxLen = 1024) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, maxLen);
}

export function isTemplateMissingError(err) {
  const code = err?.meta?.code;
  return code === 132001 || String(err?.message || "").includes("132001");
}

export function isTemplateParamError(err) {
  const code = err?.meta?.code;
  return code === 132018 || String(err?.message || "").includes("132018");
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
    const meta = parseMetaErrorBody(errText);
    const hint =
      meta.code === 131047 || String(meta.message || "").toLowerCase().includes("re-engagement")
        ? " Use an approved WhatsApp template (24h session window closed)."
        : "";
    const err = new Error(`WhatsApp send failed (${res.status}): ${meta.message || "unknown error"}${hint}`);
    err.meta = meta;
    throw err;
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  const messageId = data?.messages?.[0]?.id;
  return { ok: true, messageId, waId: data?.contacts?.[0]?.wa_id };
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
            parameters: parameters.map((p) => ({
              type: "text",
              text: sanitizeTemplateParam(p),
            })),
          },
        ],
      },
    },
    `template=${name} params=${JSON.stringify(parameters)}`
  );
}

