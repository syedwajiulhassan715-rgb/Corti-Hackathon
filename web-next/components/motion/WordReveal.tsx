"use client";

import type { CSSProperties } from "react";

export interface RevealSegment {
  /** Plain text. Split on whitespace; each word animates on its own. */
  text: string;
  /** Applied to every word in this segment, so a clause can carry a colour. */
  className?: string;
  /** Force a line break after this segment. */
  breakAfter?: boolean;
}

/**
 * A headline that resolves word by word.
 *
 * The stagger runs across ALL segments, not per segment, so a two-sentence
 * headline lands as one sentence finishing after the other rather than as two
 * animations racing. Words are inline-block spans -- the line box is identical
 * to the un-animated markup, so nothing reflows when the animation ends.
 */
export function WordReveal({
  segments,
  delay = 0,
  step = 0.07,
  className,
}: {
  segments: RevealSegment[];
  /** Seconds before the first word. */
  delay?: number;
  /** Seconds between words. */
  step?: number;
  className?: string;
}) {
  let index = 0;

  return (
    <span className={className}>
      {segments.map((segment, segmentIndex) => {
        const words = segment.text.split(/(\s+)/).filter((part) => part.length > 0);
        return (
          <span key={`${segmentIndex}-${segment.text}`}>
            {words.map((word, wordIndex) => {
              if (/^\s+$/.test(word)) return <span key={`s${wordIndex}`}> </span>;
              const style = { "--motion-delay": `${delay + index++ * step}s` } as CSSProperties;
              return (
                <span key={`w${wordIndex}`} className={`motion-word ${segment.className ?? ""}`} style={style}>
                  {word}
                </span>
              );
            })}
            {segment.breakAfter ? <br /> : null}
          </span>
        );
      })}
    </span>
  );
}
