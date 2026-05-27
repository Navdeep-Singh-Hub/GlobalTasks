import "dotenv/config";
import { connectDatabase } from "../src/config/database.js";
import { Task } from "../src/models/Task.js";
import { User } from "../src/models/User.js";
import "../src/models/Department.js";
import "../src/models/Center.js";
import "../src/models/Project.js";
import { notifyTaskAssignedWhatsApp } from "../src/services/whatsappTaskAssignment.js";
import { normalizePhone } from "../src/services/whatsappService.js";

const uri = process.env.MONGODB_URI;
await connectDatabase(uri);
const task = await Task.findOne({ assignees: { $exists: true, $ne: [] } }).sort({ createdAt: -1 }).lean();
if (!task) {
  console.log("no task with assignees");
  process.exit(0);
}
const assigneeId = task.assignees[0];
const user = await User.findById(assigneeId).select("name phone active role").lean();
console.log("task:", task.title);
console.log("assignee:", user?.name, "phone:", user?.phone, "norm:", normalizePhone(user?.phone), "active:", user?.active);
const r = await notifyTaskAssignedWhatsApp({
  taskId: task._id,
  assigneeIds: [assigneeId],
  assignedByUserId: task.createdBy,
});
console.log(JSON.stringify(r, null, 2));
process.exit(0);
