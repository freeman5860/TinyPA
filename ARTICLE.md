# 一个下午，我用 Gemma 4 搓了个能接住我所有碎碎念的口袋助理

## 从"明天再说"到"再也没做"

你有没有过这种时刻：

走在回家的路上，脑子里忽然冒出一件明天必须处理的事。掏出手机，正准备记下来——微信？备忘录？Things？Notion？——犹豫两秒，红绿灯变了，你跟着人群往前走，那件事就这么散进夜色里。

等到第二天中午想起来的时候，为时已晚。

我自己算过，过去一年大概有三分之一的"重要但不紧急"是这么丢掉的。不是记不住，是**记录这个动作本身有门槛**。要打开对应的 app，要想清楚放哪个分类，要设标签、定截止日——这一整套仪式让人宁愿选择"回家再说"，而"回家"永远是下一个回家。

我想要一个能直接接住这些碎碎念的东西。不用思考，不用整理，说完就算数。剩下的事，让 AI 干。

这就是 **TinyPA** 的起点。一个下午，我把它做出来了。

## 我到底想要什么

在动键盘之前，我花了比动键盘更长的时间想清楚一句话：

> **一个能接住你所有碎碎念的口袋助理，帮你把散乱的话整理成明天能落地的三件事。**

这句话里每个词都有分量：

- **碎碎念** = 不要让用户自己做结构化。"下班记得买猫粮"、"老板说 Q2 要聚焦增长"、"今天有点累"，这些都应该是同一个输入框能消化的东西。
- **口袋** = 手机为主，随时拿得出来。不是另一个桌面 app。
- **明天能落地的三件事** = 核心价值不是"记下来"，是"明天早上我打开手机，知道今天最该做什么"。

有了这个定位，我砍掉了九成功能：语音、图片、IM bot、全文搜索、趋势曲线、朋友分享——全放到第二期。第一期只做一个闭环：

> **碎碎念 → AI 后台拆成结构化条目 → 每晚复盘 → 第二天早晨邮件推送**

## 四类 item，一口气聊清楚

用户随手说的一句话，AI 要识别出四种东西：

| 类型 | 什么意思 | 例子 |
|---|---|---|
| `todo` | 用户自己要做 | 下班买猫粮 |
| `followup` | 别人答应的、或需要别人回应的 | 等财务把报表发过来 |
| `mood` | 当下的状态 | 最近睡得不好 |
| `note` | 想法、观察、灵感 | 今天开会悟到的那个增长飞轮 |

让 Gemma 4 按严格 JSON schema 输出，再用 zod 校验一遍。解析失败就降级保留原文，不要让整条消息丢掉——**AI 可以出错，但用户的话不能丢**，这是底线。

抽取 prompt 里特别写了一段容错：

```
如果用户只是闲聊没有实质内容，返回 {"items":[]}。
```

让模型知道"什么都不抽"也是合法输出，比硬凑几个无意义 item 强。

## 技术选型：七个免费服务拼起来

我的要求是**零成本起步**，顺便能多用户让几个朋友也能玩。最后的拼图是：

- **Next.js 15 App Router** — 前后端一个仓库，部署到 Vercel
- **Postgres on Neon** — 0.5GB 存储，够个人用很久
- **Drizzle ORM** — 类型友好，schema 就是 TS 代码
- **Auth.js v5 + email magic link** — 免密码，注册登录一条链路
- **Resend** — 3000 封免费邮件，够用一年
- **Gemma 4 (google/gemma-4-31b-it) via NVIDIA NIM** — OpenAI 兼容协议，有免费试用额度
- **Vercel Cron** — 每天两次固定时刻跑（Hobby 档只允许每日频次）

全链路跑起来，一分钱不花。

## 核心的那 200 行

### 1. LLM Provider 抽象：不把自己绑死

虽然第一期只接 Gemma 4，但我在 `lib/llm/provider.ts` 里写了个接口：

```ts
export interface LLMProvider {
  extract(input: { text, now, timezone }): Promise<ExtractResult>
  digest(input: DigestInput): Promise<DigestResult>
}
```

将来想换 Claude 或 GPT，实现一个新 class 就行。今天的决策不锁死未来。

### 2. 调 NVIDIA NIM：一行 baseURL 搞定

NIM 的接口完全兼容 OpenAI SDK，只要换个 `baseURL` 就能直接用：

```ts
const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY!,
  baseURL: "https://integrate.api.nvidia.com/v1",
});

const res = await client.chat.completions.create({
  model: "google/gemma-4-31b-it",
  messages: [...],
  max_tokens: 4096,
  temperature: 0.7,
  // NIM 扩展字段：让 Gemma 先"思考"再输出，复盘质量明显更好
  chat_template_kwargs: { enable_thinking: true },
});
```

`enable_thinking` 是 NIM 的扩展字段——抽取类任务关掉更快，复盘类任务打开让模型想清楚再写，效果差很多。

### 3. Vercel Hobby 的 cron 陷阱

