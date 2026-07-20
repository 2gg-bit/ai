import { FetchClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

const config = new Config();

// 构造本地文件的可访问URL（通过本地服务的public目录）
// 实际上我们先尝试直接用文件路径方式，doc文件需要通过HTTP URL访问
// 所以我们先把doc文件上传到对象存储，然后用URL访问

async function main() {
  // 使用FetchClient解析doc文件的内容
  const client = new FetchClient(config);
  
  // 读取本地文件并解析
  // doc文件需要通过URL访问，我们先使用本地文件服务器的方式
  // 实际上fetch-url技能支持通过URL解析，我们需要一个可访问的HTTP URL
  // 
  // 先从download URL解析
  const docUrl = "https://code.coze.cn/api/sandbox/coze_coding/file/proxy?expire_time=-1&file_path=assets%2F%E4%B8%AA%E4%BA%BA%E7%88%B1%E5%A5%BD.doc&nonce=4e2bb8e3-c912-487b-a7e0-f22a7efb017e&project_id=7664528510333255714&sign=728223fd862c0cac1be6f0d11abef8899cd9cecd71295c929216b7607cb8f77c";
  
  try {
    const response = await client.fetch(docUrl);
    
    console.log("Title:", response.title);
    console.log("Status:", response.status_code);
    console.log("File type:", response.filetype);
    console.log("\n--- Content items ---");
    
    let textContent = "";
    const images: Array<{ display_url: string; image_url: string; width?: number; height?: number }> = [];
    
    for (const item of response.content) {
      if (item.type === 'text') {
        console.log(`[TEXT] ${item.text}`);
        textContent += item.text + "\n";
      } else if (item.type === 'image') {
        console.log(`[IMAGE] display_url: ${item.image?.display_url}`);
        console.log(`        image_url: ${item.image?.image_url}`);
        console.log(`        size: ${item.image?.width}x${item.image?.height}`);
        if (item.image?.display_url) {
          images.push({
            display_url: item.image.display_url,
            image_url: item.image?.image_url || "",
            width: item.image.width,
            height: item.image.height,
          });
        }
      } else if (item.type === 'link') {
        console.log(`[LINK] ${item.url}`);
      }
    }
    
    console.log("\n--- Full text ---");
    console.log(textContent);
    
    console.log("\n--- Images found:", images.length, "---");
    images.forEach((img, i) => {
      console.log(`Image ${i + 1}: ${img.display_url}`);
    });
    
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
