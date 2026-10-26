// productCategory.js

/**
 * Brand names that imply a category on their own. A carousel filters by brand
 * alone, so "hp" or "acer" must resolve without a product word alongside them.
 */
/**
 * Keywords short or common enough to appear as a substring of an unrelated
 * word rather than as the word itself -- "tv" inside a longer token, "oven"
 * inside "TechWoven" (Apple's name for its woven-fabric case material).
 * Matched with a word-boundary regex instead of a plain substring check.
 */
// "rog" too: as a substring it made an "MXG PGC-01 Frog Mechanism Gaming Chair" a laptop.
const WORD_BOUNDARY_KEYWORDS = new Set(["tv", "oven", "rog"]);

/**
 * "... for iPhone 17 Pro", "... for Galaxy S25": a product made for a phone, never the phone. Like
 * "for laptop" below, the phrasing marks an accessory. Without it a "Torras Ostand Q3 VegSkin for
 * iPhone 17 Pro Max" scored as a smartphone on "iphone" alone, and a PKR 8,990 UNIQ bundle "for iPhone
 * 17 Pro" was shown as the lowest price of the iPhone 17 Pro (found 2026-10-26; 27 listings).
 */
const FOR_A_PHONE = [
    "for iphone", "for apple iphone", "for samsung", "for galaxy", "for xiaomi", "for redmi", "for poco",
    "for oppo", "for vivo", "for realme", "for infinix", "for tecno", "for pixel", "for google pixel",
    "for oneplus", "for huawei", "for honor", "for nokia", "for motorola", "for nothing phone",
    "for mobile", "for smartphone", "for phone",
];
// The same for tablets: "Apple Magic Keyboard for iPad Pro", "Targus Triad for Samsung Galaxy Tab 3" were filed as tablets.
const FOR_A_TABLET = ["for ipad", "for tablet", "for galaxy tab"];
// A product that names a laptop but is kept out of laptops by an exclusion below ("G-Mart Laptop Back Skin Protector", "Easy
// Shop Foldable Wooden Laptop Table") is an accessory too, rather than "other".
const NAMES_A_LAPTOP = ["laptop", "macbook", "notebook", "chromebook"];

