# 部署到 Vercel

这份指引把 TinyPA 从 0 部署到一个能扫码装进口袋的 PWA，一次性带上 pgvector 语义搜索。全流程零成本，大约 20 分钟。

流程概览：

0. [拿到外部服务 Key](#0-准备外部-key)
1. [代码推到 GitHub](#1-确认代码在-github-上)
2. [Vercel 导入项目](#2-vercel-导入项目先不管-db)
3. [从 Vercel Storage 建 Neon DB](#3-从-vercel-创建-neon-db)
4. [开 pgvector 扩展](#4-开-pgvector-扩展neon-sql-editor)
5. [本地 `pnpm db:push`](#5-本地拉环境变量--推-schema)
6. [建 HNSW 索引](#6-建-hnsw-索引回-neon-sql-editor)
7. [回填 AUTH_URL + Redeploy](#7-回填-auth_url--redeploy)
8. [端到端验证](#8-端到端验证按顺序打勾)
9. [常见卡点](#9-常见卡点速查)
10. [以后迭代](#10-以后只改代码的迭代)

> **为什么不能直接在 neon.tech 建 project？** 通过 Vercel 集成创建的 Neon 账号，Neon Dashboard 的 `Create project` 是灰的，提示 *"To create a new project, use the Neon Postgres integration in Vercel"*。所以建 DB 必须从 Vercel Storage tab 进，集成会自动把 `DATABASE_URL` 注入 Vercel 环境变量。

---

## 0. 准备外部 Key

### 0.1 Resend（登录邮件）

1. <https://resend.com> 注册 → 左侧 **API Keys** → **Create API Key**，权限选 *Sending access*
2. 复制 `re_xxx`，这是 `RESEND_API_KEY`
3. 发件地址两个选项：
   - **最快**：用沙盒 `onboarding@resend.dev`，只能发到注册 Resend 的那个邮箱（验证自己够用）
   - **正式**：**Domains** → **Add Domain**，加 3 条 DNS 记录（DKIM + SPF + MX），`MAIL_FROM` 填 `TinyPA <no-reply@your-domain>`

### 0.2 LLM Provider（必需）

TinyPA 的 extract / digest 可以跑在任何 OpenAI 兼容的 API 上，或者跑在 Anthropic Claude 上。**embedding 固定用 NVIDIA**（1024 维，换别的要重跑 backfill 且改 schema 维度），所以 `NVIDIA_API_KEY` 永远要有。

挑一套用：

#### 方案 A：NVIDIA NIM 跑 Llama 3.3 70B（默认，零成本起步）

1. <https://build.nvidia.com> → 登录 → 右上 **Get API Key**
2. 复制 `nvapi-xxx`，一个 key 同时覆盖 chat 和 embedding
3. 对应 env：
   ```
   NVIDIA_API_KEY=nvapi-xxx
   # LLM_PROVIDER 默认 openai-compat，不用写
   # LLM_BASE_URL 默认 https://integrate.api.nvidia.com/v1，不用写
   # LLM_EXTRACT_MODEL / LLM_DIGEST_MODEL 默认 meta/llama-3.3-70b-instruct，不用写
   ```

> 新账号有免费额度，对个人项目够用；超出按 token 计费。

#### 方案 B：Anthropic Claude（想用原生 Claude、上限更高的路线）

1. <https://console.anthropic.com> → **API Keys** → **Create Key**
2. 复制 `sk-ant-xxx`
3. 对应 env：
   ```
   LLM_PROVIDER=anthropic
   ANTHROPIC_API_KEY=sk-ant-xxx
   # LLM_EXTRACT_MODEL / LLM_DIGEST_MODEL 默认 claude-haiku-4-5，不用写
   # 想用更好的模型：LLM_DIGEST_MODEL=claude-sonnet-4-6
   NVIDIA_API_KEY=nvapi-xxx   # 仍然要留，embedding 用
   ```

> Anthropic provider 自动对 system prompt 打 prompt cache，5 分钟内重复调用 input tokens 便宜 ~10 倍。

#### 方案 C：别的 OpenAI 兼容 API（OpenAI / OpenRouter / Together / Groq / SiliconFlow 等）

换 baseURL + key + model 三条 env：

```
LLM_PROVIDER=openai-compat          # 或者不填，默认就是这个
LLM_API_KEY=sk-xxx                  # 任何 OpenAI 兼容 key
LLM_BASE_URL=https://api.openai.com/v1   # 换对应服务商的 URL
LLM_EXTRACT_MODEL=gpt-4o-mini
LLM_DIGEST_MODEL=gpt-4o-mini
NVIDIA_API_KEY=nvapi-xxx             # embedding 仍然用
```

### 0.3 本地生成两串随机密钥

```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -hex 32      # CRON_SECRET
```

两个都记下来，等下贴 Vercel。

### 0.4 生成 VAPID 密钥（浏览器推送）

Web Push 要一对公私钥。公钥前端订阅时用，私钥后端签名。本地项目里已经装了 `web-push`，直接跑：

```bash
node -e "const wp = require('web-push'); console.log(JSON.stringify(wp.generateVAPIDKeys()))"
```

输出形如：
```json
{"publicKey":"BB...","privateKey":"VF..."}
```

对应三条 env：
- `VAPID_PUBLIC_KEY` = `publicKey`
- `VAPID_PRIVATE_KEY` = `privateKey`
- `VAPID_SUBJECT` = `mailto:你的邮箱@example.com`（推送协议要一个联系方式）

还要加一条 **公开**变量（前端订阅时用）：
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = 同一个 `publicKey`

> **不想开浏览器推送**就跳过这一步。morning cron 会自动降级到纯邮件。

### 0.5 建 Telegram Bot（可选）

想在 TG 里记录 + 收早报的话：

1. TG 里搜 `@BotFather` → `/newbot` → 给 bot 起名和 username（`xxx_bot` 结尾）
2. 完成后 BotFather 会发一串 `123456:ABC-DEF...` —— 这是 `TELEGRAM_BOT_TOKEN`
3. 顺便设 bot 命令（让 TG 里显示菜单）：向 BotFather 发 `/setcommands` → 选你的 bot → 粘贴：
   ```
   start - 绑定 TinyPA 账号
   unbind - 解绑当前对话
   ```
4. 再生成一串 webhook 密钥：
   ```bash
   openssl rand -hex 32   # TELEGRAM_WEBHOOK_SECRET
   ```

对应两条 env：
- `TELEGRAM_BOT_TOKEN` = BotFather 给的 token
- `TELEGRAM_WEBHOOK_SECRET` = 上面生成的 hex

部署之后还要跑一条命令注册 webhook（见 8.7）。

> **不想做 TG 集成**就跳过。设置页 Telegram 卡片会显示"后端未配置"，功能自动降级。

---

## 1. 确认代码在 GitHub 上

```bash
cd /path/to/TinyPA
git status                # 应该 clean
git log --oneline -3      # 最新一条应包含 pgvector 语义搜索
git push                  # 如果有漏推
```

---

## 2. Vercel 导入项目（先不管 DB）

1. <https://vercel.com> → **Add New** → **Project** → 选 `TinyPA` 仓库 → **Import**
2. Framework 自动识别 Next.js，Build / Output / Install 保持默认
3. 展开 **Environment Variables**，只填这 5 条（DB 相关下一步自动注入，**不要手填**）：

   | Key | Value |
   |---|---|
   | `AUTH_SECRET` | 0.3 生成的 base64 |
   | `RESEND_API_KEY` | `re_xxx` |
   | `MAIL_FROM` | `TinyPA <onboarding@resend.dev>` 或自有域 |
   | `NVIDIA_API_KEY` | `nvapi-xxx`（embedding 必需） |
   | `CRON_SECRET` | 0.3 生成的 hex |

   **LLM provider 按 0.2 挑的那套加 env**（方案 A 什么都不用加；方案 B/C 按那一节的说明加 `LLM_PROVIDER` / `ANTHROPIC_API_KEY` / `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_*_MODEL`）。

   想要浏览器推送的话，再加 4 条（0.4 生成的）：

   | Key | Value |
   |---|---|
   | `VAPID_PUBLIC_KEY` | `publicKey` |
   | `VAPID_PRIVATE_KEY` | `privateKey` |
   | `VAPID_SUBJECT` | `mailto:你@example.com` |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 跟 `VAPID_PUBLIC_KEY` **完全一样** |

   想要 Telegram 集成的话，再加 2 条（0.5 生成的）：

   | Key | Value |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | BotFather 给的 `123456:ABC...` |
   | `TELEGRAM_WEBHOOK_SECRET` | 0.5 生成的 hex |

4. 点 **Deploy**

> 第一次部署构建会成功但运行时 API 会 500（没 DB）。预期内，下一步就接 DB。

---

## 3. 从 Vercel 创建 Neon DB

这一步会**自动往项目注入** `DATABASE_URL` 等环境变量。

1. 刚部署完的 Vercel 项目 → 顶部 **Storage** tab → **Create Database**
2. 选 **Neon** → **Continue**
3. 名字 `tinypa-db`，region 选 **Washington, D.C. (iad1)**（和默认计算区同区延迟最低）
4. **Connect Project**：关联到 TinyPA，**Environments** 全勾（Production / Preview / Development）
5. 点 **Create**

回项目 **Settings → Environment Variables** 核对，应该多了 `DATABASE_URL`、`DATABASE_URL_UNPOOLED`、`POSTGRES_URL` 等，Source 列标 "Neon"。

---

## 3.5. 开 Upstash Redis（限流 + 每日消息上限）

开放注册后必须加的闸门：防爬虫刷 magic link 和单用户刷 LLM 额度。

1. Vercel 项目 → **Storage** tab → **Create Database** → **Upstash** → **Redis**
2. 名字 `tinypa-redis`，region 选 **us-east-1 (N. Virginia)**（和计算 / DB 同区）
3. **Connect Project** 勾上 Production / Preview / Development（每个环境独立实例，互不污染）
4. 点 **Create**

回 **Settings → Environment Variables** 核对，应多出 `UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`，Source 列标 "Upstash"。

**不配也能跑**：代码走 fail-open，没有 Redis 时所有限流放行，仅打 warn。上生产**必须开**。

默认限额（可用这几条 env 覆盖）：

| Env | 默认 | 含义 |
|---|---|---|
| `TINYPA_IP_AUTH_LIMIT` | 20 | 每 IP 每小时 magic-link 请求 |
| `TINYPA_EMAIL_AUTH_LIMIT` | 5 | 每邮箱每 10 分钟 magic-link 请求 |
| `TINYPA_BURST_MSG_LIMIT` | 30 | 每用户每分钟 POST /api/messages |
| `TINYPA_DAILY_MSG_LIMIT` | 200 | 每用户每本地自然日消息数；超出仍入库但不跑 LLM |

---

## 3.6. 开 Sentry（错误追踪）

生产出错一键查根因。PII 已在 `lib/sentry-scrub.ts` 清洗：用户消息内容、email、cookies、query string 都不会进 Sentry。

1. Vercel 项目 → **Integrations** → Browse Marketplace → **Sentry** → Install
2. 授权 Sentry 账号（没就注册，免费档 5k events/月够用）
3. Create new project → Platform `Next.js`，项目名 `tinypa`
4. Connect Project 勾 `TinyPA`，Environments 全勾
5. 完成后 Vercel 自动注入：`NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT`

**不配也能跑**：代码 `enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN`，DSN 缺失时完全静默。

已接入的错误路径（其他 `console.error/warn` 是预期行为，没接入避免噪音）：
- `lib/auth.ts` Resend 发信失败（用户登不进来）
- `app/api/cron/digest` / `app/api/cron/morning` 每日任务失败
- `lib/jobs/extract.ts` 抽取流中断
- `lib/push/webpush.ts` 推送失败（排除 404/410 这种正常订阅失效）
- `app/api/telegram/webhook` TG 抽取失败

---

## 4. 开 pgvector 扩展（Neon SQL Editor）

`/notes` 的语义搜索依赖 `vector` 扩展，Neon 默认不开。**必须在 db:push 之前开**，否则 Drizzle 建 `embedding vector(1024)` 会报 `type "vector" does not exist`。

1. Vercel 项目 **Storage** tab → 点 DB 名字 → 右上 **Open in Neon**
2. Neon 左侧 **SQL Editor**，粘贴并 Run：
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. 下方出现 `CREATE EXTENSION`，没报错即成

---

## 5. 本地拉环境变量 + 推 schema

```bash
cd /path/to/TinyPA

# 第一次用 Vercel CLI：关联本地和 Vercel 项目
npx vercel link
# 按提示选 scope + 刚建的 TinyPA 项目

# 把生产环境变量拉到本地（写入 .env.production.local，.gitignore 已忽略）
npx vercel env pull .env.production.local

# 推 schema 到生产库
set -a && source .env.production.local && set +a
pnpm db:push
```

看到 `[✓] Changes applied` 就成。这一步建所有表（users / messages / items / digests / push_subs / auth 相关），`items` 表会带上 `embedding vector(1024)` 列。

---

## 6. 建 HNSW 索引（回 Neon SQL Editor）

```sql
CREATE INDEX IF NOT EXISTS items_note_embedding_idx
  ON items USING hnsw (embedding vector_cosine_ops)
  WHERE type = 'note' AND embedding IS NOT NULL;
```

索引不影响正确性，只让语义搜索快一个数量级。空库瞬间完成。

> 这条 SQL 也在 `drizzle/0001_pgvector.sql`——装了 `psql` 的话可以 `psql "$DATABASE_URL" -f drizzle/0001_pgvector.sql` 一次把扩展和索引都搞定（先后两次执行都需要，因为索引依赖列）。

---

## 7. 回填 AUTH_URL + Redeploy

DB 好了，补两个运行时必需的 URL 型变量。

1. Vercel 项目顶部复制部署域名，形如 `tinypa-xxx.vercel.app`
2. **Settings → Environment Variables** → **Add New**，分别加两条（Environment 全勾）：
   - `AUTH_URL` = `https://tinypa-xxx.vercel.app`
   - `NEXT_PUBLIC_APP_URL` = 同上
3. **Deployments** → 最新一次 → 右上 `⋯` → **Redeploy** → **不要**勾「Use existing build cache」

等 1-2 分钟部署完即可验证。

> 绑自定义域也一样：先在 **Settings → Domains** 绑好，然后把 `AUTH_URL` 和 `NEXT_PUBLIC_APP_URL` 指向自定义域，再 Redeploy。

---

## 8. 端到端验证（按顺序打勾）

### 8.1 登录

1. 打开 `https://tinypa-xxx.vercel.app` → 跳 `/login`
2. 输入邮箱（**沙盒模式必须是注册 Resend 用的那个**）
3. 收邮件 → 点"登录到 TinyPA"
4. 跳回主页 = 成功

### 8.2 聊天 + 抽取

发一条混合消息：
> 明天下午3点开会要准备财报；昨晚梦见小时候的院子；最近有点累

1-3 秒内消息下方应该出现：
- PA 的一条**左对齐 reply 气泡**（10-30 字，朋友语气）
- 一个 `todo` 卡：准备财报（带时间）
- 一个 `note` 卡：梦见小时候的院子
- 一个 `mood` 卡：有点累

> 如果只看到"已记录。"：这是 fallback，说明 LLM 返回空/不合法。去 Vercel **Logs** 搜 `[gemma.extract] done`，看 `contentPreview` 字段的前几百字是不是合法 NDJSON。

### 8.3 今日 tab

能看到"准备财报"这条 todo。勾选能划线。

### 8.4 搜索 tab（验 pgvector）

- 搜「院子」→ 命中那条 note，角标紫色**关键字**
- 搜「童年」→ 也应命中（词不在文本里，靠 embedding），角标绿色**语义**

两个都命中说明 ILIKE + 向量链路都通。

### 8.5 复盘 + 早报（手动触发）

```bash
# 替换成你的域名
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://tinypa-xxx.vercel.app/api/cron/digest"

curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://tinypa-xxx.vercel.app/api/cron/morning"
```

- 第一条返回 `{"count":1,"results":[{"ran":true}]}` → 复盘 tab 能看到卡
- 第二条返回 `sent:true` → 邮箱查收早报（沙盒模式发到注册邮箱）

> 早报依赖当天的 digest，所以必须先跑 digest 再跑 morning。

### 8.6 浏览器推送（可选）

前提是 0.4 那四条 VAPID env 都配上了。

1. 登录 TinyPA → **设置** 页，下方多出一块 **浏览器推送**
2. 桌面 Chrome/Firefox/Edge：直接点 **开启推送** → 授权 → 按 **发一条测试** 看系统通知有没有弹出
3. iOS：必须先 Safari → 分享 →「添加到主屏幕」，**从桌面图标打开**再来设置页（iOS 16.4+ 的 Web Push 只对已安装 PWA 开放）
4. 开启后，次日 08:03 的早报会同时走邮件 + 浏览器通知。关掉只发邮件

### 8.7 Telegram 集成（可选）

前提是 0.5 那两条 env 都配上了，并且已经做过部署（否则下面的 URL 还不存在）。

1. **注册 webhook**（让 Telegram 把消息推到你的 Vercel 域名）：
   ```bash
   curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -H "content-type: application/json" \
     -d "{\"url\":\"https://<your-domain>/api/telegram/webhook\",\"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET\"}"
   ```
   返回 `{"ok":true,"result":true,"description":"Webhook was set"}` 就成。
2. TG 里搜自己的 bot → 发 `/start` → 应该收到"请到网页版生成 token"的提示。收不到就看 `8.7` 最后一行的排查。
3. TinyPA 设置页下方出现 **Telegram 绑定** 卡片 → 点"生成绑定码" → 点"打开 Telegram" 链接
4. TG 里 bot 会收到一条 `/start xxxx` 消息 → 按回车发送 → 收到"绑定成功 ✅"
5. 设置页卡片自动刷新成 "@yourusername · 已绑定"
6. 在 bot 对话里随便发一句话（比如"明天下午3点开会要准备财报"）→ 几秒后 bot 回"已整理：1 个待办 ✨"
7. 回网页，今日 tab 能看到这条 todo

> 排查：webhook 没反应时 `curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"` 看 `last_error_message` 字段。401 → secret 没对上；404 → URL 写错了。

### 8.8 Cron 自动跑

`vercel.json` 里配了两条每日 cron（UTC 时间）：

```json
{
  "crons": [
    { "path": "/api/cron/digest",  "schedule": "7 14 * * *" },
    { "path": "/api/cron/morning", "schedule": "3 0 * * *" }
  ]
}
```

- UTC 14:07 = **北京时间 22:07** 每晚复盘
- UTC 00:03 = **北京时间 08:03** 次日早报

Vercel 会自动加 `Authorization: Bearer $CRON_SECRET` 头（前提是同名环境变量已设），一行代码校验。

> **Hobby 档限制**：免费 cron 每天只能一次。所有用户固定走北京晚间 22:07 和次日 08:03，别的时区时间会不准。想做"每人自选时间"要 Vercel Pro + schedule 改 `3 * * * *` + 按用户时区判断，或换 [Upstash QStash](https://upstash.com/docs/qstash/features/schedules) 做外部调度。

---

## 9. 常见卡点速查

| 现象 | 原因 / 处理 |
|---|---|
| `pnpm db:push` 报 `type "vector" does not exist` | 第 4 步的 `CREATE EXTENSION` 没跑或选错了 DB。回 Neon SQL Editor 确认当前 project 是 TinyPA 的，再跑一次 |
| `npx vercel env pull` 报 `Project not linked` | 先 `npx vercel link` |
| Neon Dashboard 里 `Create Project` 是灰的 | 正常。通过 Vercel 集成创建的账号必须走 Vercel Storage tab |
| 邮件登录链接点了跳 `localhost:3000` | 第 7 步 `AUTH_URL` 没填或 Redeploy 没做 |
| 邮件一直收不到 | Resend Dashboard → Emails 看有没有记录；沙盒地址只能发到注册邮箱本身；检查垃圾箱 |
| 聊天每条都只显示"已记录。" | LLM 返回空/不合法。看 Vercel Logs `[gemma.extract] done` 的 `contentPreview` 判断是模型没吐还是解析不中 |
| 今日 tab 出现你没说过的条目 | prompt 里的示例文本被模型当成内容泄漏了。确认 `lib/llm/prompts.ts` 已移除 few-shot 示例，并用 `gemma-4-31b-it` 做 extract |
| 搜索 tab 语义搜索无命中 | Vercel Logs 搜 `[embed]`，大概率是 `NVIDIA_API_KEY` 格式错（应以 `nvapi-` 开头）；也可能是 HNSW 索引没建，但那只影响速度不影响结果 |
| Cron 没跑 | Vercel → **Cron Jobs** tab 看记录；确认 `CRON_SECRET` 在环境变量里；刚部署要等到下一个调度时刻才首次触发，想立刻试就用 8.5 的 curl |
| 设置页没看到"浏览器推送"按钮，或提示"未配置 VAPID_PUBLIC_KEY" | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` 没加；`NEXT_PUBLIC_` 前缀是打包期注入的，加完必须 **Redeploy** |
| 浏览器订阅成功但测试推送收不到 | Vercel Logs 看 `[webpush]`；常见是 VAPID_SUBJECT 没带 `mailto:` 前缀、或公私钥配成两对不匹配的 |
| iOS Safari 里按钮显示"需要先添加到主屏幕" | iOS 16.4+ 的 Web Push 只对 standalone PWA 开放，必须从桌面图标打开 |
| Telegram 设置卡片显示"后端没有配置" | `TELEGRAM_BOT_TOKEN` 没加或加错；注意 Redeploy |
| Telegram 里 `/start <token>` 提示"无效或已过期" | token 只有 5 分钟有效期，过期了重新生成就行 |
| webhook 注册成功但 bot 收消息没反应 | `curl .../getWebhookInfo` 看 `last_error_message`；401 是 `TELEGRAM_WEBHOOK_SECRET` 前后不一致 |

---

## 10. 以后只改代码的迭代

正常开发只要 `git push`，Vercel 自动部署。

**只有两种情况要手动介入：**

1. **`lib/db/schema.ts` 改了** → 本地跑 `pnpm db:push`（env 已在 `.env.production.local`）
2. **切换 embedding 模型** → 同时改 `LLM_EMBED_MODEL` 环境变量 + `lib/db/schema.ts` 里 `vector1024` 的维度数字 + 重新 backfill：
   ```bash
   curl "https://<domain>/api/debug/backfill-embeddings?secret=$CRON_SECRET"
   ```

pgvector 扩展是库级别一次性操作，之后的迭代都不用再开。

---

## 11. 装到手机主屏幕（PWA）

### iOS (Safari)

1. Safari 打开 `https://tinypa-xxx.vercel.app` → 登录
2. 底部分享按钮 → **添加到主屏幕**
3. 从桌面图标打开，地址栏消失 = 进入 standalone

### Android (Chrome)

1. Chrome 打开站点 → 右上三个点 → **安装应用** / **添加到主屏幕**
2. 桌面图标打开，像原生 App 一样

> 如果图标糊：`public/manifest.json` 声明了 `icon-192.png` / `icon-512.png` / `icon-maskable.png`，但仓库里没放这三张。自己做一张深色背景 + 紫色聊天气泡的方图扔到 `public/` 再 push 即可。缺图不阻止安装，只是 Android 启动画面是灰底。

---

## 12. 自定义域（可选）

1. Vercel 项目 **Settings** → **Domains** → **Add** → 填 `tinypa.example.com`
2. 按提示在 DNS 服务商加一条 `CNAME` 指向 `cname.vercel-dns.com`
3. 生效后把 `AUTH_URL` 和 `NEXT_PUBLIC_APP_URL` 改成新域 → Redeploy
4. Resend 的 `MAIL_FROM` 也建议换成同域的 `no-reply@tinypa.example.com`（需要在 Resend 完成域名验证）

---

做完以上，你就有一个挂在公网、可以装进口袋、每晚自动复盘、每早邮件唤醒、能语义搜索历史 note 的 TinyPA 了。
