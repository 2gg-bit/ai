/**
 * 本地语义搜索模块
 * 使用预算的 embedding 向量进行知识库语义检索
 * 运行时仅需 1 次 SiliconFlow API 调用（查询向量），搜索本身为纯本地计算
 */
import OpenAI from "openai";
import precomputedChunks from "./knowledge-embeddings.json";

// ========== 类型定义 ==========

interface CachedChunk {
  docId: string;
  docTitle: string;
  content: string;
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

// 模块级状态
const cachedChunks: CachedChunk[] = precomputedChunks as CachedChunk[];
let sfClient: OpenAI | null = null;

// ========== Embedding ==========

function getClient(): OpenAI {
  if (!sfClient) {
    sfClient = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
  }
  return sfClient;
}

async function getQueryEmbedding(query: string): Promise<number[]> {
  const client = getClient();
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: [query],
  });
  return response.data[0].embedding;
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

console.log(`[KnowledgeSearch] Loaded ${cachedChunks.length} pre-computed chunks from knowledge-embeddings.json`);

/**
 * 语义搜索知识库
 * 仅需 1 次 API 调用计算查询向量，其余为纯本地计算（毫秒级）
 *
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
  // 计算查询的 embedding（唯一的网络调用）
  const queryEmbedding = await getQueryEmbedding(query);

  // 本地计算所有 chunk 的相似度（纯 CPU 计算，16 个 chunk 几乎无延迟）
  const results: SearchResult[] = cachedChunks.map((chunk) => ({
    content: chunk.content,
    docId: chunk.docId,
    docTitle: chunk.docTitle,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  return results
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
