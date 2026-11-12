import fs from "fs";
import path from "path";

function searchDir(dir: string, needle: string) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === "node_modules" || file === ".next" || file === ".git") continue;
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) {
      searchDir(full, needle);
    } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
      const content = fs.readFileSync(full, "utf8");
      if (content.includes(needle)) {
        console.log(`Found in: ${full}`);
      }
    }
  }
}

searchDir("src", "VerificationBanner");
