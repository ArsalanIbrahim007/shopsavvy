// test-categories.js — checks category classification against known cases
import { detectCategory } from "./src/scrapers/productCategory.js";

const CASES = [
  ["HP Victus 15-FA2787NR Core i7-13620H Gaming Laptop", "laptop"],
  ["Dell Vostro 15 3530 Laptop Core i7-1355U (8GB, 512GB SSD)", "laptop"],
  ["Lenovo IdeaPad Slim 3 15.6 inch Core i5 512GB SSD", "laptop"],
  ["MacBook Air M3 13 inch 256GB SSD 8GB RAM", "laptop"],
  ["ASUS VivoBook 15 X1504 Core i3 8GB RAM 512GB SSD", "laptop"],
  ["Lexar DDR5 8GB 5600Mhz Ram For Laptop", "!laptop"],
  ["Transcend JetRam 16GB 4800MHz DDR5 Laptop Ram", "!laptop"],
  ["Dell Latitude E6440 Laptop Battery", "!laptop"],
  ["Swissewin Laptop Backpack", "!laptop"],
  ["Targus Geo 15.6 Mojave Laptop Backpack", "!laptop"],
  ["Awei X30 Desktop Folding Laptops & Tablets Holder", "!laptop"],
  ["Apple iPhone 15 128GB PTA Approved", "smartphone"],
  ["Apple iPhone 15 Silicone Case", "!smartphone"],
  ["Samsung 55 Inch QLED Smart TV", "tv"],
];

let pass = 0;

CASES.forEach(([title, expected]) => {
  const { category } = detectCategory(title);
  const negate = expected.startsWith("!");
  const target = negate ? expected.slice(1) : expected;
  const ok = negate ? category !== target : category === target;
  if (ok) pass++;

  console.log(
    `${ok ? "PASS" : "FAIL"}  ${String(category).padEnd(11)} ${title.slice(0, 52)}`
  );
});

console.log(`\n${pass}/${CASES.length} passed`);