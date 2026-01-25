const fs = require("node:fs");
const path = require("node:path");

const distRoot = path.join(__dirname, "..", "dist", "main");
const inputPath = path.join(distRoot, "preload.js");
const outputPath = path.join(distRoot, "preload.cjs");

try {
  if (fs.existsSync(inputPath)) {
    fs.copyFileSync(inputPath, outputPath);
    if (inputPath !== outputPath) {
      fs.unlinkSync(inputPath);
    }
  } else if (!fs.existsSync(outputPath)) {
    process.stderr.write("preload.js not found; ensure build ran.\n");
    process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`Failed to rename preload: ${error.message}\n`);
  process.exitCode = 1;
}
