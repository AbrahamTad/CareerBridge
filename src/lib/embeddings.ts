import OpenAI from "openai";
import fs from "fs/promises";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function createEmbeddingFromMarkdown(filePath: string) {
  const markdown = await fs.readFile(filePath, "utf-8");

  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: markdown,
  });

  return {
    content: markdown,
    embedding: response.data[0].embedding,
  };
}
