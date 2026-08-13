import { cpSync, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const root = process.cwd();
const src = join(root, "web", "dist");
const dest = join(root, "public");

if (!existsSync(src)) {
  console.error(`Missing ${src}. Run web build first.`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`Copied ${src} → ${dest}`);
