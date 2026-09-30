import mongoose from "mongoose";

import { ensureIndexes } from "./indexes.js";

// While disconnected Mongoose holds database commands in a buffer and, by
// default, waits 10 s for a reconnection before failing them, so every request
// during an outage hung that long. Fail after 5 s instead; the error handler
// turns the failure into a 503.
mongoose.set("bufferTimeoutMS", 5000);

// Logged so an outage after start-up is visible. Without these the first sign
// of a database that dropped was requests failing with generic errors.
mongoose.connection.on("disconnected", () => console.warn("[db] MongoDB disconnected"));
mongoose.connection.on("reconnected", () => console.log("[db] MongoDB reconnected"));
mongoose.connection.on("error", (error) => console.error("[db] MongoDB error:", error.message));

export async function connectDB() {
  try {
    const mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
      throw new Error("MONGO_URI is missing in .env file");
    }

    // Give up on the first connection after 10 s (the default is 30 s) with a clear message.
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });

    console.log("MongoDB connected successfully");

    // Wait for the indexes and report any that could not be built (for example a
    // unique index over data that already contains duplicates). Not fatal.
    await ensureIndexes();
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
}
