/**
 * Consumer Resolver — Logo mark.
 *
 * Super minimalist: two vertical bars at different heights.
 * Left (shorter) = problem. Right (taller) = resolution.
 * Clean, geometric, no text dependency.
 */
import Link from "next/link";

interface LogoProps {
  linked?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "light";
}

/**
 * The mark — two vertical bars at different heights.
 * Works at any size, any context.
 */
function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="5" width="3" height="12" rx="1.5" fill="currentColor" />
      <rect x="14" y="2" width="3" height="15" rx="1.5" fill="currentColor" />
    </svg>
  );
}

const sizeConfig = {
  sm: { mark: "w-5 h-5", text: "text-sm", gap: "gap-2" },
  md: { mark: "w-6 h-6", text: "text-base", gap: "gap-2.5" },
  lg: { mark: "w-8 h-8", text: "text-xl", gap: "gap-3" },
} as const;

export function Logo({ linked = true, size = "md", variant = "default" }: LogoProps) {
  const cfg = sizeConfig[size];
  const isLight = variant === "light";

  const content = (
    <span className={`inline-flex items-center ${cfg.gap}`}>
      <Mark className={`${cfg.mark} ${isLight ? "text-white" : "text-slate-800"}`} />
      <span
        className={`font-serif font-semibold tracking-tight ${cfg.text} ${
          isLight ? "text-white" : "text-slate-900"
        }`}
      >
        Consumer Resolver
      </span>
    </span>
  );

  if (linked) {
    return (
      <Link
        href="/"
        className="inline-flex items-center no-underline hover:opacity-80 transition-opacity"
      >
        {content}
      </Link>
    );
  }

  return content;
}
