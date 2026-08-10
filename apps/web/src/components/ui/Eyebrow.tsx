/** Letterspaced caps label — matches the wordmark tagline treatment. */
export function Eyebrow({
  children,
  className = "",
  as: Tag = "p",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "p" | "span" | "h2";
}) {
  return (
    <Tag className={`eyebrow text-ek-green-700 ${className}`.trim()}>
      {children}
    </Tag>
  );
}
