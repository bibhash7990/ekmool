"use client";

import { useCallback, useState, type ElementType } from "react";

/**
 * The one scroll-reveal pattern used site-wide: fade + 8px rise, 60ms
 * stagger by index. Content is present in the DOM at all times (crawlers
 * and no-JS readers see it); only opacity/transform animate.
 *
 * Observer setup lives in a ref callback rather than an effect so the
 * element is guaranteed attached and cleanup runs on detach.
 */
export function Reveal({
  children,
  index = 0,
  as: Tag = "div",
  className = "",
}: {
  children: React.ReactNode;
  index?: number;
  as?: "div" | "li" | "section" | "article";
  className?: string;
}) {
  const [visible, setVisible] = useState(false);

  const observe = useCallback((el: HTMLElement | null) => {
    if (!el) return;

    if (
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const Component = Tag as ElementType;

  return (
    <Component
      ref={observe}
      className={`reveal ${visible ? "is-visible" : ""} ${className}`.trim()}
      style={{ transitionDelay: `${index * 60}ms` }}
    >
      {children}
    </Component>
  );
}
