import { cn } from "cn";

export const SEGMENT_TRACK = "grid auto-cols-fr grid-flow-col gap-0.5 rounded-xl bg-muted p-0.5";

export const segmentItem = (active: boolean) =>
  cn(
    "flex min-h-11 items-center justify-center rounded-[10px] px-3 text-sm font-medium transition",
    active ? "bg-card text-foreground shadow-sm ring-1 ring-border/60" : "text-muted-foreground",
  );
