"use client";

import { cn } from "cn";
import { SEGMENT_TRACK, segmentItem } from "./segmented-styles";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

/** Controle de segmentos (3–4 opções curtas). Alvos de 44px. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn(SEGMENT_TRACK, className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={segmentItem(option.value === value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
