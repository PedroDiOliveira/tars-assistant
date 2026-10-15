"use client";

import { UnitField } from "./unit-field";

interface DistanceFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
  className?: string;
}

/** Campo de distância em km; o texto é validado por `parseDistanceKm`. */
export function DistanceField(props: DistanceFieldProps) {
  return <UnitField unit="km" {...props} />;
}
