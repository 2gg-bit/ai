import { S3Storage, KnowledgeClient, Config, DataSourceType, KnowledgeDocument, ChunkConfig } from 'coze-coding-dev-sdk';
import * as fs from 'fs';
import * as path from 'path';

const config = new Config();

async function main() {
  // Step 1: 上传图片到对象存储
  console.log("Step 1: 上传图片到对象存储...");
  const storage = new S3Storage({
    endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
    accessKey: "",
    secretKey: "",
    bucketName: process.env.COZE_BUCKET_NAME,
    region: "cn-beijing",
  });

  const imagePath = path.join(process.cwd(), "assets", "extracted_images", "image_0.jpeg");
  const imageBuffer = fs.readFileSync(imagePath);
  
  const imageKey = await storage.uploadFile({
    fileContent: imageBuffer,
    fileName: "knowledge/hobby_fitness.jpg",
    contentType: "image/jpeg",
  });
  console.log("图片上传成功, key:", imageKey);

  // 生成签名URL（30天有效期，用于知识库中展示）
  const imageSignedUrl = await storage.generatePresignedUrl({
    key: imageKey,
    expireTime: 2592000, // 30天
  });
  console.log("图片签名URL已生成");

  // Step 2: 构造知识库文本（包含图片Markdown）
  console.log("\nStep 2: 构造知识库文本...");
  const knowledgeText = `# 我的个人爱好与性格特质

## 篮球
我长期保持篮球运动习惯，多次参加校内及社会篮球比赛并夺得过冠军。篮球培养了我的团队协作意识和竞技精神。在团队中我善于沟通和配合，愿意为团队胜利做出个人牺牲。

## 健身
我坚持规律健身训练，这个习惯培养了我的自律性和持续投入的意识。

![健身图片](${imageSignedUrl})

## 骑行
骑行是我读研期间新增的爱好，目前最远单次骑行约150公里。长途骑行考验体能和意志力，我享受挑战自己极限的过程。骑行也教会我合理规划——配速、补给、休息节奏都需要提前安排。

## 如果面试官问：你的性格优势是什么？
愿意去接触新的事物学习新的技术,同时对未来AI的发展充满期望.坚持,无论是在生活中还是在学习中我的过往经历都告诉我长时间的坚持要大于短时间的爆发.`;

  console.log("知识库文本:");
  console.log(knowledgeText);

  // Step 3: 导入知识库
  console.log("\nStep 3: 导入知识库...");
  const knowledgeClient = new KnowledgeClient(config);
  
  const documents: KnowledgeDocument[] = [
    {
      source: DataSourceType.TEXT,
      raw_data: knowledgeText,
    }
  ];

  const chunkConfig: ChunkConfig = {
    separator: "\n\n",
    max_tokens: 2000,
    remove_extra_spaces: false,
    remove_urls_emails: false,
  };

  const addResponse = await knowledgeClient.addDocuments(
    documents,
    "coze_doc_knowledge",
    chunkConfig
  );

  if (addResponse.code === 0) {
    console.log(`✅ 知识库导入成功，文档ID: ${addResponse.doc_ids?.join(', ')}`);
  } else {
    console.error(`❌ 知识库导入失败: ${addResponse.msg}`);
  }

  // Step 4: 验证搜索
  console.log("\nStep 4: 验证搜索...");
  const searchResponse = await knowledgeClient.search("健身 爱好", undefined, 3, 0.3);
  
  if (searchResponse.code === 0) {
    console.log(`找到 ${searchResponse.chunks.length} 条结果:`);
    searchResponse.chunks.forEach((chunk, i) => {
      console.log(`\n结果 ${i + 1} (得分: ${chunk.score.toFixed(4)}):`);
      console.log(chunk.content.substring(0, 200) + "...");
      // 检查是否包含图片链接
      const hasImage = /!\[.*?\]\(https?:\/\//.test(chunk.content);
      console.log(`包含图片: ${hasImage}`);
    });
  } else {
    console.error(`搜索失败: ${searchResponse.msg}`);
  }
}

main().catch(console.error);
