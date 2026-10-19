import { createDemoSource } from "@/lib/sources/demo";
import { createStripeSource, describeStripeError } from "@/lib/sources/stripe";
import type { SaleSource } from "@/lib/sources/types";
import { accessDecision, parseHq, parseRate, parseSince } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel caps a function's lifetime; the stream says "bye" just before and the
// browser reconnects, so the cap only costs a sub-second gap.
export const maxDuration = 300;

const STREAM_MS = 270_000;
const PING_MS = 15_000;

/**
 * Server-Sent Events: hello -> backfill -> sale* -> bye.
 * Problems are sent as a "fatal" or "warn" event on a 200 stream rather than
 * an HTTP error, because EventSource hides the status and body of a failed
 * response, and the page needs to show what went wrong.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const nowSec = Math.floor(Date.now() / 1000);
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const demo = url.searchParams.get("demo") === "1" || !secretKey;
  const showAmounts = process.env.SHOW_AMOUNTS !== "false";

  const access = accessDecision({
    live: !demo,
    token: process.env.GLOBE_TOKEN?.trim() || undefined,
    provided: url.searchParams.get("key"),
    production: process.env.NODE_ENV === "production",
  });

  const encoder = new TextEncoder();
  let closed = false;
  req.signal.addEventListener("abort", () => {
    closed = true;
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const finish = () => {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      };

      if (access !== "ok") {
        send("fatal", {
          message:
            access === "token-not-configured"
              ? "Set GLOBE_TOKEN on the server before streaming real sales, then open this page with ?key=<GLOBE_TOKEN>."
              : "This globe is private. Open it with ?key=<GLOBE_TOKEN>.",
        });
        return finish();
      }

      const source: SaleSource = demo
        ? createDemoSource({ showAmounts, rate: parseRate(url.searchParams.get("rate")) })
        : createStripeSource(secretKey!, { showAmounts });

      send("hello", { mode: source.mode, showAmounts, hq: parseHq(process.env.KACHING_HQ) });

      try {
        send("backfill", await source.backfill(parseSince(url.searchParams.get("since"), nowSec)));
      } catch (err) {
        const { message } = describeStripeError(err);
        send("fatal", { message });
        return finish();
      }

      const deadline = Date.now() + STREAM_MS;
      let lastWrite = Date.now();
      let backoff = 0;
      while (!closed && Date.now() < deadline) {
        await sleep(source.pollIntervalMs + backoff, req.signal);
        if (closed) break;
        try {
          for (const sale of await source.poll()) {
            send("sale", sale);
            lastWrite = Date.now();
          }
          backoff = 0;
        } catch (err) {
          const { message, fatal } = describeStripeError(err);
          send(fatal ? "fatal" : "warn", { message });
          if (fatal) return finish();
          backoff = Math.min(30_000, backoff * 2 || 2000);
        }
        if (Date.now() - lastWrite > PING_MS) {
          write(": ping\n\n"); // keeps proxies from timing out an idle stream
          lastWrite = Date.now();
        }
      }
      send("bye", {});
      finish();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(t);
      resolve();
    };
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
