import mongoose from "mongoose";

export async function connectDatabase(uri) {
  mongoose.set("strictQuery", true);
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 12_000,
    });
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.includes("Atlas") || uri.includes("mongodb.net")) {
      console.error("\n[MongoDB Atlas] Connection failed.");
      console.error("  1. Atlas → Network Access → add your current IP (or 0.0.0.0/0 for dev only).");
      console.error("  2. Atlas → Database → confirm user/password and database user has read/write.");
      console.error("  3. Confirm the cluster is not Paused (free tier pauses after inactivity).");
      console.error("  4. If on a strict network/VPN, try another network or use local MongoDB:\n");
      console.error("     MONGODB_URI=mongodb://127.0.0.1:27017/globaltasks\n");
    }
    throw err;
  }
}
