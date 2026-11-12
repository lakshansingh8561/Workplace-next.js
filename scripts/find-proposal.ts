import fs from "fs";
import path from "path";

function findFiles(dir: string, pattern: RegExp): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file !== "node_modules" && file !== ".next" && file !== ".git") {
        results = results.concat(findFiles(fullPath, pattern));
      }
    } else if (pattern.test(file)) {
      results.push(fullPath);
    }
  }
  return results;
}

console.log(findFiles("src", /proposal/i));

