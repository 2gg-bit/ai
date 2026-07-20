# 项目二：轻量级AI编程Agent

## 项目概述
我参考Claude Code类产品的核心工作流，从零实现的一个轻量级、终端优先的AI编程Agent。不依赖LangChain等第三方框架，直接对接Anthropic Messages API，自主实现Agent Loop、工具协议、上下文压缩、权限审批和会话管理等核心模块。

技术栈是TypeScript、Node.js、Anthropic Messages API、MCP Protocol和Ink TUI。

这个项目的目的是深入理解Coding Agent的底层架构设计，是一个可学习、可复现、可工程化的Agent工程实践项目。

## 核心模块一：Agent多步推理循环与容错设计
我实现了基于ReAct范式的Agent主循环，在agent-loop.ts文件中。循环的核心是Thought到Action到Observation的多步推理链路。

容错方面我设计了多级机制：空响应自动重试，上限2次；thinking阶段中断恢复，上限3次，能区分max_tokens和pause_turn两种中断类型；工具执行错误时，错误信息回注上下文让模型自主纠错；还有maxSteps硬终止防止无限循环。每次迭代前根据上下文利用率动态触发压缩策略。

## 核心模块二：声明式工具注册与MCP动态扩展
我构建了自研的ToolRegistry工具注册框架。12个内置工具覆盖文件操作、命令执行、网络访问、用户交互和技能加载，它们通过统一的ToolDefinition接口注册，包含名称、描述、参数Schema和执行函数。工具执行结果统一为ok和output结构，失败信息自动回流上下文。

在此基础上我集成了MCP协议，支持stdio和Streamable HTTP双传输模式，实现协议自动检测与缓存，让Agent能动态接入外部工具服务生态。

## 核心模块三：三层校验与权限审批
我设计了参数校验、权限审批、业务规则三层前置校验链。

权限系统覆盖三个维度：路径权限——cwd外访问需审批；命令权限——自动识别git reset --hard、git push --force、npm publish、任意代码执行等危险命令；编辑权限——文件修改前展示diff预览。

每个维度支持allow_once、allow_always、deny_once、deny_always四种粒度。deny规则始终优先于allow。审批结果按持久化级别分别存储在会话内存、turn级缓存或磁盘配置中。

## 核心模块四：四级递进式上下文压缩
我设计了从低成本到高成本的四级策略。micro-compact零LLM调用，直接清空旧工具结果内容。context-collapse让LLM生成摘要替换历史消息段，采用非破坏性投影，完整transcript始终保留。snip-compact确定性删除中段非关键消息，保护编辑操作和错误上下文附近内容不被误删。auto-compact用LLM全文摘要兜底。

配合混合token记账——provider上报用量加上角色感知字符比率估算tail消息——通过四级告警normal、warning、critical、blocked驱动压缩触发。auto-compact连续失败后自动禁用，避免API资源浪费。

## 核心模块五：会话持久化与状态分层
基于append-only JSONL格式实现会话持久化，在session.ts文件中。通过parentUuid链式结构维护事件顺序，支持会话恢复、分叉和过期清理。

记忆分层策略是：工具执行结果用完即焚，对话消息会话内保留，权限决策和MCP协议缓存跨会话持久化。超大工具输出超过50K字符时自动持久化到磁盘，模型上下文只看到摘要和文件路径引用。

## 为什么不用LangChain？
三个原因。第一,用框架就看不到内部实现。第二,生产可控性。第三是依赖最小化——核心依赖只有Anthropic SDK和Ink，不存在框架版本兼容问题。但我熟悉LangChain，在业务项目中如果目标是快速验证方案，用框架是合理选择。

## 怎么收集项目代码上下文的？
不依赖RAG，靠两类机制。第一是结构化指令文件被动加载——memory.ts从文件系统根目录扫描到cwd，查找MINI.md等指令文件注入system prompt。第二是工具驱动主动探索——Agent用list_files探索目录结构、grep_files定位代码位置、read_file读取具体文件、run_command执行shell命令获取项目信息。这是Agent自主驱动的渐进式代码探索，不是先检索再生成的RAG范式。
