import { MarkItDown } from "markitdown";

const md = new MarkItDown();

const input = process.argv[2];
const output = process.argv[3];

if (!input || !output) {
  console.error("Usage: node scripts/generate-pdf.mjs input.md output.pdf");
  process.exit(1);
}

await md.toPDF(input, output);

console.log(`✓ PDF generated → ${output}`);
