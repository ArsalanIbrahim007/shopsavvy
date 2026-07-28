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
    ],

    components: {
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: false,
            },
            message: {
              type: "string",
              example: "An error occurred",
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