import "dotenv/config";
import { connectDatabase } from "../src/config/database.js";
import { User } from "../src/models/User.js";
import { Task } from "../src/models/Task.js";
import "../src/models/Department.js";
import "../src/models/Center.js";
import "../src/models/Project.js";
import {
  isWhatsAppConfigured,
  normalizePhone,
  sendWhatsAppText,
  sendWhatsAppTemplate,
} from "../src/services/whatsappService.js";
import { notifyTaskAssignedWhatsApp } from "../src/services/whatsappTaskAssignment.js";

const TARGET = process.argv[2] || "manjot";

await connectDatabase(process.env.MONGODB_URI);

console.log("configured:", isWhatsAppConfigured());
console.log("template task:", process.env.WHATSAPP_TEMPLATE_TASK_ASSIGNED || "(none)");

const user = await User.findOne({
  active: true,
  name: new RegExp(TARGET, "i"),
}).select("_id name phone role").lean();

if (!user) {
  console.error("User not found for", TARGET);
  process.exit(1);
}

const phone = normalizePhone(user.phone);
console.log("user:", user.name, "raw phone:", user.phone, "normalized:", phone);

async function trySend(label, fn) {
  try {
    const r = await fn();
    console.log(`OK ${label}:`, JSON.stringify(r));
    return true;
  } catch (e) {
    console.error(`FAIL ${label}:`, e.message);
    if (e.meta) console.error("  meta:", e.meta);
    return false;
  }
}

await trySend("plain text", () =>
  sendWhatsAppText({
    to: phone,
    text: `GlobalTasks test ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} — if you see this, text channel works.`,
  })
);

const tpl = process.env.WHATSAPP_TEMPLATE_TASK_ASSIGNED?.trim();
if (tpl) {
  await trySend(`template ${tpl}`, () =>
    sendWhatsAppTemplate({
      to: phone,
      name: tpl,
      languageCode: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en",
      parameters: [
        user.name,
        "Test Admin",
        "Test task title",
        "Description:\nThis is a test assign message.\n\nType: One Time\nPriority: High\nDue: Today\nApp: https://tasks.globalsofts.in/pending-single",
      ],
    })
  );
}

const task = await Task.findOne({ assignees: user._id }).sort({ createdAt: -1 }).lean();
if (task) {
  console.log("\n--- notifyTaskAssignedWhatsApp ---");
  const r = await notifyTaskAssignedWhatsApp({
    taskId: task._id,
    assigneeIds: [user._id],
    assignedByUserId: task.createdBy,
  });
  console.log(JSON.stringify(r, null, 2));
} else {
  console.log("No task for user, skipping full assign flow");
}

process.exit(0);
