import { useState } from "react";
import { Mail, MapPin, MessageSquare, Send, CheckCircle2 } from "lucide-react";
import { BrandShell } from "../../components/brand/BrandShell";
import { cn } from "../../lib/cn";

type Interest = "pilot" | "tech" | "invest" | "press";

const INTERESTS: Array<{ key: Interest; label: string; desc: string }> = [
  { key: "pilot",  label: "파일럿 도입", desc: "병원 임상 도입 협력" },
  { key: "tech",   label: "기술 문의",   desc: "아키텍처/API/통합" },
  { key: "invest", label: "투자/협업",   desc: "투자·전략 제휴" },
  { key: "press",  label: "언론/취재",   desc: "보도자료·인터뷰" },
];

export default function ContactPage() {
  return (
    <BrandShell>
      <Hero />
      <ContactForm />
    </BrandShell>
  );
}

function Hero() {
  return (
    <section className="border-b border-vuno-divider bg-vuno-surface/30">
      <div className="max-w-[1400px] mx-auto px-6 py-20 md:py-28">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-vuno-cyan/40 text-vuno-cyan text-xs font-bold uppercase tracking-[0.2em] mb-6">
            Contact
          </div>
          <h1 className="text-4xl md:text-6xl font-bold leading-tight text-white">
            응급실 AI 도입, <br />
            <span className="text-vuno-cyan">상담부터 시작</span>
          </h1>
          <p className="mt-6 text-lg text-vuno-muted leading-relaxed">
            파일럿 도입·기술 통합·임상 자문 등 어떤 문의든 환영합니다.
          </p>
        </div>
      </div>
    </section>
  );
}

function ContactForm() {
  const [interest, setInterest] = useState<Interest>("pilot");
  const [form, setForm] = useState({ name: "", email: "", org: "", message: "" });
  const [sent, setSent] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) return;
    setSent(true);
  }

  return (
    <section className="py-24">
      <div className="max-w-[1100px] mx-auto px-6 grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-10">
        {/* 좌측 */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-7">EMON 연락처</h2>

          <div className="space-y-5">
            <InfoRow icon={Mail} label="이메일">
              <a href="mailto:hello@emon-med.health" className="text-vuno-cyan hover:underline">
                hello@emon-med.health
              </a>
            </InfoRow>
            <InfoRow icon={MessageSquare} label="협력 문의">
              <a href="mailto:partners@emon-med.health" className="text-vuno-cyan hover:underline">
                partners@emon-med.health
              </a>
            </InfoRow>
            <InfoRow icon={MapPin} label="사무실">
              <span className="text-white">서울 · 응급의료 AI 연구센터</span>
            </InfoRow>
          </div>

          <div className="mt-10 border border-vuno-border bg-vuno-surface p-5">
            <div className="text-xs font-bold text-vuno-cyan uppercase tracking-wider mb-2">응답 시간</div>
            <p className="text-sm text-vuno-muted leading-relaxed">
              평일 09:00 ~ 18:00 (KST). 파일럿 문의는 영업일 기준 <strong className="text-white">24시간 내</strong> 답변드립니다.
            </p>
          </div>
        </div>

        {/* 우측 폼 */}
        <div className="border border-vuno-border bg-vuno-surface p-8">
          {sent ? (
            <SuccessMessage onReset={() => { setSent(false); setForm({ name: "", email: "", org: "", message: "" }); }} />
          ) : (
            <form onSubmit={submit} className="space-y-6">
              <div>
                <div className="text-sm font-bold text-white mb-3 uppercase tracking-wider">관심 분야</div>
                <div className="grid grid-cols-2 gap-2">
                  {INTERESTS.map((i) => (
                    <button
                      key={i.key}
                      type="button"
                      onClick={() => setInterest(i.key)}
                      className={cn(
                        "border p-3 text-left transition-all",
                        interest === i.key
                          ? "border-vuno-cyan bg-vuno-cyan/5"
                          : "border-vuno-border bg-vuno-bg hover:bg-vuno-elevated",
                      )}
                    >
                      <div className={cn("text-sm font-bold", interest === i.key ? "text-vuno-cyan" : "text-white")}>
                        {i.label}
                      </div>
                      <div className="text-xs text-vuno-muted mt-0.5">{i.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormInput label="이름" required placeholder="홍길동" value={form.name} onChange={(v) => update("name", v)} />
                <FormInput label="이메일" required type="email" placeholder="hong@hospital.kr" value={form.email} onChange={(v) => update("email", v)} />
              </div>

              <FormInput label="소속 (병원/회사)" placeholder="OO 대학교병원 응급의학과" value={form.org} onChange={(v) => update("org", v)} />

              <FormTextarea
                label="문의 내용"
                required
                rows={5}
                placeholder="현재 응급실 상황·검토 중인 시나리오·궁금한 점 등을 자유롭게 적어주세요."
                value={form.message}
                onChange={(v) => update("message", v)}
              />

              <div className="pt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-vuno-dim">
                  제출 시 개인정보 처리방침에 동의합니다.
                </p>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 h-11 px-6 font-bold bg-vuno-cyan text-vuno-bg hover:bg-vuno-cyanGlow transition-colors tracking-wider uppercase text-sm"
                >
                  <Send className="h-4 w-4" />
                  문의 보내기
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function InfoRow({ icon: Icon, label, children }: { icon: typeof Mail; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="h-11 w-11 bg-vuno-surface border border-vuno-cyan/40 grid place-items-center text-vuno-cyan flex-shrink-0">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs text-vuno-dim mb-1 uppercase tracking-wider">{label}</div>
        <div className="text-base">{children}</div>
      </div>
    </div>
  );
}

function FormInput({
  label, required, type = "text", placeholder, value, onChange,
}: { label: string; required?: boolean; type?: string; placeholder?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold text-white uppercase tracking-wider">
        {label}{required && <span className="text-vuno-cyan ml-1">*</span>}
      </label>
      <input
        type={type}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 px-3 bg-vuno-bg border border-vuno-border text-white placeholder:text-vuno-dim focus:outline-none focus:border-vuno-cyan transition-colors"
      />
    </div>
  );
}

function FormTextarea({
  label, required, rows = 5, placeholder, value, onChange,
}: { label: string; required?: boolean; rows?: number; placeholder?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold text-white uppercase tracking-wider">
        {label}{required && <span className="text-vuno-cyan ml-1">*</span>}
      </label>
      <textarea
        required={required}
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2.5 bg-vuno-bg border border-vuno-border text-white placeholder:text-vuno-dim focus:outline-none focus:border-vuno-cyan transition-colors resize-y"
      />
    </div>
  );
}

function SuccessMessage({ onReset }: { onReset: () => void }) {
  return (
    <div className="text-center py-12">
      <div className="h-16 w-16 mx-auto bg-vuno-bg border-2 border-vuno-cyan grid place-items-center text-vuno-cyan mb-5">
        <CheckCircle2 className="h-8 w-8" />
      </div>
      <h3 className="text-xl font-bold text-white">문의가 접수되었습니다</h3>
      <p className="text-sm text-vuno-muted mt-2 max-w-sm mx-auto">
        EMON 팀이 영업일 기준 24시간 내에 회신드리겠습니다.
      </p>
      <button
        onClick={onReset}
        className="mt-6 inline-flex items-center gap-2 h-10 px-5 border border-vuno-border text-white hover:bg-vuno-elevated transition-colors text-sm font-medium"
      >
        다른 문의 작성
      </button>
    </div>
  );
}
