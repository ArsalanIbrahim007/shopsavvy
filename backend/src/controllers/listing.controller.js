import Listing from "../models/listing.model.js";

export async function createListing(req, res) {
  try {
    const listing = await Listing.create(req.body);

    res.status(201).json({
      success: true,
      data: listing,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getListings(req, res) {
  try {
    const listings = await Listing.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      count: listings.length,
      data: listings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}