import fs from "fs";

const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
const lines = schema.split("\n");
lines.forEach((line, i) => {
  if (line.includes("EmailVerificationToken") || line.includes("model ") || line.includes("Token")) {
    if (line.includes("Token") || line.includes("Verification")) {
      console.log(`${i + 1}: ${line}`);
    }
  }
});

