from markitdown import MarkItDown
from pathlib import Path

md = MarkItDown()

input_dir = Path("input")
output_dir = Path("output/markdown")

output_dir.mkdir(parents=True, exist_ok=True)

for file in input_dir.iterdir():
    if file.is_file():
        result = md.convert(str(file))

        output_file = output_dir / f"{file.stem}.md"

        output_file.write_text(result.text_content, encoding="utf-8")

        print(f"✅ Converted: {file.name} -> {output_file}")
