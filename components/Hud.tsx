"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/money";
import type { Sale } from "@/lib/sale";
import { timeAgo, type Totals } from "@/lib/stats";

export type Status = "connecting" | "live" | "reconnecting" | "error";

interface Props {
  totals: Totals;
  feed: Sale[];
  status: Status;
  mode: "stripe" | "demo" | null;
  showAmounts: boolean;
}

export default function Hud({ totals, feed, status, mode, showAmounts }: Props) {
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = window.setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 15_000);
    return () => window.clearInterval(t);
  }, []);

  const primary = showAmounts ? totals.primary : null;
  const headline = useTweened(primary ? totals.byCurrency[primary].sum : totals.count);
  const count = Math.round(useTweened(totals.count));
  const others = primary
    ? Object.entries(totals.byCurrency)
        .filter(([cur]) => cur !== primary)
        .sort((a, b) => b[1].n - a[1].n)
        .slice(0, 3)
    : [];

  const badge = mode === "demo" ? "Demo" : status === "live" ? "Live" : status === "reconnecting" ? "Reconnecting" : status === "error" ? "Offline" : "Connecting";

  return (
    <div className="hud">
      <header className="hud-total">
        <span className={`badge badge-${mode === "demo" ? "demo" : status}`}>
          <i aria-hidden /> {badge}
        </span>
        <div className="total">{primary ? formatMoney(Math.round(headline), primary) : Math.round(headline).toLocaleString()}</div>
        <div className="sub">
          {count.toLocaleString()} {count === 1 ? "sale" : "sales"} today
          {others.map(([cur, { sum }]) => (
            <span key={cur}> · {formatMoney(sum, cur)}</span>
          ))}
        </div>
      </header>

      <ol className="feed" aria-live="polite">
        {feed.map((s) => (
          <li key={s.id}>
            <span className="feed-where">{s.countryName ?? "Somewhere"}</span>
            {showAmounts && s.amount !== null && <span className="feed-amount">{formatMoney(s.amount, s.currency)}</span>}
            <span className="feed-when">{timeAgo(s.created, nowSec)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Counts up to the new value instead of jumping, which is most of the fun. */
function useTweened(target: number, ms = 900): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  const current = useRef(target);
  useEffect(() => {
    from.current = current.current;
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - (1 - p) ** 3;
      current.current = from.current + (target - from.current) * eased;
      setValue(current.current);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}