const BRAND_CATEGORY = {
  iphone: "smartphone", apple: "smartphone", samsung: "smartphone",
  xiaomi: "smartphone", redmi: "smartphone", oppo: "smartphone",
  vivo: "smartphone", realme: "smartphone", infinix: "smartphone",
  tecno: "smartphone", nokia: "smartphone", motorola: "smartphone",
  hp: "laptop", dell: "laptop", lenovo: "laptop", acer: "laptop",
  asus: "laptop", msi: "laptop", macbook: "laptop", thinkpad: "laptop",
};
const CATEGORIES = {
    smartphone: {
        keywords: [
            "smartphone",
            "mobile phone",
            "mobile",
            "iphone",
            "galaxy s",
            "galaxy z",
            "galaxy z fold",
            "galaxy z flip",
            "galaxy fold",
            "galaxy flip",
            "galaxy note",
            "galaxy a",
            "galaxy m",
            "pixel",
            "oneplus",
            "xiaomi",
            "redmi",
            "poco",
            "oppo",
            "vivo",
            "realme",
            "huawei",
            "nokia",
            "motorola",
            "rog phone", // Asus: no other smartphone word ("Asus ROG Phone 5")
        ],
        exclude: [
            "case",
            "cover",
            "charger",
            "cable",
            "protector",
            "tempered glass",
            "screen protector",
            "back cover",
            ...FOR_A_PHONE,
        ],
    },

    laptop: {
        keywords: [
            "laptop",
            "notebook",
            "macbook",
            "thinkpad",
            "ideapad",
            "thinkbook",
            "latitude",
            "inspiron",
            "xps",
            "vostro",
            "pavilion",
            "elitebook",
            "probook",
            "envy",
            "vivobook",
            "zenbook",
            "rog",
            "tuf gaming",
            "aspire",
            "nitro",
        ],
        exclude: [
            "bag",
            "backpack",
            "backpack",
            "bacpack",
            "notebooks &",
            "sleeve",
            "case",
            "cover",
            "charger",
            "stand",
            "cooling pad",
            "cooling fan",
            "laptop cooler",
            "laptop battery",
            "laptop cell",
            "cell laptop",
            "keyboard",
            "mouse",
            // Component listings name the component and then the platform,
            // for example "DDR5 16GB Ram For Laptop". Genuine laptop titles
            // state RAM and SSD as specifications, so only the "for laptop"
            // and "laptop <component>" phrasings are excluded here.
            "for laptop",
            "laptop ram",
            "laptop memory",
            "laptop ssd",
            "laptop screen",
            "laptop lcd",
            "laptop adapter",
            "laptop charger",
            "laptop stand",
            "laptop skin",
            "laptop sticker",
            "power adapter",
            "adapter for",
            "charger for",
            "for macbook",
            "for notebook",
            "gan charger",
            "wall charger",
            "so-dimm",
            "sodimm",
            "docking station",
            "hard drive",
            "power supply",
            "tablets holder",
            "notebooks &",
            "laptop desk",
            "ac adapter",
            "tablet holder",
            // Parts and add-ons that name a laptop model ("Dell Latitude DJ1J0 For Battery Connection Cable", PKR 990, was the
            // "dell latitude" search's lowest price; found 2026-10-26). Not a bare "battery": real laptop titles say "Long
            // Battery Life".
            "cell battery",
            "original battery",
            "battery for",
            "cable",
            "protector",
            "laptop table",
            "security alarm",
            "mic for",
            "microphone",
            "multimedia speaker",
            "sound card",
            "book light",
            "webcam",
            // "tuf gaming" and "rog" are laptop keywords, and Asus sells PC parts under the same names.
            "motherboard",
            "cpu cooler",
            "argb fan",
            // More of them that name no part above (31 listings filed as laptops, found 2026-10-26). None of these phrases is in
            // any laptop's title in the database. A headset or monitor then goes to its own category, a ROG Phone to smartphones.
            "rog phone",
            "headset",
            "headphone",
            "monitor",
            "gaming chair",
            "oc edition", // graphics cards ("Asus TUF Gaming Radeon RX9060 XT 16GB GDDR6 OC Edition")
            "graphics card",
            "graphic card",
            "card holder",
            "enclosure",
            "thermal paste",
            "strix scope", // keyboards
            "nvlink",
            "casing",
            "best laptops under",
        ],
    },

    tv: {
        keywords: [
            "smart tv",
            "android tv",
            "google tv",
            "qled",
            "oled tv",
            "mini led",
            "led tv",
            "television",
            // Bare "tv" is matched on its own word (see the special-cased
            // check below), not as a substring. Real listings often
            // separate "Smart" and "TV" with other words ("Smart & 4K
            // Crystal UHD TV"), so the compound phrases above miss them.
            // Without this, those titles fall through to "other", or worse,
            // get claimed by a brand keyword from another category (a
            // Xiaomi TV loses to "xiaomi" in the smartphone list).
            "tv",
        ],
        exclude: [
            "wall mount",
            "tv mount",
            "tv stand",
            "remote",
            "remote control",
            "screen protector",
        ],
    },

    tablet: {
        keywords: [
            "tablet",
            "ipad",
            "galaxy tab",
            "xiaomi pad",
            "redmi pad",
            "lenovo tab",
        ],
        exclude: [
            "tablet case",
            "tablet cover",
            "tablet stand",
            "tablet keyboard",
            "screen protector",
            // "Headset for iPhone/iPod/iPad", "Hub For iPhone IPAD": made for the device, not the device.
            ...FOR_A_PHONE,
            ...FOR_A_TABLET,
            // "UGREEN USB C to DisplayPort 1.4 Cable ... MacBook, iPad": a cable that lists the iPad among what it fits.
            "cable",
        ],
    },

    smartwatch: {
        keywords: [
            "watch",
            "smartwatch",
            "smart watch",
            "apple watch",
            "galaxy watch",
            "pixel watch",
            "xiaomi watch",
            "watch fit",
            "band",
            "fitness tracker",
        ],
        exclude: [
            "watch strap",
            "watch band",
            "watch case",
            "watch charger",
            "screen protector",
        ],
    },

    gaming_console: {
        keywords: [
            "playstation",
            "ps5",
            "ps4",
            "xbox",
            "xbox series",
            "nintendo switch",
            "switch oled",
            "steam deck",
        ],

        exclude: [
            "controller",
            "gamepad",
            "case",
            "cover",
            "skin",
            "charging dock",
        ],
    },

    monitor: {
        // Not "display": hair clippers, chargers and cables "with Digital Display", and laptops listing their display, were all
        // read as monitors (2026-10-22, before monitors became a category of their own on the site).
        keywords: [
            "monitor",
            "gaming monitor",
            "computer monitor",
            "led monitor",
            "lcd monitor",
        ],
        exclude: [
            "monitor stand",
            "monitor arm",
            "monitor mount",
            "screen protector",
            "baby monitor",
            "blood pressure",
            "bp monitor",
            "heart rate",
            "glucose",
            "tyre pressure",
            "tire pressure",
        ],
    },

    headphones: {
        keywords: [
            "headphone",
            "headphones",
            "earphone",
            "earphones",
            "earbuds",
            "earbud",
            "airpods",
            "air buds",
            "buds",
            "galaxy buds",
            "tws",
            "headset",
        ],
        exclude: [
            "headphone case",
            "earphone case",
            "earbuds case",
            "replacement ear pads",
            "ear pads",
        ],
    },

    camera: {
        keywords: [
            "camera",
            "dslr",
            "mirrorless",
            "digital camera",
            "action camera",
            "gopro",
        ],
        exclude: [
            "camera bag",
            "camera case",
            "camera strap",
            "camera tripod",
            "camera battery",
            "camera charger",
            "camera lens",
        ],
    },

    printer: {
        keywords: [
            "printer",
            "laser printer",
            "inkjet printer",
            "multifunction printer",
            "all in one printer",
        ],
        exclude: [
            "printer ink",
            "ink cartridge",
            "toner",
            "printer cable",
        ],
    },

    // Air conditioners, refrigerators and washing machines are categories of their own (2026-10-22, Arsalan's go-ahead): they
    // are compared on tonnage, volume and drum weight (productAttributes.service.js), not lumped in with ovens and vacuums.
    air_conditioner: {
        keywords: [
            "air conditioner",
            "split ac",
            "inverter ac",
            "window ac",
            "portable ac",
            "floor standing ac",
            "dc inverter",
            "ton inverter",
            "ton split",
            "0.75 ton",
            "1 ton",
            "1.0 ton",
            "1.5 ton",
            "2 ton",
            "2.5 ton",
            "4 ton",
        ],
        // Accessories named after the appliance. Not plain "stand": "floor standing" and "free-standing" are the appliance itself.
        exclude: [
            "stabilizer",
            "stabiliser",
            "cover",
            "remote",
            "bracket",
            "ac stand",
            "copper pipe",
            "gas refill",
        ],
    },

    refrigerator: {
        keywords: [
            "refrigerator",
            "fridge",
            "deep freezer",
            "chest freezer",
            "upright freezer",
            "freezer",
        ],
        exclude: [
            "fridge magnet",
            "cover",
            "fridge stand",
            "refrigerator stand",
            "fridge mat",
            "water filter",
            "gasket",
        ],
    },

    washing_machine: {
        keywords: [
            "washing machine",
            "washer dryer",
            "washer & dryer",
            "front load",
            "top load",
            "twin tub",
            "automatic washer",
        ],
        exclude: [
            "cover",
            "washing machine stand",
            "inlet",
            "hose",
            "pressure washer",
            "car washer",
            "dish",
            "bag", // "Top Load Laptop Bag"
            "backpack",
        ],
    },

    appliance: {
        keywords: [
            "microwave",
            "air cooler",
            "air fryer",
            // Matched on its own word below, not as a substring -- "oven"
            // is also the last four letters of "TechWoven", Apple's name
            // for its woven-fabric case material, which was being
            // classified as an appliance for exactly that reason.
            "oven",
            "dishwasher",
            "vacuum cleaner",
        ],
        exclude: [
            "filter",
            "cover",
            "replacement",
            "spare part",
        ],
    },

    accessory: {
        keywords: [
            "bag",
            "backpack",
            "sleeve",
            "case",
            "cover",
            "charger",
            "cable",
            "adapter",
            "power bank",
            "powerbank",
            "screen protector",
            "screen guard",
            "tempered glass",
            "keyboard",
            "mouse",
            "mouse pad",
            "cooling pad",
            "cooling fan",
            "laptop cooler",
            "hub",
            "dock",
            "stand",
            "holder",
            "mount",
            "stylus",
            "tripod",
            "remote",
            "controller",
            "gamepad",
        ],
    },
};

