import { NextRequest } from "next/server";
import { Config, HeaderUtils, LLMClient } from "coze-coding-dev-sdk";
import { KnowledgeClient } from "coze-coding-dev-sdk";

// 司书晗的人设Prompt - 数字分身系统提示词
const SYSTEM_PROMPT = `# 角色设定
你是"司书晗"的 AI 数字分身，一名正在求职的硕士研究生，目标岗位是 Agent 开发工程师。你的职责是与面试官进行自然、专业的对话，帮助对方了解你的技术能力、项目经验,个人特质和爱好。

# 核心行为准则
1. 你代表的是司书晗本人，用第一人称回答，语气自信但不夸张，像真实面试中的对话一样自然。
2. **严格基于知识库内容回答**：所有关于个人经历、项目、技能的回答必须严格基于下方知识库中的真实内容。你可以对知识库中的句子进行润色、调整语序、合并表述以让回答更通顺流畅，但**绝对不能**编造不存在的项目经验、技术能力或个人信息，也**不能**补充知识库中没有提到的内容。
3. 如果知识库中没有相关信息，坦诚说"我没有往知识库里加入这些信息,可以在面试环节向我提问"。
4. 回答要有技术深度，适当给出具体方案和设计思考，而不是泛泛而谈。提到技术点时能说清楚"为什么选这个方案"和"遇到什么问题怎么解决"——但前提是这些内容在知识库中有依据。

# 回答生成规则（必须严格遵守）
- 你的回答只能是对知识库已有信息的重组、润色和语言优化，**不允许凭空添加任何新的事实、数据、项目名称、技术名词或个人经历**。
- 如果问题的答案在知识库中能找到，用自己的话重新组织语言回答，但语义必须与知识库保持一致，不得扩展或演绎。
- 如果知识库中只有部分相关信息，只回答那部分相关的，不要补全、不要推测、不要延伸。
- 对于知识库没有覆盖的问题，一律用"我没有往知识库里加入这些信息,可以在面试环节向我提问"回应。

# 对话风格
- 回答简洁有力，一般2到4句话为一个段落，技术话题可以展开多讲一些。
- 遇到不会的问题不要硬编，承认不足并展示学习意愿："这个我了解不深，但我在XX方面有类似的经验，原理是相通的。"——注意XX必须是知识库中有提到的内容。
- 语气亲和专业，不用太多感叹号，不过度热情，像一个认真准备面试的候选人。

# 开场白
当面试官进入对话时，主动打招呼：
"您好！我是司书晗的 AI 数字分身。我目前是武汉理工大学计算机技术专业的28届毕业生，主要方向是 Agent 开发和计算机视觉。您可以随意问我关于我的项目经验、技术栈,或者我的爱好"

# 图片展示策略（重要）
当你的回答中检索到包含图片链接（格式如 \`![xxx](https://...)\` ）的知识库内容时，必须遵守以下规则：
1. **绝不直接展示图片**。不要在回复中直接输出图片的 Markdown 语法或链接。
2. **先描述，再询问**。用一句话描述这张照片的内容和背景，然后主动询问面试官是否想查看。例如：
   - "我有一张健身照片，您想看吗？"
3. **获得同意后再展示**。只有当面试官明确回复"想看"、"展示一下"、"好的"等肯定意愿后，你才在下一条回复中输出完整的图片 Markdown 语法：\`![描述](图片链接)\`。
4. **一次最多展示一张**。即使检索到多张图片，每次只询问和展示一张，避免信息过载。
5. **自然过渡**。展示完图片后，自然地接上一句与照片相关的补充说明，语气可以轻松自嘲一点。比如展示健身照片时可以说"哈哈我是不是有点自恋，不过练了这么久还是挺有成就感的"、"别笑我自恋哈，这张是练完状态最好的时候拍的"这类话。"

# 边界
- 不回答与面试和技术无关的私人问题（可以礼貌拒绝："这个问题我不太方便回答，咱们还是聊聊技术吧"）
- 不编造工作经历或技能水平
- 不评价其他公司或其他候选人
- 不涉及薪资谈判等敏感话题`;

// 懒加载客户端（Vercel 环境可能缺少 Coze 平台变量）
let knowledgeClient: InstanceType<typeof KnowledgeClient> | null = null;
let llmClient: InstanceType<typeof LLMClient> | null = null;
try {
  const config = new Config();
  knowledgeClient = new KnowledgeClient(config);
  llmClient = new LLMClient(config);
} catch (e) {
  console.warn("Client init failed (expected on Vercel):", e);
}

// 检测图片链接
function detectImageLinks(text: string): string[] {
  const imageRegex = /!\[.*?\]\((https?:\/\/[^)]+)\)/g;
  const matches: string[] = [];
  let match;
  while ((match = imageRegex.exec(text)) !== null) {
    matches.push(match[0]); // 完整的 Markdown 图片语法
  }
  return matches;
}

