import "dotenv/config";
import { connectDatabase } from "../src/config/database.js";
import { User } from "../src/models/User.js";
import { Center } from "../src/models/Center.js";

const nameQ = process.argv[2] || "sachin";
const centerQ = process.argv[3] || "moga";

await connectDatabase(process.env.MONGODB_URI);
const centers = await Center.find({ name: new RegExp(centerQ, "i") }).lean();
const centerIds = centers.map((c) => c._id);
console.log(
  "Centers:",
  centers.map((c) => ({ id: String(c._id), name: c.name }))
);

const byName = await User.find({ name: new RegExp(nameQ, "i") }).select("name phone active centerId role").lean();
const inCenter =
  centerIds.length > 0
    ? await User.find({ centerId: { $in: centerIds }, name: new RegExp(nameQ, "i") })
        .select("name phone active centerId role")
        .lean()
    : [];

console.log("\nBy name (all centers):");
for (const u of byName) {
  const c = u.centerId ? await Center.findById(u.centerId).select("name").lean() : null;
  console.log({ name: u.name, phone: u.phone || "(empty)", center: c?.name || "(none)", id: String(u._id) });
}

console.log("\nIn Moga center matching name:");
for (const u of inCenter) {
  console.log({ name: u.name, phone: u.phone || "(empty)", id: String(u._id) });
}

if (centerIds.length) {
  console.log("\nAll Moga users with phones:");
  const mogaUsers = await User.find({ centerId: { $in: centerIds }, active: true })
    .select("name phone role")
    .sort({ name: 1 })
    .lean();
  for (const u of mogaUsers.filter((x) => x.phone)) {
    console.log({ name: u.name, phone: u.phone });
  }
}

process.exit(0);
