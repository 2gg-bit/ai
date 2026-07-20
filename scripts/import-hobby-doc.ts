import { S3Storage, FetchClient, Config, KnowledgeClient, DataSourceType, KnowledgeDocument, ChunkConfig } from 'coze-coding-dev-sdk';
import * as fs from 'fs';
import * as path from 'path';

const config = new Config();

async function main() {
  // Step 1: 上传docx文件到对象存储
  console.log("Step 1: 上传docx文件到对象存储...");
  const storage = new S3Storage({
    endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
    accessKey: "",
    secretKey: "",
    bucketName: process.env.COZE_BUCKET_NAME,
    region: "cn-beijing",
  });

  const docFilePath = path.join(process.cwd(), "assets", "个人爱好.docx");
  const fileBuffer = fs.readFileSync(docFilePath);
  
  const docKey = await storage.uploadFile({
    fileContent: fileBuffer,
    fileName: "knowledge/个人爱好.docx",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  console.log("docx文件上传成功, key:", docKey);

  // 生成签名URL（用于FetchClient解析）
  const signedUrl = await storage.generatePresignedUrl({
    key: docKey,
    expireTime: 86400, // 24小时
  });
  console.log("签名URL已生成");

  // Step 2: 用FetchClient解析docx文件内容
  console.log("\nStep 2: 解析docx文件内容...");
  const fetchClient = new FetchClient(config);
  const response = await fetchClient.fetch(signedUrl);
  
  console.log("Title:", response.title);
  console.log("Status:", response.status_code);
  console.log("File type:", response.filetype);
  
  let textContent = "";
  const imageDisplayUrls: string[] = [];
  
  for (const item of response.content) {
    if (item.type === 'text') {
      textContent += item.text + "\n";
    } else if (item.type === 'image' && item.image?.display_url) {
      imageDisplayUrls.push(item.image.display_url);
      console.log("发现图片:", item.image.display_url.substring(0, 80) + "...");
    }
  }
  
  console.log("\n提取的文字内容:");
  console.log(textContent);
  console.log("\n发现图片数量:", imageDisplayUrls.length);

  if (imageDisplayUrls.length === 0) {
    console.log("\n⚠️ 未在doc中检测到图片，检查是否有其他方式的图片引用");
  }

  // Step 3: 把图片也上传到对象存储（获取更稳定的URL），然后构造带图片的知识库文档
  console.log("\nStep 3: 上传图片到对象存储并构造知识库文档...");
  
  let knowledgeText = textContent;
  
  for (let i = 0; i < imageDisplayUrls.length; i++) {
    // 用uploadFromUrl把图片转存到对象存储，获得稳定的key
    const imageKey = await storage.uploadFromUrl({
      url: imageDisplayUrls[i],
    });
    
    // 生成签名URL用于知识库展示
    const imageSignedUrl = await storage.generatePresignedUrl({
      key: imageKey,
      expireTime: 2592000, // 30天
    });
    
    // 构造图片Markdown插入到文字中（放到文字末尾）
    const imageAlt = `健身图片${i + 1}`;
    knowledgeText += `\n\n![${imageAlt}](${imageSignedUrl})\n`;
    console.log(`图片${i + 1}已转存，插入到知识库文本中`);
  }

  console.log("\n最终知识库文本:");
  console.log(knowledgeText);

  // Step 4: 导入知识库
  console.log("\nStep 4: 导入知识库...");
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
}

main().catch(console.error);
