import { body, validationResult } from "express-validator";

export const validateCreateListing = [
  body("platform")
    .trim()
    .notEmpty()
    .withMessage("Platform is required"),

  body("title")
    .trim()
    .notEmpty()
    .withMessage("Title is required")
    .isLength({ min: 3, max: 300 })
    .withMessage(
      "Title must be between 3 and 300 characters"
    ),

  body("price")
    .isFloat({ gt: 0 })
    .withMessage(
      "Price must be greater than zero"
    ),

  body("currency")
    .optional()
    .trim()
    .isLength({ min: 3, max: 5 })
    .withMessage(
      "Currency should be 3–5 characters"
    ),

  body("productUrl")
  .optional({ values: "falsy" })
  .isURL()
  .withMessage(
    "Product URL must be a valid URL"
  ),

body("imageUrl")
  .optional({ values: "falsy" })
  .isURL()
  .withMessage(
    "Image URL must be a valid URL"
  ),

  body("category")
    .optional()
    .trim(),

  body("originalPrice")
    .optional({ nullable: true })
    .isFloat({ gt: 0 })
    .withMessage(
      "Original price must be greater than zero"
    ),

  body("isActive")
    .optional()
    .isBoolean()
    .withMessage(
      "isActive must be true or false"
    ),

  (req, res, next) => {
    const errors = validationResult(req);

    if (errors.isEmpty()) {
      return next();
    }

    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    });
  },
];