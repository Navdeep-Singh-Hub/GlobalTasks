import "dotenv/config";
import mongoose from "mongoose";
import { TherapistSession } from "../src/models/TherapistSession.js";

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }
  await mongoose.connect(uri);
  const result = await TherapistSession.updateMany(
    {},
    { $unset: { targetAssigned: 1, targetAchieved: 1 } }
  );
  console.log(`Matched: ${result.matchedCount}, Updated: ${result.modifiedCount}`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("Failed to remove therapist target fields:", err);
  try {
    await mongoose.disconnect();
  } catch {
    // noop
  }
  process.exit(1);
});
