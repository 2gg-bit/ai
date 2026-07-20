import * as mammoth from 'mammoth';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const docxPath = path.join(process.cwd(), "assets", "个人爱好.docx");
  
  console.log("使用mammoth解析docx...");
  
  // 提取纯文本
  const textResult = await mammoth.extractRawText({ path: docxPath });
  console.log("\n=== 纯文本内容 ===");
  console.log(textResult.value);
  if (textResult.messages.length > 0) {
    console.log("\nMessages:", textResult.messages);
  }
  
  // 提取HTML（包含图片信息）
  console.log("\n=== 提取HTML和图片 ===");
  const images: Array<{ contentType: string; buffer: Buffer; filename: string }> = [];
  
  const htmlResult = await mammoth.convertToHtml(
    { path: docxPath },
    {
      convertImage: mammoth.images.imgElement(async (image: any) => {
        const buffer = await image.read();
        const contentType = image.contentType;
        const ext = contentType.split('/')[1] || 'png';
        const filename = `image_${images.length}.${ext}`;
        images.push({ contentType, buffer, filename });
        console.log(`发现图片: ${filename}, 类型: ${contentType}, 大小: ${buffer.length} bytes`);
        return { src: filename };
      })
    }
  );
  
  console.log("\n=== HTML内容 ===");
  console.log(htmlResult.value);
  if (htmlResult.messages.length > 0) {
    console.log("\nMessages:", htmlResult.messages);
  }
  
  console.log("\n共发现图片:", images.length, "张");
  
  // 保存图片到本地以便查看
  const outputDir = path.join(process.cwd(), "assets", "extracted_images");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  for (const img of images) {
    const outputPath = path.join(outputDir, img.filename);
    fs.writeFileSync(outputPath, img.buffer);
    console.log(`图片已保存: ${outputPath}`);
  }
}

main().catch(console.error);
