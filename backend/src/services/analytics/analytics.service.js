import Listing from "../../models/listing.model.js";
import PriceHistory from "../../models/priceHistory.model.js";

const roundNumber = (value, decimals = 2) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Number(numericValue.toFixed(decimals));
};

const calculatePercentage = (value, total) => {
  const numericValue = Number(value);
  const numericTotal = Number(total);

  if (
    !Number.isFinite(numericValue) ||
    !Number.isFinite(numericTotal) ||
    numericTotal <= 0
  ) {
    return 0;
  }

  return roundNumber(
    (numericValue / numericTotal) * 100
  );
};

export async function getAnalyticsOverview() {
  const [
    totalListings,
    activeListings,
    inactiveListings,
    platformStats,
    categoryStats,
    priceStats,
    discountStats,
    historyCount,
  ] = await Promise.all([
    Listing.countDocuments(),

    Listing.countDocuments({
      isActive: true,
    }),

    Listing.countDocuments({
      isActive: false,
    }),

    Listing.aggregate([
      {
        $group: {
          _id: "$platform",
          listingCount: {
            $sum: 1,
          },
          averagePrice: {
            $avg: "$price",
          },
          lowestPrice: {
            $min: "$price",
          },
          highestPrice: {
            $max: "$price",
          },
          activeListings: {
            $sum: {
              $cond: [
                {
                  $eq: ["$isActive", true],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $sort: {
          listingCount: -1,
        },
      },
    ]),

    Listing.aggregate([
      {
        $group: {
          _id: "$category",
          listingCount: {
            $sum: 1,
          },
          averagePrice: {
            $avg: "$price",
          },
          lowestPrice: {
            $min: "$price",
          },
          highestPrice: {
            $max: "$price",
          },
        },
      },
      {
        $sort: {
          listingCount: -1,
        },
      },
    ]),

    Listing.aggregate([
      {
        $match: {
          price: {
            $gt: 0,
          },
        },
      },
      {
        $group: {
          _id: null,
          averagePrice: {
            $avg: "$price",
          },
          lowestPrice: {
            $min: "$price",
          },
          highestPrice: {
            $max: "$price",
          },
          totalPriceValue: {
            $sum: "$price",
          },
        },
      },
    ]),

    Listing.aggregate([
      {
        $group: {
          _id: null,

          listingsWithDiscount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $ne: [
                        "$originalPrice",
                        null,
                      ],
                    },
                    {
                      $gt: [
                        "$originalPrice",
                        "$price",
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },

          totalEstimatedSavings: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $ne: [
                        "$originalPrice",
                        null,
                      ],
                    },
                    {
                      $gt: [
                        "$originalPrice",
                        "$price",
                      ],
                    },
                  ],
                },
                {
                  $subtract: [
                    "$originalPrice",
                    "$price",
                  ],
                },
                0,
              ],
            },
          },

          averageDiscountPercent: {
            $avg: {
              $cond: [
                {
                  $and: [
                    {
                      $ne: [
                        "$originalPrice",
                        null,
                      ],
                    },
                    {
                      $gt: [
                        "$originalPrice",
                        "$price",
                      ],
                    },
                  ],
                },
                {
                  $multiply: [
                    {
                      $divide: [
                        {
                          $subtract: [
                            "$originalPrice",
                            "$price",
                          ],
                        },
                        "$originalPrice",
                      ],
                    },
                    100,
                  ],
                },
                null,
              ],
            },
          },
        },
      },
    ]),

    PriceHistory.countDocuments(),
  ]);

  const priceSummary =
    priceStats.length > 0
      ? priceStats[0]
      : {
          averagePrice: 0,
          lowestPrice: 0,
          highestPrice: 0,
          totalPriceValue: 0,
        };

  const discountSummary =
    discountStats.length > 0
      ? discountStats[0]
      : {
          listingsWithDiscount: 0,
          totalEstimatedSavings: 0,
          averageDiscountPercent: 0,
        };

  return {
    listings: {
      total: totalListings,
      active: activeListings,
      inactive: inactiveListings,
      activePercentage:
        calculatePercentage(
          activeListings,
          totalListings
        ),
    },

    prices: {
      averagePrice: roundNumber(
        priceSummary.averagePrice
      ),
      lowestPrice: roundNumber(
        priceSummary.lowestPrice
      ),
      highestPrice: roundNumber(
        priceSummary.highestPrice
      ),
      totalListingValue: roundNumber(
        priceSummary.totalPriceValue
      ),
      currency: "PKR",
    },

    discounts: {
      listingsWithDiscount:
        discountSummary.listingsWithDiscount ||
        0,

      discountListingPercentage:
        calculatePercentage(
          discountSummary.listingsWithDiscount,
          totalListings
        ),

      averageDiscountPercent:
        roundNumber(
          discountSummary.averageDiscountPercent
        ),

      totalEstimatedSavings:
        roundNumber(
          discountSummary.totalEstimatedSavings
        ),

      currency: "PKR",
    },

    priceHistory: {
      totalSnapshots: historyCount,
      averageSnapshotsPerListing:
        totalListings > 0
          ? roundNumber(
              historyCount / totalListings
            )
          : 0,
    },

    platforms: platformStats.map(
      (platform) => ({
        platform:
          platform._id || "Unknown",

        listingCount:
          platform.listingCount,

        activeListings:
          platform.activeListings,

        listingPercentage:
          calculatePercentage(
            platform.listingCount,
            totalListings
          ),

        averagePrice:
          roundNumber(
            platform.averagePrice
          ),

        lowestPrice:
          roundNumber(
            platform.lowestPrice
          ),

        highestPrice:
          roundNumber(
            platform.highestPrice
          ),

        currency: "PKR",
      })
    ),

    categories: categoryStats.map(
      (category) => ({
        category:
          category._id || "Uncategorized",

        listingCount:
          category.listingCount,

        listingPercentage:
          calculatePercentage(
            category.listingCount,
            totalListings
          ),

        averagePrice:
          roundNumber(
            category.averagePrice
          ),

        lowestPrice:
          roundNumber(
            category.lowestPrice
          ),

        highestPrice:
          roundNumber(
            category.highestPrice
          ),

        currency: "PKR",
      })
    ),
  };
}

