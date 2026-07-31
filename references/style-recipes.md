# 视觉配方

每篇只选一个主配方。可从 [components.md](components.md) 取同构组件并替换 token；最终仍必须是微信安全的内联 HTML。

## 1. Editorial Warm｜观点与人物

- **适用**：观点长文、人物、成长、文化、情绪有层次的叙事。
- **Token**：ink `#302D29`，body `#57514A`，paper `#FFFDF9`，line `#EAE3D9`，accent `#A85E3B`，soft `#F8EEE7`。
- **组合**：小型栏目眉题 → 温暖 Hero → 连续段落 → 1–2 个引文/旁注 → 简洁收束。
- **避免**：过多编号、仪表盘、霓虹色、夸张渐变。

## 2. Quiet Data｜数据与分析

- **适用**：研究摘要、市场复盘、指标解读、决策比较。
- **Token**：ink `#152238`，body `#42526A`，surface `#F7F9FC`，line `#DCE3ED`，accent `#3D6FB4`，positive `#2E8B70`。
- **组合**：结论卡 → 关键指标 SVG → 分析段 → 对比/时间线 SVG → 方法或来源注。
- **避免**：图表装饰化、没有单位/来源的数据、把相关性画成因果。

## 3. Field Notes｜案例与方法

- **适用**：项目复盘、经验方法论、访谈、学习笔记。
- **Token**：ink `#263238`，body `#4E5D63`，surface `#FBFCFA`，line `#DDE5DF`，accent `#5F7A61`，note `#EDF4EB`。
- **组合**：场景引入 → 观察/证据卡 → 前后对照 → 可复制步骤 → 行动清单。
- **避免**：把所有事实变成“成功学”结论；保留条件、代价和失败信息。

## 4. Minimal Product｜产品、技术与教程

- **适用**：SaaS 更新、AI 工具、安装指南、功能教程。
- **Token**：ink `#111827`，body `#374151`，surface `#FFFFFF`，line `#E5E7EB`，accent `#059669`，soft `#ECFDF5`，warning `#92400E`。
- **组合**：承诺型 Hero → 节标题 → 说明 + 截图/终端卡 → 绿色提示 → 最终检查清单。
- **避免**：全篇满屏绿色、横向导航作为关键信息、在无截图时编造产品画面。

## 5. Signal Brief｜新闻与证据核验

- **适用**：AI 新闻、模型发布、行业快讯、真假消息拆解。
- **Token**：ink `#0F172A`，body `#334155`，surface `#F8FAFC`，line `#E2E8F0`，confirmed `#16805D`，pending `#A16207`，rumor `#64748B`。
- **组合**：结论和证据等级 → 来源图/引用 → 信号卡 → 时间线 → “已知/未知/待验证”收束。
- **避免**：把媒体转述当官方确认；生成图只可作氛围/封面，不可当证据。

## 使用原则

- 技术教程可沿用 `styles/tech-card-green.md`；AI 快讯可沿用 `styles/ai-news-signal-green.md`。它们是上述配方的细化版本。
- 用户指定品牌色时，保留其色彩，但仍限制为一个主强调色和必要语义色。
- 每个配方都应因内容产生不同构图：不要机械复制 Hero、编号、卡片的同一顺序。
