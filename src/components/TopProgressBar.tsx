"use client";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Slim progress bar at the top that animates while the route is changing.
// Driven by Next.js's hard-navigation events (pathname change). Imperfect for
// SSE-streamed long jobs, but gives a clear "something is happening" signal.

export function TopProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let raf: number | undefined;
    let target = 0;
    setActive(true);
    setWidth(8);
    function tick() {
      target = Math.min(target + 6, 90);
      setWidth(target);
      if (target < 90) raf = window.requestAnimationFrame(tick);
    }
    raf = window.requestAnimationFrame(tick);

    const finish = setTimeout(() => {
      setWidth(100);
      setTimeout(() => { setActive(false); setWidth(0); }, 200);
    }, 350);

    return () => {
      if (raf != null) window.cancelAnimationFrame(raf);
      clearTimeout(finish);
    };
  }, [pathname, searchParams]);

  if (!active) return null;
  return (
    <div className="pointer-events-none fixed left-0 top-0 z-[200] h-0.5 w-full">
      <div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${width}%` }} />
    </div>
  );
}
