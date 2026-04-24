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

### 0.2 NVIDIA NIM（Gemma + 嵌入模型）

1. <https://build.nvidia.com/google/gemma-4> → 登录 → 右上 **Get API Key**
2. 复制 `nvapi-xxx`，这是 `NVIDIA_API_KEY`
3. 同一个 key 可以调 `nvidia/nv-embedqa-e5-v5`（语义搜索用 1024 维模型），不用单独申请

> 新账号有免费额度。超出后按 token 计费，Dashboard 能看用量。

### 0.3 本地生成两串随机密钥

```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -hex 32      # CRON_SECRET
```

两个都记下来，等下贴 Vercel。

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
   | `NVIDIA_API_KEY` | `nvapi-xxx` |
   | `CRON_SECRET` | 0.3 生成的 hex |

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

### 8.6 Cron 自动跑

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
