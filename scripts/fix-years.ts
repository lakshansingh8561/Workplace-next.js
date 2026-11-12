import fs from "fs";

let content = fs.readFileSync("scripts/seed-dev.ts", "utf8");
content = content.replace(/startYear:\s*(\d{4})/g, 'startYear: "$1"');
content = content.replace(/endYear:\s*(\d{4})/g, 'endYear: "$1"');
fs.writeFileSync("scripts/seed-dev.ts", content);
console.log("Updated all startYear and endYear to strings.");

