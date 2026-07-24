/**
 * 构建脚本：预计算知识库文档的 embedding 向量
 * 运行后生成 src/lib/knowledge-embeddings.json
 * 运行时直接加载该 JSON，搜索变为纯本地计算（仅查询需要 1 次 API 调用）
 *
 * 用法: npx tsx scripts/build-knowledge.ts
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import { documents } from "../src/lib/knowledge-base";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EMBEDDING_MODEL = "BAAI/bge-m3";
const API_KEY =
  process.env.SILICONFLOW_API_KEY ||
  "sk-fwqaylgnlisgwhuyxnuwuddwsjvmfztlxuctgjriijqzmisv";
const BASE_URL = "https://api.siliconflow.cn/v1";
const MAX_CHARS = 800;

// ========== 文档切分（与 knowledge-search.ts 逻辑一致） ==========

interface Chunk {
  docId: string;
  docTitle: string;
  content: string;
}

function chunkDocuments(): Chunk[] {
  const chunks: Chunk[] = [];

  for (const doc of documents) {
    const paragraphs = doc.content.split(/\n\n+/).filter((p) => p.trim());

    let buffer = "";
    for (const para of paragraphs) {
      if (para.length > MAX_CHARS) {
        if (buffer) {
          chunks.push({ docId: doc.id, docTitle: doc.title, content: buffer.trim() });
          buffer = "";
        }
        const subParagraphs = para.split(/\n/).filter((s) => s.trim());
        let subBuffer = "";
        for (const sub of subParagraphs) {
          if (subBuffer.length + sub.length > MAX_CHARS && subBuffer) {
            chunks.push({ docId: doc.id, docTitle: doc.title, content: subBuffer.trim() });
            subBuffer = "";
          }
          subBuffer += (subBuffer ? "\n" : "") + sub;
        }
        if (subBuffer) buffer = subBuffer;
        continue;
      }

      if (buffer.length + para.length + 2 > MAX_CHARS && buffer) {
        chunks.push({ docId: doc.id, docTitle: doc.title, content: buffer.trim() });
        buffer = "";
      }
      buffer += (buffer ? "\n\n" : "") + para;
    }

    if (buffer) {
      chunks.push({ docId: doc.id, docTitle: doc.title, content: buffer.trim() });
    }
  }

  return chunks;
}

// ========== 主流程 ==========

async function main() {
  console.log("Building knowledge embeddings...\n");

  const client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });

  // Step 1: 切分文档
  const chunks = chunkDocuments();
  console.log(`Created ${chunks.length} chunks from ${documents.length} documents\n`);

  // Step 2: 批量计算 embedding
  const BATCH_SIZE = 10;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => c.content);

    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
    });

    const embeddings = response.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);

    allEmbeddings.push(...embeddings);
    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: embedded ${batch.length} chunks (dim=${embeddings[0]?.length ?? "?"})`);
  }

  // Step 3: 组装结果并写入 JSON
  const result = chunks.map((chunk, i) => ({
    docId: chunk.docId,
    docTitle: chunk.docTitle,
    content: chunk.content,
    embedding: allEmbeddings[i],
  }));

  const outputPath = path.join(__dirname, "..", "src", "lib", "knowledge-embeddings.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result), "utf-8");

  const fileSize = (fs.statSync(outputPath).size / 1024).toFixed(1);
  console.log(`\nDone! ${result.length} chunks with embeddings saved to:`);
  console.log(`  ${outputPath} (${fileSize} KB)`);
}

main().catch((e) => {
  console.error("Build failed:", e);
  process.exit(1);
});
