/**
 * Check WhatsApp task-assign readiness. Run from backend/: node scripts/check-whatsapp-readiness.js
 */
import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const { default: mongoose } = await import("mongoose");
const { User } = await import("../src/models/User.js");
const { isWhatsAppConfigured, whatsAppConfigStatus, normalizePhone } = await import(
  "../src/services/whatsappService.js"
);

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("Set MONGODB_URI in backend/.env");
    process.exit(1);
  }
  await mongoose.connect(uri);

  const users = await User.find({ active: true }).select("name email role phone").lean();
  const noPhone = [];
  const badPhone = [];
  const okPhone = [];

  for (const u of users) {
    const phone = normalizePhone(u.phone);
    if (!String(u.phone || "").trim()) noPhone.push(u);
    else if (phone.length < 10) badPhone.push({ ...u, normalized: phone });
    else okPhone.push(u);
  }

  const cfg = whatsAppConfigStatus();

  console.log("\n=== WhatsApp configuration ===");
  console.log("API configured:", isWhatsAppConfigured() ? "yes (live)" : "no (stub only)");
  console.log("WHATSAPP_PHONE_NUMBER_ID:", cfg.phoneNumberIdSet ? cfg.phoneNumberId : "(NOT SET)");
  console.log(
    "WHATSAPP_ACCESS_TOKEN:",
    cfg.accessTokenSet ? `set (${cfg.accessTokenLength} chars)` : "(NOT SET)"
  );
  console.log("WHATSAPP_TASK_ASSIGN_ENABLED:", process.env.WHATSAPP_TASK_ASSIGN_ENABLED ?? "true (default)");
  console.log(
    "WHATSAPP_TEMPLATE_MORNING (task assign + 09:45 digest):",
    process.env.WHATSAPP_TEMPLATE_MORNING || "globaltasks_morning_digest_v1 (default)"
  );

  if (!cfg.configured) {
    console.log("\nFix: set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in backend/.env, then restart the API.");
  }

  console.log("\n=== Active users & phone ===");
  console.log(`Total active: ${users.length}`);
  console.log(`Valid phone: ${okPhone.length}`);
  console.log(`Missing phone: ${noPhone.length}`);
  console.log(`Invalid phone: ${badPhone.length}`);

  if (noPhone.length) {
    console.log("\nUsers missing phone (no WhatsApp will be sent):");
    for (const u of noPhone.slice(0, 15)) {
      console.log(`  - ${u.name} (${u.email}) [${u.role}]`);
    }
    if (noPhone.length > 15) console.log(`  ... and ${noPhone.length - 15} more`);
  }

  if (badPhone.length) {
    console.log("\nUsers with invalid phone format:");
    for (const u of badPhone.slice(0, 10)) {
      console.log(`  - ${u.name} (${u.email}) stored="${u.phone}" normalized="${u.normalized}"`);
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
