// Run once: node generate-icons.mjs
// Generates simple PNG icons for PWA
import { createCanvas } from "canvas";
import { writeFileSync } from "fs";

function makeIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#38bdf8";
  ctx.font = `bold ${size * 0.55}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("💰", size / 2, size / 2);
  return canvas.toBuffer("image/png");
}

writeFileSync("public/icon-192.png", makeIcon(192));
writeFileSync("public/icon-512.png", makeIcon(512));
console.log("Icons generated!");
