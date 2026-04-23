# TinyPA

> 一个能接住你所有碎碎念的口袋助理，帮你把散乱的话整理成明天能落地的三件事。

TinyPA 是一个 PWA 形态的私人助理：

- **聊天式输入** — 打开就像微信，不用分类、不用标签。
- **AI 自动整理** — 后台用 Gemma 4 把每条消息拆成待办 / 笔记 / 心情 / 待跟进。
- **每晚复盘** — 22:00 自动生成当日总结和明日 top 3。
- **次日早报** — 08:00 邮件推送昨日复盘 + 今日待办。

## 技术栈

- Next.js 15 (App Router) + React 19 + TypeScript
- Postgres + Drizzle ORM
- Auth.js v5（邮箱 magic link）
- Gemma 4 via NVIDIA NIM（OpenAI 兼容）
- Resend 发邮件
- Tailwind CSS · PWA (manifest + service worker)

## 快速开始

### 1. 拉依赖

```bash
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env.local
# 然后填好 DATABASE_URL / AUTH_SECRET / RESEND_API_KEY / NVIDIA_API_KEY / CRON_SECRET
```

最低要准备：

- **Postgres**：[Neon 免费档](https://neon.tech/) 或本地 `brew install postgresql` 都可
- **Resend API Key**：[resend.com](https://resend.com) 注册一下，免费 3000 封/月
- **NVIDIA API Key**：[build.nvidia.com](https://build.nvidia.com/google/gemma-4) 拿 Gemma 4 的 key
- `AUTH_SECRET`：`openssl rand -base64 32`
- `CRON_SECRET`：`openssl rand -hex 32`

### 3. 建表

```bash
pnpm db:push   # 把 schema 推到 Postgres
```

### 4. 跑起来

```bash
pnpm dev
```

打开 http://localhost:3000，输入邮箱，点邮件里的链接登录。

## 验证端到端链路

1. 登录后在首页发一条：
   > 明天下午3点开会要准备财报；老婆说晚上吃火锅；最近睡眠不太好。
2. 等 1-2 秒，下方会冒出三张卡：一个 todo，一个 followup，一个 mood。
3. 切到"今日"页，能看到新 todo，可以勾选完成。
4. 触发复盘（带 CRON_SECRET）：
   ```bash
   curl "http://localhost:3000/api/cron/digest?secret=$CRON_SECRET"
   ```
   到"复盘"页看今天的卡片。
5. 触发早报：
   ```bash
   curl "http://localhost:3000/api/cron/morning?secret=$CRON_SECRET"
   ```
   查收邮箱。

## 定时任务部署

`vercel.json` 里配了两个每日 cron（Vercel Hobby 档只支持每日频次）：

- `/api/cron/digest` 在 UTC 14:07（北京时间 22:07）执行，生成当日复盘
- `/api/cron/morning` 在 UTC 00:03（北京时间 08:03）执行，发送次日早报

Vercel 会自动把 `Authorization: Bearer $CRON_SECRET` 加到请求头，代码里一行校验就鉴权好了。

想要"每人自选时间 + 多时区精准投递"需要 Vercel Pro + 把 schedule 改回 `3 * * * *`；或者换 [Upstash QStash](https://upstash.com/docs/qstash) 做外部小时级调度。

完整部署步骤见 **[DEPLOY.md](./DEPLOY.md)**。

## 目录结构

```
app/
  (app)/                 # 已登录区
    page.tsx             # 聊天（默认首页）
    today/               # 今日待办
    review/[date]/       # 每日复盘
    settings/            # 设置
  api/
    messages/            # POST 新消息 → 写表 + LLM 抽取
    items/[id]/          # PATCH/DELETE 待办
    me/                  # PATCH 用户设置
    cron/digest/         # 每日复盘
    cron/morning/        # 次日早报
    auth/[...nextauth]/  # Auth.js
  login/                 # 登录页
lib/
  db/                    # Drizzle schema + client
  llm/                   # Provider 抽象 + Gemma 实现 + prompts
  jobs/                  # extract / digest / morning
  push/email.ts          # Resend
  auth.ts                # Auth.js 配置
  time.ts                # 时区工具
components/              # BottomNav / ChatClient / SwRegister
public/
  manifest.json
  sw.js
```

## 加到手机主屏幕（PWA）

- iOS：Safari 打开 → 分享按钮 → "添加到主屏幕"
- Android：Chrome 右上角菜单 → "安装应用"

## Roadmap

第二期：

- Web Push（VAPID）
- Telegram Bot 双向（同步记录、同步推送）
- 语音输入（MediaRecorder + Whisper）
- `/notes` 全文搜索 + pgvector 语义检索
- 趋势 / 情绪曲线看板
- LLM provider 可切换（Claude / GPT）

## License

参见 [LICENSE](./LICENSE)。