/**
 * Detect the category of a product.
 *
 * @param {string} title
 * @returns {{category: string, confidence: number}}
 */
function detectCategory(title) {
    const text = title.toLowerCase().trim();

    let bestCategory = "other";
    let bestScore = 0;

    for (const [category, config] of Object.entries(CATEGORIES)) {
        let score = 0;

        // Excluded terms strongly indicate that this is
        // an accessory rather than the main product.
        const excluded = (config.exclude || []).some((keyword) =>
            text.includes(keyword)
        );

        if (excluded && category !== "accessory") {
            continue;
        }

        for (const keyword of config.keywords) {
            // Some keywords are short/common enough to turn up as a
            // substring of an unrelated word ("tv" inside a longer token,
            // "oven" inside "TechWoven"), so they're matched on their own
            // word instead. Longer, more specific phrases are safe to
            // substring-match as before.
            const matched = WORD_BOUNDARY_KEYWORDS.has(keyword)
                ? new RegExp(`\\b${keyword}\\b`).test(text)
                : text.includes(keyword);

            if (matched) {
                // Exact product/category identifiers are strong signals.
                if (
                    keyword === "iphone" ||
                    keyword === "ipad" ||
                    keyword === "ps5" ||
                    keyword === "ps4" ||
                    keyword === "xbox" ||
                    keyword === "macbook" ||
                    keyword === "galaxy s" ||
                    keyword === "galaxy a" ||
                    keyword === "galaxy buds" ||
                    keyword === "thinkpad" ||
                    keyword === "latitude" ||
                    keyword === "inspiron" ||
                    keyword === "qled" ||
                    keyword === "oled" ||
                    keyword === "tv"
                ) {
                    score += 6;
                } else if (keyword.length >= 8) {
                    score += 3;
                } else {
                    score += 2;
                }
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestCategory = category;
        }
    }

    // A product made for a phone or tablet that names nothing else we know ("Torras Ostand Q3 VegSkin for iPhone 17 Pro Max",
    // "Smart Folio for iPad Pro") is an accessory. Only as a fallback: one that names its kind ("Headset for iPhone") keeps it.
    if (bestScore === 0 && [...FOR_A_PHONE, ...FOR_A_TABLET, ...NAMES_A_LAPTOP].some((phrase) => text.includes(phrase))) {
        return { category: "accessory", confidence: 1 / 3 };
    }

    const confidence =
        bestScore === 0 ? 0 : Math.min(bestScore / 6, 1);

    return {
        category: bestCategory,
        confidence,
    };
}

/**
 * Brands that sell across several of the categories above (a phone maker
 * that also sells TVs, tablets or watches). Their name is still a useful
 * classification keyword on an actual product title -- a bare "Xiaomi 14T
 * Pro" listing has nothing else to identify it by -- but forcing a single
 * category when the brand name is searched ALONE is wrong: it would hide
 * every Huawei tablet or Xiaomi TV behind a smartphone-only filter. A bare
 * search for one of these should behave like "apple" or "samsung" already
 * do (returns everything the brand makes, unfiltered by category).
 */
const MULTI_CATEGORY_BRANDS = new Set(["xiaomi", "huawei", "samsung", "apple", "lg", "sony", "google"]);

/**
 * Detect the category of a search query.
 */
function detectQueryCategory(query) {
    // A carousel filters by brand alone, so "hp" or "acer" must resolve
    // without a product word alongside them.
    const trimmed = String(query).trim().toLowerCase();

    if (MULTI_CATEGORY_BRANDS.has(trimmed)) {
        return { category: "other", confidence: 0 };
    }

    if (BRAND_CATEGORY[trimmed]) {
        return { category: BRAND_CATEGORY[trimmed], confidence: 1 };
    }
    return detectCategory(query);
}


// const testProducts = [
//     // Laptops
//     "Dell Latitude 5420 Laptop",
//     "HP EliteBook 840 G8",
//     "Lenovo ThinkPad E14",
//     "ASUS VivoBook 15",
//     "MacBook Air M3",

//     // Laptop accessories
//     "HP Laptop Backpack",
//     "Dell Laptop Bag",
//     "Laptop Sleeve 15.6",
//     "Universal Laptop Charger",
//     "Laptop Cooling Pad",

//     // Phones
//     "Samsung Galaxy S25 Ultra",
//     "Samsung Galaxy A56",
//     "iPhone 15 Pro Max",
//     "Google Pixel 9",
//     "Xiaomi Redmi Note 14",

//     // Phone accessories
//     "Samsung S25 Case",
//     "Samsung Galaxy Charger",
//     "iPhone 15 Screen Protector",
//     "USB-C Charging Cable",

//     // TVs
//     "Samsung 55 Inch QLED Smart TV",
//     "LG 65 Inch OLED TV",
//     "TCL 55 Inch Google TV",

//     // TV accessories
//     "Samsung TV Wall Mount",
//     "Universal TV Remote",
//     "TV Stand",

//     // Audio
//     "Samsung Galaxy Buds 3",
//     "Sony WH-1000XM5 Headphones",
//     "AirPods Pro 2",
//     "JBL Wireless Earbuds",

//     // Consoles
//     "PS5 Slim 1TB",
//     "Xbox Series X",
//     "Nintendo Switch OLED",

//     // Console accessories
//     "PS5 DualSense Controller",
//     "PS5 Controller Charging Dock",
// ];

// for (const product of testProducts) {
//     console.log(`${product} =>`, detectCategory(product));
// }

export {
    detectCategory,
    detectQueryCategory,
};