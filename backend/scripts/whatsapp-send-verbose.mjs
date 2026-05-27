import "dotenv/config";
import { normalizePhone } from "../src/services/whatsappService.js";

const phone = normalizePhone(process.argv[2] || "8569049090");
const text = process.argv[3] || "GlobalTasks delivery test";
const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
const token = process.env.WHATSAPP_ACCESS_TOKEN;

const res = await fetch(`https://graph.facebook.com/v20.0/${id}/messages`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    messaging_product: "whatsapp",
    to: phone,
    type: "text",
    text: { body: text },
  }),
});

const body = await res.text();
console.log("status", res.status);
console.log("body", body);
