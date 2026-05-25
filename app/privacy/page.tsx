export const metadata = { title: "隐私政策 — TinyPA" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-[15px] leading-relaxed">
      <h1 className="mb-2 text-2xl font-semibold">隐私政策</h1>
      <p className="mb-8 text-xs text-mute">最近更新：2026-05-08</p>

      <p className="mb-6">
        TinyPA 是一个把你的碎碎念整理成结构化条目的口袋助理。我们只收集让产品跑起来的最少数据，下面把事情说清楚。
      </p>

      <Section title="我们收集什么">
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>邮箱</b>：用来登录（magic link）和发送每日早报。</li>
          <li><b>你发的消息原文</b>：存在我们的数据库，用来抽取待办、笔记、情绪和跟进项。</li>
          <li><b>AI 抽取后的条目</b>：待办、笔记等结构化结果。</li>
          <li><b>每日复盘</b>：AI 生成的当日总结和次日建议。</li>
          <li><b>时区</b>：只在你设置或浏览器自动上报时保存，用于定时推送和相对日期计算。</li>
          <li><b>推送订阅</b>（可选）：如果你开启了浏览器推送或绑定了 Telegram，保存对应的端点和 chat id。</li>
        </ul>
      </Section>

      <Section title="我们用第三方">
        <p className="mb-2">TinyPA 站在很多人的肩膀上，具体是这些：</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>Vercel</b>（美国）：托管服务和函数。</li>
          <li><b>Neon</b>（美国）：Postgres 数据库。</li>
          <li><b>Resend</b>（美国）：发送登录邮件和早报。</li>
          <li><b>Google Gemini / Anthropic</b>：调用 LLM 把你的消息拆成结构化条目。你发的消息文本会被传给这些服务，但仅用于一次性处理，不会被用来训练。</li>
          <li><b>Upstash Redis</b>：存限流计数器，不存你发的消息内容。</li>
          <li><b>Sentry</b>：错误追踪。我们会主动清洗掉消息内容、邮箱、cookies 等敏感字段。</li>
          <li><b>Telegram</b>（可选）：只在你主动绑定时使用。</li>
        </ul>
      </Section>

      <Section title="我们不做什么">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>不卖你的数据。</li>
          <li>不投广告。</li>
          <li>不分析聚合数据做画像。</li>
          <li>不把消息内容作为模型训练语料。</li>
        </ul>
      </Section>

      <Section title="你的权利">
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>导出</b>：随时在 <a href="/settings" className="text-accent underline">设置页</a>下载你所有数据的 JSON 副本。</li>
          <li><b>删除</b>：同样在设置页一键删除账号。数据库会级联清除你的所有消息、条目、复盘、推送订阅。删除后无法恢复。</li>
          <li><b>询问</b>：有疑问发邮件到站点管理员邮箱。</li>
        </ul>
      </Section>

      <Section title="数据保留">
        只要你不删除账号，我们一直保留你的数据。触发删除后会从主数据库和 Sentry 侧立即清除，第三方服务商的备份可能最多保留 30 天再彻底失效。
      </Section>

      <Section title="Cookies">
        我们只用必要的 session cookie 保持你的登录状态，不用于广告或分析追踪。
      </Section>

      <Section title="变更">
        如果政策有实质变化，会在登录页和邮件里提前通知。文档顶部的"最近更新"时间也会刷新。
      </Section>

      <p className="mt-10 text-xs text-mute">
        <a href="/login" className="underline">返回登录</a> · <a href="/terms" className="underline">服务条款</a>
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="mb-2 text-lg font-medium">{title}</h2>
      <div className="text-ink/90">{children}</div>
    </section>
  );
}
