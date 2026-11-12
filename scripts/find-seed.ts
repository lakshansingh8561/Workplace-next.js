import fs from "fs";

function findSeeds(dir: string): string[] {
  let res: string[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (f === "node_modules" || f === ".next" || f === ".git") continue;
    const full = `${dir}/${f}`;
    if (fs.statSync(full).isDirectory()) {
      res = res.concat(findSeeds(full));
    } else if (f.toLowerCase().includes("seed")) {
      res.push(full);
    }
  }
  return res;
}

console.log(findSeeds("."));

