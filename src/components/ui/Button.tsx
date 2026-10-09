import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors duration-150 ease-out-soft disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "btn-sweep bg-accent text-on-accent",
  secondary: "btn-sweep border border-line-strong bg-surface text-ink",
  ghost: "text-muted hover:bg-sunken hover:text-ink",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-2.5 text-sm",
  // 44 px de alto: objetivo táctil mínimo (WCAG 2.5.8)
  md: "h-11 px-4 text-base",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(base, variants[variant], sizes[size], className)}
    />
  );
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  href,
  ...props
}: CommonProps & { href: string } & Omit<React.ComponentProps<typeof Link>, "href" | "className">) {
  return (
    <Link
      {...props}
      href={href}
      className={cn(base, variants[variant], sizes[size], className)}
    />
  );
}
