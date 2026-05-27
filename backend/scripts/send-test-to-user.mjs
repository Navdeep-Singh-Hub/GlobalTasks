import "dotenv/config";
import { connectDatabase } from "../src/config/database.js";
import { User } from "../src/models/User.js";
import { Center } from "../src/models/Center.js";
import { normalizePhone, sendWhatsAppText, isWhatsAppConfigured } from "../src/services/whatsappService.js";
import { notifyTaskAssignedWhatsApp } from "../src/services/whatsappTaskAssignment.js";
import { Task } from "../src/models/Task.js";
import "../src/models/Department.js";
import "../src/models/Project.js";

const nameQuery = process.argv[2] || "sachin";
const centerQuery = process.argv[3] || "moga";
const phoneOverride = process.argv[4] ? String(process.argv[4]).trim() : "";

await connectDatabase(process.env.MONGODB_URI);

const centers = await Center.find({ name: new RegExp(centerQuery, "i") }).select("_id name").lean();
const centerIds = centers.map((c) => c._id);

let user = await User.findOne({
  active: true,
  name: new RegExp(nameQuery, "i"),
  ...(centerIds.length ? { centerId: { $in: centerIds } } : {}),
}).select("_id name phone role centerId").lean();

if (!user) {
  user = await User.findOne({ active: true, name: new RegExp(nameQuery, "i") })
    .select("_id name phone role centerId")
    .lean();
}

if (!user) {
  console.error("User not found:", nameQuery, centerQuery);
  process.exit(1);
}

const center = user.centerId ? await Center.findById(user.centerId).select("name").lean() : null;
const phone = phoneOverride ? normalizePhone(phoneOverride) : normalizePhone(user.phone);
console.log("User:", user.name, "| Center:", center?.name || "?", "| Phone:", user.phone || "(empty)", "→", phone);
console.log("WhatsApp configured:", isWhatsAppConfigured());

if (phone.length < 10) {
  console.error("Invalid phone. Add phone in Users screen or run:");
  console.error(`  node scripts/send-test-to-user.mjs "${nameQuery}" "${centerQuery}" 98XXXXXXXX`);
  process.exit(1);
}

const text = `GlobalTasks test for ${user.name} (${center?.name || "center"}) — ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}. Reply YES if received.`;

try {
  const r = await sendWhatsAppText({ to: phone, text });
  console.log("Plain text sent:", r);
} catch (e) {
  console.error("Plain text failed:", e.message);
}

const task = await Task.findOne({ assignees: user._id, deletedAt: null }).sort({ createdAt: -1 }).lean();
if (task) {
  console.log("\nTask assign notification for:", task.title);
  const assign = await notifyTaskAssignedWhatsApp({
    taskId: task._id,
    assigneeIds: [user._id],
    assignedByUserId: task.createdBy,
  });
  console.log(JSON.stringify(assign, null, 2));
} else {
  console.log("\nNo task found for user — only plain text test sent.");
}

process.exit(0);
