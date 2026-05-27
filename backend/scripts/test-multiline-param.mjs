import "dotenv/config";
import { connectDatabase } from "../src/config/database.js";
import { Task } from "../src/models/Task.js";
import { User } from "../src/models/User.js";
import "../src/models/Department.js";
import "../src/models/Center.js";
import "../src/models/Project.js";
import { notifyTaskAssignedWhatsApp } from "../src/services/whatsappTaskAssignment.js";
import { sendWhatsAppTemplate } from "../src/services/whatsappService.js";

await connectDatabase(process.env.MONGODB_URI);
const user = await User.findOne({ name: /manjot/i }).lean();
const task = await Task.findOne({ assignees: user._id }).sort({ createdAt: -1 }).lean();

const r = await notifyTaskAssignedWhatsApp({
  taskId: task._id,
  assigneeIds: [user._id],
  assignedByUserId: task.createdBy,
});
console.log(JSON.stringify(r, null, 2));
