import swaggerJsdoc from "swagger-jsdoc";
const swaggerOptions = {
  failOnErrors: true,

  definition: {
    openapi: "3.0.3",

    info: {
      title: "ShopSavvy API",
      version: "1.0.0",
      description:
        "Backend API for comparing product prices, tracking price history, ranking deals, generating recommendations, and viewing analytics.",
    },

    servers: [
      {
        url: "http://localhost:5000",
        description: "Local development server",
      },
    ],

    tags: [
      {
        name: "Health",
        description: "Backend health-check endpoint",
      },
      {
        name: "Listings",
        description: "Product listing operations",
      },
      {
        name: "Price History",
        description: "Listing price-history operations",
      },
      {
        name: "Analytics",
        description: "Listing and platform analytics",
      },
      {
        name: "Price Alerts",
        description: "Email-based price-drop alerts (accountless -- no login, an alert is identified by listing + email)",
      },
    ],

    components: {
      securitySchemes: {
        AdminKey: {
          type: "apiKey",
          in: "header",
          name: "x-admin-key",
          description: "Shared secret from the server's ADMIN_API_KEY. Needed only for manual writes and forced refreshes.",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          description: "The shape of every error. Branch on `code`, not on the message text. For unexpected server errors the message is deliberately generic; the detail is in the server log under the same requestId.",
          properties: {
            success: {
              type: "boolean",
              example: false,
            },
            code: {
              type: "string",
              enum: [
                "BAD_REQUEST", "INVALID_ID", "INVALID_JSON", "VALIDATION_ERROR", "UNAUTHORIZED", "FORBIDDEN",
                "NOT_FOUND", "CONFLICT", "PAYLOAD_TOO_LARGE", "RATE_LIMITED", "DATABASE_UNAVAILABLE",
                "SERVICE_DISABLED", "INTERNAL_ERROR",
              ],
              example: "NOT_FOUND",
            },
            message: {
              type: "string",
              example: "Listing not found",
            },
            requestId: {
              type: "string",
              description: "Also returned in the x-request-id header; quote it when reporting a problem.",
              example: "3f2a9c1e-7b1d-4c55-9a52-2f0d5e6b8a10",
            },
          },
        },

        ValidationErrorResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: false,
            },
            code: {
              type: "string",
              example: "VALIDATION_ERROR",
            },
            requestId: {
              type: "string",
            },
            message: {
              type: "string",
              example: "Validation failed",
            },
            errors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    example: "field",
                  },
                  value: {
                    example: "",
                  },
                  msg: {
                    type: "string",
                    example: "Platform is required",
                  },
                  path: {
                    type: "string",
                    example: "platform",
                  },
                  location: {
                    type: "string",
                    example: "body",
                  },
                },
              },
            },
          },
        },

        ListingInput: {
          type: "object",
          required: ["platform", "title", "price"],
          properties: {
            platform: {
              type: "string",
              example: "PriceOye",
            },
            title: {
              type: "string",
              example: "Samsung Galaxy A55 256GB",
            },
            platformProductId: {
              type: "string",
              example: "samsung-galaxy-a55-256gb",
            },
            price: {
              type: "number",
              minimum: 0.01,
              example: 119999,
            },
            originalPrice: {
              type: "number",
              nullable: true,
              example: 129999,
            },
            currency: {
              type: "string",
              example: "PKR",
            },
            productUrl: {
              type: "string",
              format: "uri",
              example: "https://priceoye.pk",
            },
            imageUrl: {
              type: "string",
              example: "",
            },
            category: {
              type: "string",
              example: "Mobile Phones",
            },
            isActive: {
              type: "boolean",
              example: true,
            },
          },
        },

        Listing: {
          allOf: [
            {
              $ref: "#/components/schemas/ListingInput",
            },
            {
              type: "object",
              properties: {
                _id: {
                  type: "string",
                  example: "6a685b9b8df3d5ea54bf368e",
                },
                normalizedTitle: {
                  type: "string",
                  example: "samsung galaxy a55 256gb",
                },
                rating: {
                  type: "number",
                  nullable: true,
                  minimum: 0,
                  maximum: 5,
                  example: 4.5,
                  description: "Average store rating on a 0-5 scale. null when the store shows none (never 0).",
                },
                reviewCount: {
                  type: "integer",
                  nullable: true,
                  minimum: 0,
                  example: 128,
                  description: "Number of reviews or ratings. null when not shown.",
                },
                specs: {
                  type: "object",
                  nullable: true,
                  additionalProperties: { type: "string" },
                  example: { RAM: "8 GB", Storage: "256 GB" },
                  description: "Specification label/value pairs scraped from the store. null when none.",
                },
                lastScrapedAt: {
                  type: "string",
                  format: "date-time",
                },
                createdAt: {
                  type: "string",
                  format: "date-time",
                },
                updatedAt: {
                  type: "string",
                  format: "date-time",
                },
              },
            },
          ],
        },
      },
    },
  },

  apis: ["./src/routes/*.js"],
};

export const swaggerSpec = swaggerJsdoc(swaggerOptions);