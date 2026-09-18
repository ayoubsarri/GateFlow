import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";

const payloads = [
  "INAS1.inas-quality-2026.bd3a83bdb76727fd5726258fc8baf79fef7d108bf480fd01518d715c33e12ce7",
  "INAS1.inas-quality-2026.603249d314cfc666432cf2ef87273fd11bda5c94f963a619f5bc701154d840d9",
  "INAS1.inas-quality-2026.ebd175a8bc6f539d81300230b2d4de600fe9784902a5d33d4fd4f87a49e75bea",
  "INAS1.inas-quality-2026.256d0a30637d1704dad1a4d16d5926e48b55d6d0d6a103261a9dd6349cbe7715",
  "INAS1.inas-quality-2026.52becc4cf87da7c571021bde9e13948840a1ab732686b4e77f896fc132f46ee4",
  "INAS1.inas-quality-2026.1ee59e82878a50bbd4846a40bbec544f170bbbc54cc1036dc7552da0492d41c4",
  "INAS1.inas-quality-2026.e28fde91b8e22f7943823ec9587b6231f1eed678cbfa5e603f6b65f18ab1c456",
  "INAS1.inas-quality-2026.453a974b8a4fd8d56fa50a57b2495abe5a3bbde94300629276085cb8e8b0d7de",
  "INAS1.inas-quality-2026.3edbf26497dadeb062e58f1bdb1963c772be90347cd94b8d4edb070074f9c74e",
  "INAS1.inas-quality-2026.2dbfb30a306b4277d136313d08a32237864f32690e0dfd41f78214714623e511"
];

const outputDirectory = path.resolve(process.argv[2] || "test-qr");
await fs.mkdir(outputDirectory, { recursive: true });

const embedded = [];
for (const [index, payload] of payloads.entries()) {
  const number = String(index + 1).padStart(2, "0");
  await QRCode.toFile(path.join(outputDirectory, `inas-test-qr-${number}.png`), payload, {
    errorCorrectionLevel: "H",
    margin: 4,
    width: 1000,
    color: { dark: "#073f3e", light: "#ffffff" }
  });
  const svg = await QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 3,
    color: { dark: "#073f3e", light: "#ffffff" }
  });
  embedded.push(Buffer.from(svg).toString("base64"));
}

const cardWidth = 360;
const cardHeight = 410;
const gap = 28;
const columns = 2;
const pageWidth = columns * cardWidth + (columns + 1) * gap;
const pageHeight = 5 * cardHeight + 6 * gap;
const cards = embedded.map((encoded, index) => {
  const column = index % columns;
  const row = Math.floor(index / columns);
  const x = gap + column * (cardWidth + gap);
  const y = gap + row * (cardHeight + gap);
  const number = String(index + 1).padStart(2, "0");
  return `<g><rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="24" fill="#ffffff" stroke="#dce7e3" stroke-width="2"/><image x="${x + 30}" y="${y + 24}" width="300" height="300" href="data:image/svg+xml;base64,${encoded}"/><text x="${x + cardWidth / 2}" y="${y + 365}" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#0c3033">QR ${number}</text></g>`;
}).join("");
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}"><rect width="100%" height="100%" fill="#f4f8f6"/>${cards}</svg>`;
await fs.writeFile(path.join(outputDirectory, "inas-test-qr-sheet.svg"), sheet, "utf8");
await fs.writeFile(path.join(outputDirectory, "payloads.txt"), payloads.map((payload, index) => `QR ${String(index + 1).padStart(2, "0")}: ${payload}`).join("\n") + "\n", "utf8");

console.log(outputDirectory);
