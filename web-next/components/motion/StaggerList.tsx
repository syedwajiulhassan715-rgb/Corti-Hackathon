"use client";

import { Children, cloneElement, isValidElement, type CSSProperties, type ReactNode } from "react";

/**
 * Children entering one after another instead of all at once.
 *
 * Generic on purpose: it knows nothing about what it is staggering, so the
 * ward board and the patient record can adopt it without a second copy.
 */
export function StaggerList({
  children,
  delay = 0,
  step = 0.09,
  variant = "rise",
  className,
}: {
  children: ReactNode;
  delay?: number;
  step?: number;
  variant?: "rise" | "slide" | "fade";
  className?: string;
}) {
  const items = Children.toArray(children);
  const animation = variant === "slide" ? "motion-slide" : variant === "fade" ? "motion-fade" : "motion-rise";

  return (
    <>
      {items.map((child, index) => {
        const style = { "--motion-delay": `${delay + index * step}s` } as CSSProperties;
        if (isValidElement<{ className?: string; style?: CSSProperties }>(child)) {
          return cloneElement(child, {
            className: `${child.props.className ?? ""} ${animation} ${className ?? ""}`.trim(),
            style: { ...(child.props.style ?? {}), ...style },
          });
        }
        return (
          <span key={index} className={`${animation} ${className ?? ""}`.trim()} style={style}>
            {child}
          </span>
        );
      })}
    </>
  );
}
