import { MarkItDown } from "markitdown";
import fs from "fs";

const md = new MarkItDown();

// Load AI evaluation JSON
const data = JSON.parse(fs.readFileSync("output/eval.json", "utf8"));

// Load your report template
const template = fs.readFileSync("templates/report.md", "utf8");

// Render Markdown
const rendered = md.render(template, data);

// Save output
fs.writeFileSync("output/report.md", rendered);

console.log("✓ Markdown report generated → output/report.md");
