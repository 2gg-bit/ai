/**
 * 本地语义搜索模块
 * 使用 SiliconFlow embedding API 实现知识库语义检索，替代 Coze KnowledgeClient
 */
import OpenAI from "openai";
import { documents } from "./knowledge-base";

// ========== 类型定义 ==========

interface Chunk {
  docId: string;
  docTitle: string;
  content: string;
}

interface CachedChunk extends Chunk {
  embedding: number[];
}

interface SearchResult {
  content: string;
  score: number;
  docId: string;
  docTitle: string;
}

// ========== 配置 ==========

const EMBEDDING_MODEL = "BAAI/bge-m3";
const API_KEY =
  process.env.SILICONFLOW_API_KEY ||
  "sk-fwqaylgnlisgwhuyxnuwuddwsjvmfztlxuctgjriijqzmisv";
const BASE_URL = "https://api.siliconflow.cn/v1";

// 模块级缓存：Vercel serverless 暖启动时保留，冷启动时重建
let cachedChunks: CachedChunk[] | null = null;
let initPromise: Promise<void> | null = null;
let sfClient: OpenAI | null = null;

// ========== 文档切分 ==========

/**
 * 按段落（双换行）切分文档为 chunk，超长段落按单换行二次切分
 * 每个 chunk 控制在约 800 字符以内，适配 embedding 模型的 token 限制
 */
function chunkDocuments(): Chunk[] {
  const chunks: Chunk[] = [];
  const MAX_CHARS = 800;

  for (const doc of documents) {
    const paragraphs = doc.content.split(/\n\n+/).filter((p) => p.trim());

    let buffer = "";
    for (const para of paragraphs) {
      // 如果单个段落就超长，先 flush buffer，再按单换行切分这个段落
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
        if (subBuffer) {
          buffer = subBuffer;
        }
        continue;
      }

      // 正常段落：尝试合并到 buffer
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

// ========== Embedding ==========

function getClient(): OpenAI {
  if (!sfClient) {
    sfClient = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
  }
  return sfClient;
}

/**
 * 批量获取文本 embedding 向量
 * SiliconFlow 的 embedding API 兼容 OpenAI 格式，支持 batch 输入
 */
async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const client = getClient();

  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });

  return response.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

/**
 * 初始化：切分文档 → 计算 embedding → 缓存
 * 首次调用时执行，后续调用复用缓存
 * 通过 initPromise 防止并发初始化
 */
async function ensureInitialized(): Promise<void> {
  if (cachedChunks) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    console.log("[KnowledgeSearch] Initializing: chunking documents...");
    const chunks = chunkDocuments();
    console.log(`[KnowledgeSearch] Created ${chunks.length} chunks from ${documents.length} documents`);

    console.log("[KnowledgeSearch] Computing embeddings...");
    const texts = chunks.map((c) => c.content);

    // 分批请求 embedding（每批最多 10 条，避免单次请求过大）
    const BATCH_SIZE = 10;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const embeddings = await getEmbeddings(batch);
      allEmbeddings.push(...embeddings);
      console.log(`[KnowledgeSearch] Embedded batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} texts`);
    }

    cachedChunks = chunks.map((chunk, i) => ({
      ...chunk,
      embedding: allEmbeddings[i],
    }));

    console.log(`[KnowledgeSearch] Initialized: ${cachedChunks.length} chunks with embeddings`);
  })();

  return initPromise;
}

// ========== 相似度计算 ==========

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ========== 搜索接口 ==========

/**
 * 语义搜索知识库
 * @param query 用户查询文本
 * @param topK 返回结果数量上限
 * @param minScore 最低相似度阈值（0-1）
 * @returns 按相似度降序排列的搜索结果
 */
export async function searchKnowledge(
  query: string,
  topK: number = 5,
  minScore: number = 0.2
): Promise<SearchResult[]> {
  await ensureInitialized();

  if (!cachedChunks || cachedChunks.length === 0) {
    console.warn("[KnowledgeSearch] No cached chunks available");
    return [];
  }

  // 计算查询的 embedding
  const [queryEmbedding] = await getEmbeddings([query]);

  // 计算所有 chunk 的相似度
  const results: SearchResult[] = cachedChunks.map((chunk) => ({
    content: chunk.content,
    docId: chunk.docId,
    docTitle: chunk.docTitle,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  // 按相似度降序排列，过滤低分，取 topK
  return results
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
