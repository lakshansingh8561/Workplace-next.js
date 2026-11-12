import fs from "fs";
import path from "path";

function listDir(dir: string): string[] {
  let res: string[] = [];
  if (!fs.existsSync(dir)) return res;
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      res = res.concat(listDir(full));
    } else {
      res.push(full);
    }
  }
  return res;
}

console.log(listDir("public/images"));

