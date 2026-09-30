import { body, validationResult } from "express-validator";

import { AppError } from "../errors/AppError.js";

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

    return next(AppError.validation(errors.array()));
  },
];

export const validateCreateAlert = [
  body("listingId")
    .trim()
    .notEmpty()
    .withMessage("listingId is required")
    .isMongoId()
    .withMessage("listingId must be a valid id"),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("email is required")
    .isEmail()
    .withMessage("email must be a valid email address")
    .normalizeEmail(),

  body("targetPrice")
    .isFloat({ gt: 0 })
    .withMessage("targetPrice must be greater than zero"),

  (req, res, next) => {
    const errors = validationResult(req);

    if (errors.isEmpty()) {
      return next();
    }

    return next(AppError.validation(errors.array()));
  },
];