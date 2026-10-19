"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import GlobeCanvas, { type GlobeHandle } from "./GlobeCanvas";
import Hud, { type Status } from "./Hud";
import { formatMoney } from "@/lib/money";
import type { Sale } from "@/lib/sale";
import { playKaching, unlockAudio } from "@/lib/sound";
import { isBigSale, startOfLocalDay, summarize, type Totals } from "@/lib/stats";

/** The corner credit links here, so every screen recording points back to the project. */
const REPO_URL: string | null = "https://github.com/moatezLita/kaching";
/** On reconnect, at most this many missed sales get animated; the rest just appear. */
const REPLAY_MISSED = 10;

type Hello = { mode: "stripe" | "demo"; showAmounts: boolean; hq: { lat: number; lng: number } | null };

export default function Kaching() {
  const params = useSearchParams();
  const opts = useMemo(
    () => ({
      key: params.get("key"),
      demo: params.get("demo") === "1",
      rate: params.get("rate"),
      obs: params.get("obs") === "1",
      hud: params.get("hud") !== "0",
      brand: params.get("brand") !== "0",
      amounts: params.get("amounts") !== "0",
      sound: params.get("sound") === "1",
    }),
    [params],
  );

  const globe = useRef<GlobeHandle>(null);
  const sales = useRef(new Map<string, Sale>());
  const queue = useRef<Sale[]>([]);
  const draining = useRef(false);
  const soundOnRef = useRef(false);
  const showAmountsRef = useRef(opts.amounts);

  const [totals, setTotals] = useState<Totals>({ count: 0, byCurrency: {}, primary: null });
  const [feed, setFeed] = useState<Sale[]>([]);
  const [status, setStatus] = useState<Status>("connecting");
  const [hello, setHello] = useState<Hello | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [globeReady, setGlobeReady] = useState(false);
  const onGlobeReady = useCallback(() => setGlobeReady(true), []);

  // Without WebGL the globe never becomes ready; the counter and feed should still work.
  useEffect(() => {
    const t = window.setTimeout(onGlobeReady, 5000);
    return () => window.clearTimeout(t);
  }, [onGlobeReady]);

  const showAmounts = opts.amounts && (hello?.showAmounts ?? true);
  useEffect(() => {
    showAmountsRef.current = showAmounts;
    soundOnRef.current = soundOn;
  }, [showAmounts, soundOn]);

  useEffect(() => {
    document.documentElement.dataset.obs = opts.obs ? "1" : "0";
  }, [opts.obs]);

  const refresh = useCallback(() => {
    const all = [...sales.current.values()];
    setTotals(summarize(all));
    setFeed(all.sort((a, b) => b.created - a.created).slice(0, 6));
    globe.current?.setDots(all);
  }, []);

  // Sales arriving together are played one after another: a burst should look like a burst.
  const drain = useCallback(() => {
    if (draining.current) return;
    draining.current = true;
    const step = () => {
      const sale = queue.current.shift();
      if (!sale) {
        draining.current = false;
        return;
      }
      if (!sales.current.has(sale.id)) {
        sales.current.set(sale.id, sale);
        refresh();
        const big = isBigSale(sale);
        const label = showAmountsRef.current && sale.amount !== null ? `+${formatMoney(sale.amount, sale.currency)}` : "+1 sale";
        globe.current?.celebrate(sale, label, big);
        if (soundOnRef.current) playKaching(big);
      }
      window.setTimeout(step, queue.current.length > 20 ? 120 : 450);
    };
    step();
  }, [refresh]);

  // Connect once the globe can show sales, so the total counts up as the dots land.
  useEffect(() => {
    if (!globeReady) return;
    let es: EventSource | null = null;
    let stopped = false;
    let retry = 0;
    let retryTimer: number | undefined;
    let caughtUp = false;
    let day = startOfLocalDay();

    const connect = () => {
      if (stopped) return;
      const qs = new URLSearchParams({ since: String(day) });
      if (opts.key) qs.set("key", opts.key);
      if (opts.demo) qs.set("demo", "1");
      if (opts.rate) qs.set("rate", opts.rate);
      const source = new EventSource(`/api/stream?${qs}`);
      es = source;
      const on = <T,>(event: string, fn: (data: T) => void) =>
        source.addEventListener(event, (e) => fn(JSON.parse((e as MessageEvent<string>).data) as T));

      on<Hello>("hello", (h) => {
        setHello(h);
        setFatal(null);
      });
      on<{ sales: Sale[] }>("backfill", ({ sales: list }) => {
        const missed = list.filter((s) => !sales.current.has(s.id));
        // First load fills the globe quietly; after a reconnect, sales we missed get their moment.
        const quiet = caughtUp ? missed.slice(0, -REPLAY_MISSED) : missed;
        for (const s of quiet) sales.current.set(s.id, s);
        refresh();
        if (caughtUp) {
          queue.current.push(...missed.slice(-REPLAY_MISSED));
          drain();
        }
        caughtUp = true;
        retry = 0;
        setStatus("live");
        setWarn(null);
      });
      on<Sale>("sale", (sale) => {
        queue.current.push(sale);
        drain();
        setWarn(null);
      });
      on<{ message: string }>("warn", ({ message }) => setWarn(message));
      on<{ message: string }>("fatal", ({ message }) => {
        stopped = true;
        source.close();
        setFatal(message);
        setStatus("error");
      });
      on("bye", () => {
        source.close();
        connect();
      });
      source.onerror = () => {
        if (stopped) return;
        source.close();
        setStatus("reconnecting");
        retryTimer = window.setTimeout(connect, Math.min(15_000, 1000 * 2 ** retry++));
      };
    };
    connect();

    // At midnight the counter starts over.
    const dayTimer = window.setInterval(() => {
      const today = startOfLocalDay();
      if (today === day || stopped) return;
      day = today;
      es?.close();
      sales.current.clear();
      queue.current = [];
      caughtUp = false;
      refresh();
      connect();
    }, 30_000);

    return () => {
      stopped = true;
      es?.close();
      window.clearTimeout(retryTimer);
      window.clearInterval(dayTimer);
    };
  }, [globeReady, opts.key, opts.demo, opts.rate, refresh, drain]);

  useEffect(() => {
    if (opts.sound) void unlockAudio().then(setSoundOn); // OBS allows autoplay; browsers usually don't
  }, [opts.sound]);

  const toggleSound = async () => {
    if (soundOn) return setSoundOn(false);
    const ok = await unlockAudio();
    setSoundOn(ok);
    if (ok) playKaching();
  };

  return (
    <main className="stage">
      <GlobeCanvas ref={globe} transparent={opts.obs} hq={hello?.hq ?? null} onReady={onGlobeReady} />

      {opts.hud && <Hud totals={totals} feed={feed} status={status} mode={hello?.mode ?? null} showAmounts={showAmounts} />}

      {!(opts.obs && soundOn) && (
        <button className="sound" onClick={toggleSound} aria-pressed={soundOn}>
          {soundOn ? "Sound on" : "Turn on sound"}
        </button>
      )}

      {hello?.mode === "demo" && !opts.obs && !fatal && (
        <p className="hint">Demo data. Add a Stripe key to see your real sales.</p>
      )}
      {warn && !fatal && <p className="warn">{warn}</p>}
      {fatal && (
        <div className="fatal" role="alert">
          <strong>Can&apos;t show sales</strong>
          <p>{fatal}</p>
        </div>
      )}

      {opts.brand &&
        (REPO_URL ? (
          <a className="brand" href={REPO_URL} target="_blank" rel="noreferrer">
            made with kaching
          </a>
        ) : (
          <span className="brand">made with kaching</span>
        ))}
    </main>
  );
}
