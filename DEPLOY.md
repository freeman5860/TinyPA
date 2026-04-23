# 部署到 Vercel

这份指引把 TinyPA 从 0 部署到一个能扫码装进口袋的 PWA。全流程零成本跑起来。

整个过程大致 20 分钟：

1. [准备三个外部服务的 API Key](#1-准备外部服务)
2. [把仓库推到 GitHub](#2-推到-github)
3. [在 Vercel 导入项目并填环境变量](#3-vercel-导入项目)
4. [给生产 DB 建表](#4-给生产-db-建表)
5. [验证登录 + 聊天 + 复盘 + 早报](#5-验证端到端)
6. [装到手机主屏幕](#6-装到手机主屏幕)

---

## 1. 准备外部服务

一共需要四个 key：`DATABASE_URL`、`RESEND_API_KEY`、`NVIDIA_API_KEY`、`AUTH_SECRET`、`CRON_SECRET`（后两个本地生成）。

### 1.1 Postgres（Neon）

1. 打开 <https://neon.tech> 注册（GitHub 登录最快）。
2. 新建项目 `tinypa`，区域选 `AWS / Singapore` 或 `AWS / US East`（离你的 Vercel 区域近的即可）。
3. 创建完成后，Dashboard 顶部有 **Connection string**，选 **Pooled connection**，复制整串。
   ```
   postgres://neondb_owner:xxx@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
   这就是 `DATABASE_URL`。

> 免费档 0.5GB 存储、3GB egress，够个人用很久。

### 1.2 Resend（发邮件）

1. 打开 <https://resend.com> 注册。
2. 左侧 **API Keys** → **Create API Key**，权限选 *Sending access*。复制 `re_xxx`，这是 `RESEND_API_KEY`。
3. **发件域名**有两个选项：
   - **最快**：直接用沙盒发件地址 `onboarding@resend.dev`，只能发到你注册 Resend 的那个邮箱。验证自己能否收到邮件够用了。
   - **正式**：左侧 **Domains** → **Add Domain**，填你的域名（比如 `tinypa.example.com`），按页面提示加 3 条 DNS 记录（DKIM + SPF + MX），几分钟后会变绿。然后 `MAIL_FROM` 填 `TinyPA <no-reply@tinypa.example.com>`。朋友注册用必须走这一步。

### 1.3 NVIDIA NIM（Gemma 4）

1. 打开 <https://build.nvidia.com/google/gemma-4>（或直接 `build.nvidia.com` 搜 Gemma 4）。
2. 登录 → 右上 **Get API Key** → 复制 `nvapi-xxx`，这是 `NVIDIA_API_KEY`。

> NIM 新账号有免费配额。超出后按 token 计费，可以在 Dashboard 看用量。

### 1.4 自己生成两个密钥

在本地终端跑：

```bash
openssl rand -base64 32   # 这是 AUTH_SECRET
openssl rand -hex 32      # 这是 CRON_SECRET
```

两个都记下来，下一步要填到 Vercel。

---

## 2. 推到 GitHub

Vercel 要从 Git 仓库拉代码。

```bash
cd /Users/davidcai/Dev/Claude/TinyPA

# 已有 .git 了，只需要提交新文件
git add -A
git status              # 检查一下是否意外暂存了 .env.local（应该被 .gitignore 挡住）
git commit -m "feat: TinyPA MVP"

# 到 GitHub 新建一个叫 tinypa 的空仓库（可以是 private）
git remote add origin git@github.com:<你的用户名>/tinypa.git
git branch -M main
git push -u origin main
```

---

## 3. Vercel 导入项目

1. 打开 <https://vercel.com> → 登录（推荐 GitHub 登录，授权访问刚才那个仓库）。
2. **Add New** → **Project** → 选中 `tinypa` 仓库 → **Import**。
3. **Framework Preset** 会自动识别为 Next.js，保持默认：
   - Build Command: `next build`（或留空让 Vercel 自动填）
   - Output Directory: `.next`
   - Install Command: `pnpm install`
4. 展开 **Environment Variables**，逐一填：

   | Key | Value | 备注 |
   |---|---|---|
   | `DATABASE_URL` | 1.1 得到的 Neon 连接串 | 务必是 *pooled* |
   | `AUTH_SECRET` | `openssl rand -base64 32` | |
   | `AUTH_URL` | 先空着，第一次部署后再填 | |
   | `NEXT_PUBLIC_APP_URL` | 同上，稍后填 | 邮件里链接回站点用 |
   | `RESEND_API_KEY` | `re_xxx` | |
   | `MAIL_FROM` | `TinyPA <onboarding@resend.dev>` 或你的域 | |
   | `NVIDIA_API_KEY` | `nvapi-xxx` | |
   | `CRON_SECRET` | `openssl rand -hex 32` | **必填**，Vercel Cron 会用它签头 |

5. **Deploy**。首次构建 1-2 分钟。

### 3.1 拿到域名后回填 `AUTH_URL`

部署成功后，Vercel 给你一个域名，形如 `tinypa-xxx.vercel.app`（或绑定的自定义域）。

回到项目 **Settings** → **Environment Variables**：

- 把 `AUTH_URL` 填成 `https://tinypa-xxx.vercel.app`
- 把 `NEXT_PUBLIC_APP_URL` 填成同一个值

改完记得 **Redeploy**（**Deployments** → 最新部署 → 右上 `...` → **Redeploy**），否则 Auth.js 的 magic link 回跳会走错 host。

> 用自定义域也是一样：先在 **Settings → Domains** 绑好，然后把 `AUTH_URL` 和 `NEXT_PUBLIC_APP_URL` 指向自定义域。

---

## 4. 给生产 DB 建表

Drizzle schema 还没推到 Neon，聊天、登录都会 500。从本地机器推一次就行：

```bash
# 临时把 DATABASE_URL 指向生产库
DATABASE_URL="postgres://neondb_owner:xxx@ep-xxx-pooler.../neondb?sslmode=require" \
  pnpm db:push
```

看到 `[✓] Changes applied` 就完事了。以后每次改 `lib/db/schema.ts` 都这样推一次。

> 更严谨的做法是用 `pnpm db:generate` 生成 SQL 迁移后 `drizzle-kit migrate` 推，再把 `drizzle/` 目录提交。MVP 阶段 `db:push` 已经够用。

---

## 5. 验证端到端

打开 `https://tinypa-xxx.vercel.app`：

### 5.1 登录

1. 首页会跳到 `/login`，输入你的邮箱（Resend 沙盒模式下必须填注册 Resend 用的那个）。
2. 查收邮件 → 点"登录到 ..."。
3. 跳回主页 = 成功。

### 5.2 聊天抽取

在首页发一条：

> 明天下午3点开会要准备财报；老婆说晚上吃火锅；最近睡眠不太好。

1-2 秒后，消息下方应该冒出 3 张卡：一个 `todo`、一个 `followup`、一个 `mood`。

切到 "今日" 页，能看到 `准备财报` 这条 todo。勾选一下，能划线。

### 5.3 手动触发复盘 + 早报

Cron 要等到固定时刻，想立刻验证就手工触发：

```bash
# 用你的生产域名 + CRON_SECRET
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://tinypa-xxx.vercel.app/api/cron/digest"

curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://tinypa-xxx.vercel.app/api/cron/morning"
```

- 第一条返回 `{"count":1,"results":[{"userId":"...","ran":true}]}` → 到 "复盘" 页能看到今天那张卡。
- 第二条返回 `sent:true` → 邮箱查收早报。

### 5.4 Cron 自动跑

`vercel.json` 里配了两个每日 cron（UTC 时间）：

```json
{
  "crons": [
    { "path": "/api/cron/digest",  "schedule": "7 14 * * *" },
    { "path": "/api/cron/morning", "schedule": "3 0 * * *" }
  ]
}
```

- `7 14 * * *` = UTC 14:07 = **北京时间 22:07**，每晚生成复盘
- `3 0 * * *` = UTC 00:03 = **北京时间 08:03**，次日发早报

> **Vercel Hobby 限制**：免费档 cron 只能每天跑一次。这里就把所有用户的复盘/早报时间固定成了北京晚间 22:07 和次日 08:03。别的时区的朋友用起来时间会错一些，但能跑。想做成"每人自选几点"需要 Vercel Pro + 把 schedule 改回 `3 * * * *` + 在任务里按每个用户的时区判断跑不跑；或者换 [Upstash QStash](https://upstash.com/docs/qstash/features/schedules) 做外部调度（免费 500 次/天）。

Vercel 会自动给 cron 请求加上 `Authorization: Bearer $CRON_SECRET` 头（前提是你设了同名环境变量），所以不用额外配置。

验证：Vercel 项目 → **Cron Jobs** 标签（或 **Logs** 里过滤 `/api/cron/`），能看到每天两次运行的 200 状态和返回体。

---

## 6. 装到手机主屏幕

PWA 安装后能脱离浏览器窗口、支持横竖屏锁定、占用独立图标。

### iOS (Safari)

1. Safari 打开 `https://tinypa-xxx.vercel.app` → 登录
2. 底部分享按钮 → **添加到主屏幕** → 完成
3. 从桌面点图标打开，地址栏消失 = 已进入 standalone

### Android (Chrome)

1. Chrome 打开站点 → 右上三个点 → **安装应用** / **添加到主屏幕**
2. 桌面图标打开，像原生 App 一样

> 如果安装后图标糊：我在 `public/manifest.json` 里声明了 `icon-192.png / icon-512.png / icon-maskable.png`，但项目里没放这三张图。自己做一张深色背景 + 紫色聊天气泡的方图（或用 AI 一键生成）扔到 `public/` 再 push 即可。缺图不会阻止安装，只是 Android 启动画面会是灰底。

---

## 7. 常见问题

### 点了邮件里的登录链接后跳到 `localhost:3000`

`AUTH_URL` 没填（或改了没 redeploy）。回 Vercel 设置里把它改成生产域名，然后 Redeploy。

### 邮件一直收不到

- 先看 Resend Dashboard → **Emails** 有没有记录
- 沙盒地址 `onboarding@resend.dev` 只能发到注册邮箱本身；要给朋友用必须上自有域
- 检查邮箱的垃圾箱 / 促销分类

### 聊天发完没抽出 item

看 Vercel **Logs** → 过滤 `[gemma.extract]`。常见：
- `NVIDIA_API_KEY` 没设或格式错（应以 `nvapi-` 开头）
- 模型返回的不是合法 JSON（prompt 已要求严格 JSON，但偶发。我在 `lib/llm/gemma.ts` 里做了降级：解析失败不写 item，消息仍保留）

### Cron 没跑

- **Cron Jobs** 标签页看有没有记录
- 确认 `CRON_SECRET` 在 Vercel 环境变量里（Vercel 会自动把它加到请求头）
- 如果是刚部署，Cron 要等到下一个调度时刻（UTC 14:07 或 UTC 00:03）才首次触发；想立刻试就用 5.3 的 curl 手动触发

### `pnpm db:push` 报 SSL 错误

Neon 的连接串要带 `?sslmode=require`（复制的时候默认就有）。

---

## 8. 自定义域（可选）

1. 在 Vercel 项目 **Settings** → **Domains** → **Add** → 填 `tinypa.example.com`
2. 按提示在你的 DNS 服务商加一条 `CNAME` 指向 `cname.vercel-dns.com`
3. 生效后把 `AUTH_URL` 和 `NEXT_PUBLIC_APP_URL` 改为新域 → Redeploy
4. Resend 的 `MAIL_FROM` 也建议用同域下的 `no-reply@tinypa.example.com`（需要在 Resend 加域名验证）

---

做完以上，你就有一个挂在公网、可以装进口袋、每晚自动复盘、每早邮件唤醒的 TinyPA 了。
