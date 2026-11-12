import fs from "fs";

const content = fs.readFileSync("src/components/jobs/JobDetailsView.tsx", "utf8");
console.log("Has hash check:", content.includes("#propose") || content.includes("location.hash"));

