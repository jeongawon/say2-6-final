import { Link, NavLink, useLocation } from "react-router-dom";
import { ArrowUpRight, Globe } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface BrandShellProps {
  children: ReactNode;
  /** 헤더 투명/반투명 (Hero 위에 올릴 때) */
  transparent?: boolean;
}

const NAV_ITEMS = [
  { to: "/product",    label: "Product" },
  { to: "/technology", label: "Technology" },
  { to: "/team",       label: "Team" },
  { to: "/contact",    label: "Contact" },
];

export function BrandShell({ children, transparent }: BrandShellProps) {
  return (
    <div className="v2-root min-h-screen bg-vuno-bg text-vuno-text">
      <BrandHeader transparent={transparent} />
      <main>{children}</main>
      <BrandFooter />
    </div>
  );
}

function BrandHeader({ transparent }: { transparent?: boolean }) {
  const loc = useLocation();
  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-colors",
        transparent
          ? "bg-vuno-bg/70 backdrop-blur-xl border-b border-transparent"
          : "bg-vuno-bg/95 backdrop-blur-xl border-b border-vuno-divider",
      )}
    >
      <div className="max-w-[1400px] mx-auto px-6 h-[72px] flex items-center gap-10">
        {/* 로고 — mix-blend-mode로 곤색 배경 사이트와 자연스럽게 병합 */}
        <Link to="/" className="inline-flex items-center gap-3 font-bold text-2xl tracking-tight">
          <img
            src="/EMON.jpg"
            alt="EMON"
            className="h-11 w-11 object-contain"
            style={{ mixBlendMode: "screen" }}
          />
          <span className="text-white tracking-wider">
            EMON<span className="text-vuno-cyan"> Med</span>
            <sup className="text-vuno-cyan text-xs">®</sup>
          </span>
        </Link>

        {/* 메뉴 */}
        <nav className="hidden md:flex items-center gap-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "h-9 px-5 text-xl font-semibold transition-colors flex items-center",
                  isActive
                    ? "text-vuno-cyan"
                    : "text-vuno-muted hover:text-white",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* 우측 */}
        <div className="ml-auto flex items-center gap-4">
          {/* 언어 */}
          <div className="hidden md:flex items-center gap-2 text-xs font-semibold">
            <button className="text-vuno-cyan">KR</button>
            <button className="text-vuno-muted hover:text-white">EN</button>
            <Globe className="h-4 w-4 text-vuno-muted ml-1" />
          </div>

          {/* Live Demo CTA */}
          <Link
            to="/demo"
            className={cn(
              "inline-flex items-center gap-2 h-10 px-5 text-sm font-semibold transition-all",
              "border border-vuno-cyan text-vuno-cyan",
              "hover:bg-vuno-cyan hover:text-vuno-bg",
            )}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-vuno-cyan opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-vuno-cyan" />
            </span>
            Live Demo
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* 브레드크럼 */}
      {loc.pathname !== "/" && (
        <div className="hidden md:block border-t border-vuno-divider/50">
          <div className="max-w-[1400px] mx-auto px-6 h-10 flex items-center text-xs text-vuno-muted">
            <Link to="/" className="hover:text-white">Home</Link>
            <span className="mx-2 text-vuno-dim">/</span>
            <span className="text-white font-medium capitalize">
              {loc.pathname.replace("/", "")}
            </span>
          </div>
        </div>
      )}
    </header>
  );
}

function BrandFooter() {
  return (
    <footer className="border-t border-vuno-divider bg-vuno-bg mt-24">
      <div className="max-w-[1400px] mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* 브랜드 */}
          <div>
            <Link to="/" className="inline-flex items-center gap-2.5 font-bold text-base mb-4">
              <img
                src="/EMON.jpg"
                alt="EMON"
                className="h-8 w-8 object-contain"
                style={{ mixBlendMode: "screen" }}
              />
              <span className="text-white tracking-wider">
                EMON<span className="text-vuno-cyan"> Med</span>
                <sup className="text-vuno-cyan text-xs">®</sup>
              </span>
            </Link>
            <p className="text-sm text-vuno-muted leading-relaxed">
              Emergency Multimodal<br />
              Orchestrated Network<br />
              응급 멀티모달 오케스트레이션
            </p>
          </div>

          <FooterTreeColumn
            title="Product"
            parent={{ label: "응급 의료 AI 시스템", to: "/product" }}
            children={[
              { label: "ECG 분석", to: "/product/ecg" },
              { label: "CXR 분석", to: "/product/cxr" },
              { label: "LAB 분석", to: "/product/lab" },
            ]}
            extras={[{ label: "Live Demo", to: "/demo" }]}
          />
          <FooterColumn
            title="Company"
            links={[
              { label: "Technology", to: "/technology" },
              { label: "Team", to: "/team" },
              { label: "Contact", to: "/contact" },
            ]}
          />
          <FooterColumn
            title="Resources"
            links={[
              { label: "AWS 아키텍처", to: "/technology#aws" },
              { label: "MIMIC-IV 데이터", to: "/technology#data" },
              { label: "파일럿 문의", to: "/contact" },
            ]}
          />
        </div>

        <div className="mt-12 pt-6 border-t border-vuno-divider flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-xs text-vuno-dim">
          <div>© 2026 EMON. All rights reserved.</div>
          <div className="flex gap-4">
            <span>v1.0</span>
            <span>·</span>
            <span>Built with AWS + Anthropic Claude</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<{ label: string; to: string }> }) {
  return (
    <div>
      <h4 className="text-xs font-bold text-vuno-cyan uppercase tracking-[0.15em] mb-4">{title}</h4>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            <Link to={l.to} className="text-sm text-vuno-muted hover:text-white transition-colors">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 트리 구조 푸터 컬럼 — 상위 1개 + 하위 탭들 + 별도 extras */
function FooterTreeColumn({
  title,
  parent,
  children,
  extras,
}: {
  title: string;
  parent: { label: string; to: string };
  children: Array<{ label: string; to: string }>;
  extras?: Array<{ label: string; to: string }>;
}) {
  return (
    <div>
      <h4 className="text-xs font-bold text-vuno-cyan uppercase tracking-[0.15em] mb-4">{title}</h4>
      {/* 상위 — 응급 의료 AI 시스템 */}
      <Link
        to={parent.to}
        className="block text-sm font-bold text-white hover:text-vuno-cyan transition-colors mb-2"
      >
        {parent.label}
      </Link>
      {/* 하위 — 모달별 탭 */}
      <ul className="space-y-1.5 ml-3 mb-3 border-l border-vuno-border pl-3">
        {children.map((c) => (
          <li key={c.label}>
            <Link to={c.to} className="text-sm text-vuno-muted hover:text-white transition-colors">
              {c.label}
            </Link>
          </li>
        ))}
      </ul>
      {/* extras — 별도 항목 (Live Demo 등) */}
      {extras && extras.length > 0 && (
        <ul className="space-y-2.5 mt-3 pt-3 border-t border-vuno-border/50">
          {extras.map((e) => (
            <li key={e.label}>
              <Link to={e.to} className="text-sm text-vuno-muted hover:text-white transition-colors">
                {e.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