export async function POST(request: NextRequest) {
  try {
    const { message, history = [] } = await request.json();

    if (!message || typeof message !== "string") {
      return new Response(
        JSON.stringify({ error: "请提供消息内容" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 提取并转发请求头（Coze 平台专用，Vercel 环境可跳过）
    let customHeaders: Record<string, string> = {};
    try {
      customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    } catch {
      // Not on Coze platform, skip header extraction
    }

    // 搜索知识库
    let knowledgeContext = "";
    let detectedImages: string[] = [];
    
    try {
      if (!knowledgeClient) {
        throw new Error("KnowledgeClient not available");
      }
      const searchResponse = await knowledgeClient.search(message, ["coze_doc_knowledge"], 10, 0.05);
      
      if (searchResponse.code === 0 && searchResponse.chunks.length > 0) {
        // 对搜索结果去重：内容相同或高度相似的chunk只保留得分最高的一个
        const uniqueChunks: typeof searchResponse.chunks = [];
        const seenContents = new Set<string>();
        
        // 按得分从高到低排序，优先保留得分高的
        const sortedChunks = [...searchResponse.chunks].sort((a, b) => b.score - a.score);
        
        for (const chunk of sortedChunks) {
          // 取内容的前80个字符作为去重key（去掉前后空白和markdown符号）
          const normContent = chunk.content.replace(/\s+/g, '').replace(/[#*\-!]/g, '').substring(0, 80);
          if (!seenContents.has(normContent)) {
            seenContents.add(normContent);
            uniqueChunks.push(chunk);
          }
        }
        
        const allChunks = uniqueChunks;
        
        // 检查已有的chunk中是否有提到图片/照片的描述，如果有，额外补充搜索含图片的chunk
        const mentionsImage = allChunks.some(chunk => 
          /(图片|照片|健身|篮球|骑行)/.test(chunk.content)
        );
        
        if (mentionsImage && allChunks.every(chunk => !/\[!\[.*?\]\(https?:\/\/.+?\)/.test(chunk.content))) {
          // 用"健身图片"作为查询词再搜索一次，专门找含图片的chunk
          try {
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
              // 把含图片的chunk追加到列表中
              for (const imgChunk of imageChunks) {
                if (!allChunks.find(c => c.content === imgChunk.content)) {
                  allChunks.push(imgChunk);
                }
              }
            }
          } catch (e) {
            console.error("Image chunk search error:", e);
          }
        }
        // 构建知识库上下文
        const relevantInfo = allChunks
          .map((chunk, index) => `[知识库${index + 1}](相似度:${chunk.score.toFixed(2)}):\n${chunk.content}`)
          .join("\n\n---\n\n");
        
        knowledgeContext = `\n\n# 相关知识库信息（请严格基于这些真实信息回答）\n${relevantInfo}`;
        
        // 检测图片链接并去重（同一主题只保留一张，优先取得分高的）
        const seenImageTopics = new Set<string>();
        allChunks.forEach(chunk => {
          const images = detectImageLinks(chunk.content);
          for (const img of images) {
            // 从alt文本提取主题关键词（健身、篮球等）
            const topicMatch = img.match(/!\[([^\]]*)\]/);
            const topic = topicMatch ? topicMatch[1].replace(/图片|照片/g, '').trim() : img.substring(0, 20);
            if (!seenImageTopics.has(topic)) {
              seenImageTopics.add(topic);
              detectedImages.push(img);
            }
          }
        });
      }
    } catch (error) {
      console.error("Knowledge search error:", error);
      // 知识库搜索失败，继续处理
    }

    // 判断用户是否明确要求查看图片（基于当前消息内容和历史对话）
    const imageRequestKeywords = ["想看", "展示一下", "好的", "看看", "发出来", "给我看", "可以", "行"];
    const lastAssistantMessage = history.length > 0 
      ? [...history].reverse().find((m: { role: string; content: string }) => m.role === "assistant") 
      : null;
    const assistantAskedAboutImage = lastAssistantMessage?.content && 
      (lastAssistantMessage.content.includes("想看吗") || 
       lastAssistantMessage.content.includes("查看") ||
       lastAssistantMessage.content.includes("照片") ||
       lastAssistantMessage.content.includes("图片"));
    const userWantsImage = imageRequestKeywords.some(kw => message.includes(kw)) && assistantAskedAboutImage;

    // 构建系统提示（加入知识库上下文）
    const systemPrompt = knowledgeContext 
      ? `${SYSTEM_PROMPT}${knowledgeContext}`
      : SYSTEM_PROMPT;

    // 构建消息历史
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history.map((msg: { role: string; content: string }) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      { role: "user" as const, content: message },
    ];

    // 创建流式响应
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 使用豆包流式输出
          const llmStream = await llmClient!.chat.completions.create({
            model: "doubao-seed-1-8-251228",
            messages: messages,
            stream: true,
            temperature: 0.7,
          });

          let fullResponse = "";
          
          for await (const chunk of llmStream) {
            const text = chunk.choices[0]?.delta?.content || "";
            if (text) {
              fullResponse += text;
              
              const data = JSON.stringify({ content: text });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          }

          // 如果检测到图片且用户明确要求展示，将图片Markdown作为文本内容追加输出
          if (userWantsImage && detectedImages.length > 0) {
            const imageMarkdown = "\n" + detectedImages[0];
            fullResponse += imageMarkdown;
            const data = JSON.stringify({ content: imageMarkdown });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }

          // 发送结束标记
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: "处理请求时发生错误" })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("API error:", error);
    return new Response(
      JSON.stringify({ error: "服务器内部错误" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}