import { KnowledgeClient, Config, DataSourceType, KnowledgeDocument } from 'coze-coding-dev-sdk';

const config = new Config();
const client = new KnowledgeClient(config, undefined, true); // verbose mode

async function main() {
  // 先尝试用非常简单的内容导入并立即搜索
  console.log("=== 测试1: 导入简单文本 ===");
  const testDocs: KnowledgeDocument[] = [
    {
      source: DataSourceType.TEXT,
      raw_data: "苹果是一种红色的水果，富含维生素C。"
    }
  ];
  
  const addResp = await client.addDocuments(testDocs, "coze_doc_knowledge");
  console.log("导入结果:", JSON.stringify(addResp, null, 2));
  
  // 等待一下
  console.log("\n等待3秒后搜索...");
  await new Promise(r => setTimeout(r, 3000));
  
  console.log("\n=== 测试2: 搜索刚导入的内容 ===");
  const searchResp = await client.search("苹果 水果", ["coze_doc_knowledge"], 5, 0.0);
  console.log("搜索结果:", JSON.stringify(searchResp, null, 2));
}

main().catch(console.error);
