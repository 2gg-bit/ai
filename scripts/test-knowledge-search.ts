import { KnowledgeClient, Config } from 'coze-coding-dev-sdk';

const config = new Config();
const knowledgeClient = new KnowledgeClient(config);

function detectImageLinks(text: string): string[] {
  const imageRegex = /!\[.*?\]\((https?:\/\/[^)]+)\)/g;
  const matches: string[] = [];
  let match;
  while ((match = imageRegex.exec(text)) !== null) {
    matches.push(match[0]);
  }
  return matches;
}

async function testQuery(query: string) {
  console.log(`\n========== 查询: "${query}" ==========`);
  
  // 模拟后端的搜索逻辑
  const searchResponse = await knowledgeClient.search(query, ["coze_doc_knowledge"], 10, 0.05);
  
  if (searchResponse.code === 0 && searchResponse.chunks.length > 0) {
    const allChunks = [...searchResponse.chunks];
    
    // 检查已有的chunk中是否有提到图片/照片的描述
    const mentionsImage = allChunks.some(chunk => 
      /(图片|照片|健身|篮球|骑行)/.test(chunk.content)
    );
    
    const alreadyHasImage = allChunks.some(chunk => 
      /!\[.*?\]\(https?:\/\/.+?\)/.test(chunk.content)
    );
    
    console.log(`初次搜索到 ${allChunks.length} 条chunk`);
    console.log(`提及图片/健身关键词: ${mentionsImage}`);
    console.log(`已包含图片chunk: ${alreadyHasImage}`);
    
    if (mentionsImage && !alreadyHasImage) {
      console.log("→ 触发图片补充搜索...");
      const imageSearch = await knowledgeClient.search(
        "健身照片图片", 
        ["coze_doc_knowledge"], 
        5, 
        0.0
      );
      if (imageSearch.code === 0 && imageSearch.chunks.length > 0) {
        const imageChunks = imageSearch.chunks.filter(c => 
          /!\[.*?\]\(https?:\/\/.+?\)/.test(c.content)
        );
        console.log(`图片搜索找到 ${imageChunks.length} 条含图片的chunk`);
        for (const imgChunk of imageChunks) {
          if (!allChunks.find(c => c.content === imgChunk.content)) {
            allChunks.push(imgChunk);
          }
        }
      }
    }
    
    // 检测图片链接
    let detectedImages: string[] = [];
    allChunks.forEach(chunk => {
      const images = detectImageLinks(chunk.content);
      detectedImages = detectedImages.concat(images);
    });
    
    console.log(`\n最终 ${allChunks.length} 条chunk，检测到 ${detectedImages.length} 张图片`);
    
    allChunks.forEach((chunk, i) => {
      const hasImg = /!\[.*?\]\(https?:\/\//.test(chunk.content);
      console.log(`  [${i+1}] score=${chunk.score.toFixed(4)} 含图片=${hasImg}  内容: ${chunk.content.substring(0, 60)}`);
    });
    
    if (detectedImages.length > 0) {
      console.log("\n图片链接:");
      detectedImages.forEach((img, i) => console.log(`  [${i+1}] ${img.substring(0, 100)}...`));
    }
  } else {
    console.log("无搜索结果");
  }
}

async function main() {
  await testQuery("在生活中你的爱好是什么");
  await testQuery("讲一下你的健身爱好");
  await testQuery("你都了解哪些agent技术栈");
  await testQuery("讲一下你的agent项目");
}

main().catch(console.error);
