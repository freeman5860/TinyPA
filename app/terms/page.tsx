export const metadata = { title: "服务条款 — TinyPA" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-[15px] leading-relaxed">
      <h1 className="mb-2 text-2xl font-semibold">服务条款</h1>
      <p className="mb-8 text-xs text-mute">最近更新：2026-05-08</p>

      <p className="mb-6">
        使用 TinyPA 即代表你同意以下条款。内容尽量直白。
      </p>

      <Section title="服务是什么">
        TinyPA 是一款把日常碎碎念整理成结构化条目的私人助理，目前处于早期阶段，按现状（AS IS）提供，不保证无 bug、不保证持续可用、不保证数据永不丢失。建议重要内容别只放这里。
      </Section>

      <Section title="你的账号">
        你用一个邮箱注册，保管好邮箱就等于保管好账号。我们不存密码，也不会主动要你的密码。
      </Section>

      <Section title="合理使用">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>不要用 TinyPA 存违法内容、版权受限的内容、对他人有害的内容。</li>
          <li>不要尝试绕过限流、攻击后端、自动化爬取。</li>
          <li>不要用别人的邮箱冒充他人。</li>
          <li>AI 生成的整理结果可能出错，请你自己判断是否采用；重要事项自己确认。</li>
        </ul>
      </Section>

      <Section title="免费与限额">
        当前免费使用。为防滥用，每用户每日消息数和每 IP 登录请求都有上限。上限可能根据成本情况调整，会尽量提前通知。
      </Section>

      <Section title="账号终止">
        你可以随时在设置页删除账号。我们在你严重违反条款时（比如滥用、攻击）可能暂停或删除你的账号，一般会先邮件通知。
      </Section>

      <Section title="责任上限">
        因为是免费产品，我们不对因使用 TinyPA 而产生的任何直接或间接损失负责。你同意自担风险。
      </Section>

      <Section title="条款变更">
        条款可能调整，会更新文档顶部日期。继续使用即表示接受新条款。
      </Section>

      <p className="mt-10 text-xs text-mute">
        <a href="/login" className="underline">返回登录</a> · <a href="/privacy" className="underline">隐私政策</a>
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