我本来想得很美：每小时跑一次 cron，任务内部按每个用户的时区判断是不是他的 22:00，再决定跑不跑。一个 cron 覆盖全世界。

然后 Vercel 把我的部署打回来了：

> *Hobby accounts are limited to daily cron jobs.*

Hobby 档免费版的 cron 每天只能跑一次。多时区精细投递是 Pro 才有的权利。

最后妥协方案：

```json
{
  "crons": [
    { "path": "/api/cron/digest",  "schedule": "7 14 * * *" },
    { "path": "/api/cron/morning", "schedule": "3 0 * * *" }
  ]
}
```

每晚 UTC 14:07（北京 22:07）生成复盘，次日 UTC 00:03（北京 08:03）发早报。所有人同一个时间窗。海外朋友用起来会偏一点，但能跑。

这种 "MVP 先能跑，细节以后再说" 的取舍，做独立项目时要坦然接受。

### 4. 数据模型：一张表顶三个 app

```
users     id, email, timezone
messages  id, user_id, raw_text, processed_at
items     id, user_id, message_id, type, content, due_at, priority, status
digests   id, user_id, date, summary_md, top_todo_ids, morning_sent_at
```

原始输入放 `messages`，AI 提取的结构化产物放 `items`，每日复盘落 `digests`。`morning_sent_at` 这个字段负责防重——早报只能发一次。

## 产品上的小心思

这些是写代码时顺手加的，但我觉得值得说：

**PWA 而不是原生 App**。不用上架、不用审核、不用装——用户在手机 Safari 上点一下"添加到主屏幕"就有一个独立图标。`manifest.json` + 一个简单的 `sw.js` 做离线壳，就够了。

**聊天气泡下挂提取卡片**。用户发完消息，1-2 秒后在消息下方冒出 2-3 张半透明小卡，标着 `todo / mood / followup`。**让"整理"这件事在用户眼前发生**，他看得见 AI 在干活，这个即时反馈很重要。

**早报不是日报**。昨晚的复盘在早上才送达。这两次时间错开的意图是：**晚上的我负责反思，早上的我负责启动**。两种状态不是同一个人，让信息流经过一夜的酝酿再出现。

**不加多少表情、不煽情的复盘语气**。Prompt 里明确写：

```
风格：温和、具体、不煽情、不说教。
```

很多 AI 应用坏就坏在语气太油腻。我宁愿短一点，也不要那种"你今天真棒棒呀"的感觉。

## 部署：20 分钟一条龙

Neon 开库 → Resend 申请 key → NVIDIA 领 Gemma 4 API key → push 到 GitHub → Vercel 一键导入 → 填环境变量 → `pnpm db:push` 把 schema 推上去 → 绑定自定义域（可选）→ 完工。

整个流程我写了一份 `DEPLOY.md` 放仓库里，每一步点哪个按钮都讲清楚。

**Vercel Cron 有个神仙设定**：只要你设了 `CRON_SECRET` 这个环境变量，它就会自动把 `Authorization: Bearer $CRON_SECRET` 加到定时请求的 header 里，我代码里直接对上，零配置鉴权。

## 成本账

跑一个月的账：

- Vercel Hobby：**¥0**
- Neon 0.5GB：**¥0**
- Resend 3000 封/月：**¥0**
- NVIDIA NIM 免费额度：**¥0**（目前每日调用几十次够用）
- 自定义域：**¥55/年**（可选，不要也行）

一个下午的时间 + 一个可选的域名，就有了一个挂在公网、能装进口袋、每晚自动复盘、每早主动推送的私人助理。给朋友发个链接，他们也能注册用。

## 下一步

第一期故意砍掉的东西，会按这个顺序回来：

1. **Web Push**（VAPID + service worker push 事件）— 早报不走邮件直接弹通知
2. **Telegram Bot** — 在 Telegram 里也能记录、也能收推送
3. **语音输入** — `MediaRecorder` + Whisper
4. **pgvector 全文搜索** — `/notes` 里按语义找旧想法
5. **情绪趋势曲线** — 把一个月的 mood 铺成曲线看

但这些都不着急。因为第一期的闭环已经能跑了，它先解决那个**最让我难受的问题**——话说完，就算记下了。

## 写在最后

我越来越相信一件事：

> **AI 应用最大的价值，不是让你做更多，而是让你做一件事的门槛降得足够低。**

TinyPA 的本质不是 AI 在写复盘，而是 AI 把"记录"这个动作的门槛降到了"说话"的级别。其他一切都是副产品。

仓库地址我放下面，代码量不大，结构清晰，欢迎 fork 去改一个自己用的版本。如果你也有过"明天再说最后变成再也没做"的瞬间，也许这个小东西能接得住你的下一条碎碎念。

---

**项目地址**：https://github.com/freeman5860/TinyPA

**技术栈**：Next.js 15 · Drizzle · Auth.js · Gemma 4 (NVIDIA NIM) · Resend · Vercel

**部署成本**：0 元起步

如果这篇文章对你有用，欢迎转发给那些"明天再说"的朋友们。