export async function getPlatformAnalytics() {
  const totalListings =
    await Listing.countDocuments();

  const platforms = await Listing.aggregate([
    {
      $group: {
        _id: "$platform",

        totalListings: {
          $sum: 1,
        },

        activeListings: {
          $sum: {
            $cond: [
              {
                $eq: ["$isActive", true],
              },
              1,
              0,
            ],
          },
        },

        inactiveListings: {
          $sum: {
            $cond: [
              {
                $eq: ["$isActive", false],
              },
              1,
              0,
            ],
          },
        },

        averagePrice: {
          $avg: "$price",
        },

        lowestPrice: {
          $min: "$price",
        },

        highestPrice: {
          $max: "$price",
        },

        totalValue: {
          $sum: "$price",
        },

        listingsWithDiscount: {
          $sum: {
            $cond: [
              {
                $and: [
                  {
                    $ne: [
                      "$originalPrice",
                      null,
                    ],
                  },
                  {
                    $gt: [
                      "$originalPrice",
                      "$price",
                    ],
                  },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
    {
      $sort: {
        totalListings: -1,
      },
    },
  ]);

  return platforms.map((platform) => ({
    platform:
      platform._id || "Unknown",

    totalListings:
      platform.totalListings,

    activeListings:
      platform.activeListings,

    inactiveListings:
      platform.inactiveListings,

    shareOfListings:
      calculatePercentage(
        platform.totalListings,
        totalListings
      ),

    listingsWithDiscount:
      platform.listingsWithDiscount,

    discountPercentage:
      calculatePercentage(
        platform.listingsWithDiscount,
        platform.totalListings
      ),

    averagePrice:
      roundNumber(
        platform.averagePrice
      ),

    lowestPrice:
      roundNumber(
        platform.lowestPrice
      ),

    highestPrice:
      roundNumber(
        platform.highestPrice
      ),

    totalValue:
      roundNumber(
        platform.totalValue
      ),

    currency: "PKR",
  }));
}

export async function getPriceTrendAnalytics({
  days = 30,
  platform,
  listingId,
} = {}) {
  const numericDays = Math.min(
    Math.max(Number(days) || 30, 1),
    365
  );

  const startDate = new Date();

  startDate.setDate(
    startDate.getDate() - numericDays
  );

  const matchStage = {
    recordedAt: {
      $gte: startDate,
    },
  };

  if (platform) {
    matchStage.platform = {
      $regex: `^${platform}$`,
      $options: "i",
    };
  }

  if (listingId) {
    matchStage.listing =
      new (
        await import("mongoose")
      ).default.Types.ObjectId(listingId);
  }

  const trends = await PriceHistory.aggregate([
    {
      $match: matchStage,
    },

    {
      $group: {
        _id: {
          year: {
            $year: "$recordedAt",
          },
          month: {
            $month: "$recordedAt",
          },
          day: {
            $dayOfMonth: "$recordedAt",
          },
        },

        averagePrice: {
          $avg: "$price",
        },

        lowestPrice: {
          $min: "$price",
        },

        highestPrice: {
          $max: "$price",
        },

        snapshotCount: {
          $sum: 1,
        },
      },
    },

    {
      $sort: {
        "_id.year": 1,
        "_id.month": 1,
        "_id.day": 1,
      },
    },
  ]);

  return {
    period: {
      days: numericDays,
      startDate,
      endDate: new Date(),
    },

    filters: {
      platform: platform || null,
      listingId: listingId || null,
    },

    data: trends.map((trend) => ({
      date: new Date(
        Date.UTC(
          trend._id.year,
          trend._id.month - 1,
          trend._id.day
        )
      )
        .toISOString()
        .split("T")[0],

      averagePrice:
        roundNumber(
          trend.averagePrice
        ),

      lowestPrice:
        roundNumber(
          trend.lowestPrice
        ),

      highestPrice:
        roundNumber(
          trend.highestPrice
        ),

      snapshotCount:
        trend.snapshotCount,

      currency: "PKR",
    })),
  };
}