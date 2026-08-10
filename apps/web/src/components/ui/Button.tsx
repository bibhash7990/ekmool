import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-sm font-medium " +
  "transition-colors duration-200 cursor-pointer select-none " +
  "disabled:cursor-not-allowed disabled:opacity-55";

const variants: Record<Variant, string> = {
  primary:
    "bg-ek-gold-500 text-ek-green-950 hover:bg-ek-gold-600 " +
    "focus-visible:outline-ek-green-900",
  secondary:
    "border border-ek-green-900 text-ek-green-900 hover:bg-ek-green-900 " +
    "hover:text-ek-cream",
  ghost:
    "text-ek-green-900 hover:text-ek-green-700 underline-offset-4 hover:underline",
};

const sizes: Record<Size, string> = {
  // 44px+ tall — thumb-reachable touch targets
  md: "min-h-11 px-5 py-2.5 text-17",
  lg: "min-h-13 px-7 py-3.5 text-17",
};

function classes(variant: Variant, size: Size, className: string) {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`.trim();
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentPropsWithoutRef<"button"> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button className={classes(variant, size, className)} {...props} />
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentPropsWithoutRef<typeof Link> & {
  variant?: Variant;
  size?: Size;
}) {
  return <Link className={classes(variant, size, className)} {...props} />;
}
