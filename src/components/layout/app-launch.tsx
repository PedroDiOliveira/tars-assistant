"use client";

import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";
import { useLaunchReady } from "@/data";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import "./app-launch.css";

const INTRO_MS = 3100;
const EXIT_MS = 550;
const MAX_WAIT_MS = 8000;

type Phase = "playing" | "leaving" | "ready";

/** Lives in the root layout so route changes never replay the launch animation. */
export function AppLaunch({ children }: { children: ReactNode }) {
  const storeReady = useLaunchReady();
  const isReady = useEffectEvent(() => storeReady);
  const [launch, setLaunch] = useState<{ phase: Phase; sequence: number }>({
    phase: "playing",
    sequence: 0,
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-app-ready", "");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const standalone = () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    let timer: ReturnType<typeof setTimeout>;
    let sequence = 0;
    let wasHidden = document.visibilityState === "hidden";

    function begin(replay = false) {
      clearTimeout(timer);
      if (replay) {
        sequence += 1;
        setLaunch({ phase: "playing", sequence });
      }
      const started = performance.now();
      const currentSequence = sequence;

      function reveal() {
        // Wait for local data, but never let a storage failure trap the user here.
        if (!isReady() && performance.now() - started < MAX_WAIT_MS) {
          timer = setTimeout(reveal, 100);
          return;
        }
        setLaunch({ phase: "leaving", sequence: currentSequence });
        timer = setTimeout(() => {
          setLaunch({ phase: "ready", sequence: currentSequence });
        }, motion.matches ? 120 : EXIT_MS);
      }

      timer = setTimeout(reveal, motion.matches ? 180 : INTRO_MS);
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        wasHidden = true;
      } else if (wasHidden) {
        wasHidden = false;
        // Returning to an installed app is a new opening; changing browser tabs isn't.
        if (standalone()) begin(true);
      }
    }

    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted && standalone()) {
        wasHidden = false;
        begin(true);
      }
    }

    begin();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  const active = launch.phase !== "ready";
  useEffect(() => {
    if (!active) return;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, [active]);

  return (
    <div className="app-launch" data-launch-phase={launch.phase}>
      <div className="app-content" inert={active} aria-hidden={active || undefined}>
        {children}
      </div>
      {active && (
        <div key={launch.sequence} className="launch-screen" role="status" aria-label={`Abrindo ${APP_NAME}`}>
          <div className="launch-atmosphere" aria-hidden="true" />
          <div className="launch-artwork" aria-hidden="true">
            <div className="launch-halo" />
            <div className="launch-orbit launch-orbit-inner" />
            <div className="launch-orbit launch-orbit-outer" />
            <div className="launch-symbol">
              <LogoMark className="launch-logo" />
            </div>
            <div className="launch-wordmark">
              <p className="launch-name">{APP_NAME}</p>
              <p className="launch-tagline">{APP_TAGLINE}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
