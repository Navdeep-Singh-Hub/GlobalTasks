/**
 * Check WhatsApp task-assign readiness. Run: node scripts/check-whatsapp-readiness.js
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { User } from "../src/models/User.js";
import { isWhatsAppConfigured, normalizePhone } from "../src/services/whatsappService.js";

dotenv.config();

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

  console.log("\n=== WhatsApp configuration ===");
  console.log("API configured:", isWhatsAppConfigured() ? "yes (live)" : "no (stub only)");
  console.log("WHATSAPP_TASK_ASSIGN_ENABLED:", process.env.WHATSAPP_TASK_ASSIGN_ENABLED ?? "true (default)");
  console.log(
    "WHATSAPP_TEMPLATE_TASK_ASSIGNED:",
    process.env.WHATSAPP_TEMPLATE_TASK_ASSIGNED || "(NOT SET — plain text may fail outside 24h window)"
  );

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

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
