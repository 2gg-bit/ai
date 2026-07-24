import { NextRequest } from "next/server";
import OpenAI from "openai";
import { searchKnowledge } from "@/lib/knowledge-search";

// 检测图片链接
function detectImageLinks(text: string): string[] {
  const imageRegex = /!\[.*?\]\((https?:\/\/[^)]+)\)/g;
  const matches: string[] = [];
  let match;
  while ((match = imageRegex.exec(text)) !== null) {
    matches.push(match[0]);
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

    // ========== 初始化 LLM 客户端 ==========
    let siliconFlowClient: OpenAI | null = null;
    try {
      siliconFlowClient = new OpenAI({
        apiKey: process.env.SILICONFLOW_API_KEY || "sk-fwqaylgnlisgwhuyxnuwuddwsjvmfztlxuctgjriijqzmisv",
        baseURL: "https://api.siliconflow.cn/v1",
      });
    } catch (e) {
      console.error("SiliconFlow client init failed:", e instanceof Error ? e.message : e);
    }

    // ========== 第一步：搜索知识库（回答的唯一依据） ==========
    let knowledgeContext = "";
    let detectedImages: string[] = [];
    let hasKnowledge = false;

    try {
      const results = await searchKnowledge(message, 5, 0.2);

      console.log(`[KnowledgeSearch] query="${message}", results=${results.length}`);

      if (results.length > 0) {
        hasKnowledge = true;

        // 对搜索结果去重
        const seenContents = new Set<string>();
        const uniqueResults = results.filter((r) => {
          const norm = r.content.replace(/\s+/g, "").replace(/[#*\-!]/g, "").substring(0, 80);
          if (seenContents.has(norm)) return false;
          seenContents.add(norm);
          return true;
        });

        // 构建知识库上下文
        knowledgeContext = uniqueResults
          .map((r, i) => `[知识片段${i + 1}](相似度:${r.score.toFixed(2)}，来源:${r.docTitle}):\n${r.content}`)
          .join("\n\n---\n\n");

        // 检测图片链接并去重
        const seenImageTopics = new Set<string>();
        uniqueResults.forEach((r) => {
          const images = detectImageLinks(r.content);
          for (const img of images) {
            const topicMatch = img.match(/!\[([^\]]*)\]/);
            const topic = topicMatch ? topicMatch[1].replace(/图片|照片/g, "").trim() : img.substring(0, 20);
            if (!seenImageTopics.has(topic)) {
              seenImageTopics.add(topic);
              detectedImages.push(img);
            }
          }
        });

        console.log(`[KnowledgeSearch] hasKnowledge=true, chunks=${uniqueResults.length}`);
      } else {
        console.log("[KnowledgeSearch] hasKnowledge=false, will use fallback prompt");
      }
    } catch (error) {
      console.error("Knowledge search error:", error instanceof Error ? error.message : error);
      console.log("[KnowledgeSearch] hasKnowledge=false, will use fallback prompt");
    }

    // ========== 第二步：判断用户是否要求展示图片 ==========
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

    // ========== 第三步：构建系统提示 ==========
    let systemPrompt: string;

    if (hasKnowledge) {
      systemPrompt = `# 你的身份与回答规则

你是"司书晗"的 AI 数字分身，一名正在求职的硕士研究生，目标岗位是 Agent 开发工程师。

## 最重要的规则：回答的唯一依据

**你只能使用下方"知识库内容"中的信息来回答问题。** 你的所有回答都必须严格基于下列知识库内容。

## 知识库内容（回答的唯一来源）

${knowledgeContext}

## 强制规则（必须严格遵守）

1. **只回答知识库中有的内容**：仔细阅读上面的知识库内容，找到与用户问题相关的信息，用自己的话重新组织语言回答。
2. **禁止编造**：如果知识库中没有与用户问题相关的信息，用自然、多样的方式说明，并引导用户问你已录入的内容（如项目经验、技术栈、研究方向等）。不要机械重复同一句话，每次表达要有变化。——**绝对不要**用自己的知识补充任何内容。
3. **禁止使用预训练知识**：即使你本身知道这个问题的答案，只要知识库中没有，就不能说。
4. **禁止扩展和演绎**：只能对知识库中的内容进行润色、调整语序、合并表述，不能添加任何新的事实、数据、项目名称、技术名词或个人经历。
5. **部分相关时只回答相关部分**：如果知识库中只有部分相关信息，只回答那部分相关的，不要补全、推测、延伸。

## 对话风格
- 用第一人称"我"回答，语气自信自然
- 回答简洁有力，一般2到4句话
- 技术话题可以适当展开，但**必须基于知识库内容**

## 图片展示策略
- 不要直接展示图片，先问用户是否想看
- 用户同意后再输出图片 Markdown 语法
- 一次最多展示一张

## 边界
- 不回答与面试和技术无关的私人问题
- 不编造工作经历或技能水平
- 不评价其他公司或其他候选人
- 不涉及薪资谈判等敏感话题

## 开场白（仅当对话开始时使用）
"您好！我是司书晗的 AI 数字分身。我目前是武汉理工大学计算机技术专业的28届毕业生，主要方向是 Agent 开发和计算机视觉。您可以随意问我关于我的项目经验、技术栈，或者我的爱好"`;
    } else {
      systemPrompt = `# 你是一个"知识受限"的 AI 数字分身

你是"司书晗"的 AI 数字分身，一名正在求职的硕士研究生，目标岗位是 Agent 开发工程师。

## 当前情况

本次用户的提问，知识库中没有找到直接相关的信息。

## 回答规则

1. **坦诚告知**：用自然、多样的方式告诉用户你目前没有这方面的信息，不要重复同一句话。
2. **引导方向**：主动告诉用户可以问你哪些方面，比如项目经验、技术栈、研究方向、个人爱好等。
3. **禁止编造**：不要用自己的预训练知识去编造项目经验、技术能力或个人信息。
4. **语气自然**：像一个真实的求职者一样对话，不要机械重复。

## 示例回答风格

- "这个问题我还没有整理到知识库里，不过你可以问问我关于XX方面的经历。"
- "哈哈这个我还真没准备，我目前主要准备了技术项目和科研方向的内容，要问问看吗？"
- "这块信息我还没录入，但我的项目经验和技能栈都有详细记录，感兴趣的话可以聊聊。"

## 对话风格
- 用第一人称"我"回答，语气轻松自信
- 每次回答要有变化，不要重复同样的话

## 开场白（仅当对话开始时使用）
"您好！我是司书晗的 AI 数字分身。我目前是武汉理工大学计算机技术专业的28届毕业生，主要方向是 Agent 开发和计算机视觉。您可以随意问我关于我的项目经验、技术栈，或者我的爱好"`;
    }

    // ========== 第四步：构建消息历史并发起流式调用 ==========
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...history.map((msg: { role: string; content: string }) => ({
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
      })),
      { role: "user", content: message },
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (!siliconFlowClient) {
            throw new Error("LLM client not available");
          }

          const llmStream = await siliconFlowClient.chat.completions.create({
            model: process.env.SILICONFLOW_MODEL || "Qwen/Qwen2.5-72B-Instruct",
            messages: messages,
            temperature: 0.3,
            stream: true,
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

          if (userWantsImage && detectedImages.length > 0) {
            const imageMarkdown = "\n" + detectedImages[0];
            fullResponse += imageMarkdown;
            const data = JSON.stringify({ content: imageMarkdown });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }

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
