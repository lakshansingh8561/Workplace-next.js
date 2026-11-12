import fs from "fs";
import path from "path";

console.log(fs.readdirSync(path.join(process.cwd(), "src/lib/actions")));

