import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { connectDB } from "../src/config/db.js";
import Listing from "../src/models/listing.model.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const normalizeText = (text = "") => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const seedDatabase = async () => {
  try {
    await connectDB();

    // Remove existing data
    await Listing.deleteMany({});
    console.log("Existing listings deleted.");

    // Read JSON file
    const dataPath = path.join(__dirname, "listings.json");
    const listings = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

    // Add generated fields
    const formattedListings = listings.map((listing) => ({
      ...listing,
      normalizedTitle: normalizeText(listing.title),
      lastScrapedAt: new Date(),
      isActive: true,
    }));

    await Listing.insertMany(formattedListings);

    console.log(`Successfully inserted ${formattedListings.length} listings.`);

    mongoose.connection.close();
  } catch (error) {
    console.error("Seeding failed:");
    console.error(error);
    mongoose.connection.close();
  }
};

seedDatabase();