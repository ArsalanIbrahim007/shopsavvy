import express from "express";

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "ShopSavvy backend is running"
  });
});

export default router;
