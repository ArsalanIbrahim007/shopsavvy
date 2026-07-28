import express from "express";

const router = express.Router();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Check API health
 *     description: Returns the current status of the ShopSavvy backend.
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: Backend is running successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 message:
 *                   type: string
 *                   example: ShopSavvy backend is running
 */

router.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "ShopSavvy backend is running",
  });
});

export default router;