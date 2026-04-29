import "dotenv/config";
import mongoose from "mongoose";
import { Task } from "../src/models/Task.js";

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/tms";
const keepTitles = ["manjot's task", "task manjot 2"];

async function run() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 12_000 });

  const filter = {
    assignees: { $exists: true, $not: { $size: 0 } },
    title: { $nin: keepTitles },
  };
  const options = { collation: { locale: "en", strength: 2 } };

  const matchedForDeletion = await Task.countDocuments(filter).collation(options.collation);
  const result = await Task.deleteMany(filter, options);

  console.log(
    JSON.stringify(
      {
        matchedForDeletion,
        deletedCount: result.deletedCount,
        keptTitles,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect failure
  }
  process.exit(1);
});
