import mongoose from "mongoose";

let listenersAttached = false;

function attachConnectionListeners() {
  if (listenersAttached) return;
  listenersAttached = true;

  mongoose.connection.on("connected", () => {
    console.log("[db] MongoDB connected");
  });
  mongoose.connection.on("disconnected", () => {
    console.warn("[db] MongoDB disconnected — will retry on next operation");
  });
  mongoose.connection.on("reconnected", () => {
    console.log("[db] MongoDB reconnected");
  });
  mongoose.connection.on("error", (err) => {
    console.error("[db] MongoDB error:", err?.message || err);
  });
}

/**
 * Avoid process crash from slow Atlas / network blips after the server is up.
 * (node --watch still restarts if something throws uncaught; log clearly here.)
 */
export function attachProcessMongoGuards() {
  process.on("unhandledRejection", (reason) => {
    const msg = String(reason?.message || reason || "");
    if (
      msg.includes("MongoServerSelectionError") ||
      msg.includes("MongoNetwork") ||
      msg.includes("MongoTimeout") ||
      msg.includes("ReplicaSetNoPrimary") ||
      msg.includes("buffering timed out")
    ) {
      console.error("[db] Unhandled MongoDB rejection (server stays up):", msg);
      return;
    }
    console.error("[unhandledRejection]", reason);
  });
}

export async function connectDatabase(uri) {
  mongoose.set("strictQuery", true);
  attachConnectionListeners();

  try {
    await mongoose.connect(uri, {
      // Atlas free tier / flaky networks need longer selection times than 12s defaults.
      serverSelectionTimeoutMS: Math.max(15_000, Number(process.env.MONGODB_SERVER_SELECTION_MS) || 30_000),
      socketTimeoutMS: Math.max(20_000, Number(process.env.MONGODB_SOCKET_TIMEOUT_MS) || 45_000),
      connectTimeoutMS: Math.max(10_000, Number(process.env.MONGODB_CONNECT_TIMEOUT_MS) || 30_000),
      maxPoolSize: Math.min(100, Math.max(10, Number(process.env.MONGODB_MAX_POOL_SIZE) || 50)),
      minPoolSize: Math.max(0, Number(process.env.MONGODB_MIN_POOL_SIZE) || 2),
      maxIdleTimeMS: 60_000,
      heartbeatFrequencyMS: 10_000,
      retryWrites: true,
      retryReads: true,
    });
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.includes("Atlas") || uri.includes("mongodb.net") || msg.includes("ReplicaSetNoPrimary")) {
      console.error("\n[MongoDB Atlas] Connection failed.");
      console.error("  1. Atlas → Network Access → add your current IP (or 0.0.0.0/0 for dev only).");
      console.error("  2. Atlas → Database → confirm user/password and database user has read/write.");
      console.error("  3. Confirm the cluster is not Paused (free tier pauses after inactivity).");
      console.error("  4. Primary node timeout / ReplicaSetNoPrimary = network blip or IP not whitelisted.");
      console.error("  5. If on a strict network/VPN, try another network or use local MongoDB:\n");
      console.error("     MONGODB_URI=mongodb://127.0.0.1:27017/globaltasks\n");
    }
    throw err;
  }
}
