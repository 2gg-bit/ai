import { KnowledgeClient, Config } from 'coze-coding-dev-sdk';

const config = new Config();
const client = new KnowledgeClient(config);

async function main() {
  // 先用一个很可能匹配的查询
  const queries = [
    "我的个人爱好",
    "健身",
    "篮球 健身 骑行",
    "性格优势",
    "坚持 自律",
  ];

  for (const query of queries) {
    console.log(`\n=== 查询: "${query}" ===`);
    const response = await client.search(query, undefined, 5, 0.0);
    
    if (response.code === 0) {
      console.log(`找到 ${response.chunks.length} 条结果`);
      response.chunks.forEach((chunk, i) => {
        console.log(`\n  [${i + 1}] 得分: ${chunk.score.toFixed(4)}`);
        console.log(`  内容预览: ${chunk.content.substring(0, 100)}...`);
        const hasImage = /!\[.*?\]\(https?:\/\//.test(chunk.content);
        console.log(`  包含图片: ${hasImage}`);
      });
    } else {
      console.log(`搜索失败: ${response.msg}`);
    }
  }
}

main().catch(console.error);
