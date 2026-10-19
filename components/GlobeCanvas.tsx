"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { GlobeInstance } from "globe.gl";
import type { FeatureCollection } from "geojson";
import { dropDegeneratePolygons } from "@/lib/geo";
import type { Sale } from "@/lib/sale";

export interface GlobeHandle {
  /** Every sale of the day, as a resting dot. */
  setDots(sales: Sale[]): void;
  /** Ripple, floating label, optional arc to HQ, and a camera glance. */
  celebrate(sale: Sale, label: string, big: boolean): void;
}

interface Props {
  ref?: Ref<GlobeHandle>;
  transparent: boolean;
  hq: { lat: number; lng: number } | null;
  /** Fires once the globe has drawn its first frames and can show sales. */
  onReady?: () => void;
}

type Point = { lat: number; lng: number };
type Effect = Point & { key: number };
type Pop = Effect & { text: string; big: boolean };
type Arc = { startLat: number; startLng: number; endLat: number; endLng: number; key: number };

const GOLD = "#ffd166";
const EFFECT_MS = 2800;
const FOCUS_EVERY_MS = 4000;

export default function GlobeCanvas({ ref, transparent, hq, onReady }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<GlobeInstance | null>(null);
  const dots = useRef<Point[]>([]);
  const rings = useRef<Effect[]>([]);
  const pops = useRef<Pop[]>([]);
  const arcs = useRef<Arc[]>([]);
  const hqRef = useRef(hq);
  const seq = useRef(0);
  const lastFocus = useRef(0);
  const resumeRotate = useRef<number | undefined>(undefined);

  const onReadyRef = useRef(onReady);
  useEffect(() => {
    hqRef.current = hq;
    onReadyRef.current = onReady;
  }, [hq, onReady]);

  useImperativeHandle(
    ref,
    () => ({
      setDots(sales) {
        dots.current = sales.flatMap((s) => (s.lat === null || s.lng === null ? [] : [{ lat: s.lat, lng: s.lng }]));
        world.current?.pointsData(dots.current);
      },

      celebrate(sale, label, big) {
        const w = world.current;
        if (!w || sale.lat === null || sale.lng === null) return;
        const key = ++seq.current;
        const at = { lat: sale.lat, lng: sale.lng };

        rings.current = [...rings.current, { ...at, key }];
        pops.current = [...pops.current, { ...at, key, text: label, big }];
        w.ringsData(rings.current).htmlElementsData(pops.current);
        const home = hqRef.current;
        if (home) {
          arcs.current = [...arcs.current, { startLat: at.lat, startLng: at.lng, endLat: home.lat, endLng: home.lng, key }];
          w.arcsData(arcs.current);
        }

        window.setTimeout(() => {
          rings.current = rings.current.filter((r) => r.key !== key);
          pops.current = pops.current.filter((p) => p.key !== key);
          arcs.current = arcs.current.filter((a) => a.key !== key);
          w.ringsData(rings.current).htmlElementsData(pops.current).arcsData(arcs.current);
        }, EFFECT_MS);

        // Turn towards the sale, but not on every one of a burst.
        const now = Date.now();
        if (now - lastFocus.current < FOCUS_EVERY_MS) return;
        lastFocus.current = now;
        const controls = w.controls();
        controls.autoRotate = false;
        const { altitude } = w.pointOfView();
        w.pointOfView({ lat: Math.max(-45, Math.min(55, at.lat)), lng: at.lng, altitude }, 1400);
        window.clearTimeout(resumeRotate.current);
        resumeRotate.current = window.setTimeout(() => {
          controls.autoRotate = true;
        }, 3500);
      },
    }),
    [],
  );

  useEffect(() => {
    const el = host.current!;
    let disposed = false;
    let instance: GlobeInstance | null = null;
    const onResize = () => instance?.width(el.clientWidth).height(el.clientHeight);

    (async () => {
      const [{ default: Globe }, { MeshPhongMaterial, Color }, { feature }, atlasModule] = await Promise.all([
        import("globe.gl"),
        import("three"),
        import("topojson-client"),
        import("world-atlas/countries-110m.json"),
      ]);
      if (disposed) return;

      const atlas = ((atlasModule as { default?: unknown }).default ?? atlasModule) as Parameters<typeof feature>[0];
      const countries = dropDegeneratePolygons(
        (feature(atlas, atlas.objects.countries) as FeatureCollection).features.filter(
          (f) => f.id !== "010", // Antarctica: nobody buys from there and it eats the bottom of the view
        ),
      );

      const w = new Globe(el, { rendererConfig: { antialias: true, alpha: true } })
        .width(el.clientWidth)
        .height(el.clientHeight)
        .backgroundColor(transparent ? "rgba(0,0,0,0)" : "#05060a")
        .globeMaterial(
          new MeshPhongMaterial({
            color: new Color("#0c0f22"),
            emissive: new Color("#060818"),
            shininess: 6,
            transparent,
            opacity: transparent ? 0.92 : 1,
          }),
        )
        .showAtmosphere(true)
        .atmosphereColor("#7b6cff")
        .atmosphereAltitude(0.2)
        .hexPolygonsData(countries)
        .hexPolygonResolution(3)
        .hexPolygonMargin(0.4)
        .hexPolygonUseDots(true)
        .hexPolygonColor(() => "rgba(170, 180, 255, 0.45)")
        .pointsData(dots.current)
        .pointAltitude(0.012)
        .pointRadius(0.42)
        .pointColor(() => GOLD)
        .pointsMerge(true)
        .ringsData([])
        .ringColor(() => (t: number) => `rgba(255, 209, 102, ${(1 - t).toFixed(3)})`)
        .ringMaxRadius(6)
        .ringPropagationSpeed(4)
        .ringRepeatPeriod(900)
        .arcsData([])
        .arcColor(() => ["rgba(255, 209, 102, 0.05)", GOLD])
        .arcStroke(0.5)
        .arcDashLength(0.5)
        .arcDashGap(2)
        .arcDashInitialGap(1)
        .arcDashAnimateTime(1800)
        .htmlElementsData([])
        .htmlAltitude(0.03)
        .htmlTransitionDuration(0)
        .htmlElement((d) => {
          // globe.gl owns the outer element's transform; the inner one animates.
          const pop = d as Pop;
          const outer = document.createElement("div");
          const inner = document.createElement("span");
          inner.className = pop.big ? "kc-pop kc-pop-big" : "kc-pop";
          inner.textContent = pop.text;
          outer.appendChild(inner);
          return outer;
        });

      w.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 2));
      const controls = w.controls();
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.45;
      w.pointOfView({ lat: hqRef.current?.lat ?? 25, lng: hqRef.current?.lng ?? 0, altitude: 2.3 }, 0);

      instance = w;
      world.current = w;
      // Laying out the hex dots blocks the main thread for a moment on the first
      // render. Wait it out so the first sales aren't celebrated mid-freeze.
      requestAnimationFrame(() => requestAnimationFrame(() => !disposed && onReadyRef.current?.()));
      window.addEventListener("resize", onResize);
    })();

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      window.clearTimeout(resumeRotate.current);
      instance?._destructor();
      world.current = null;
      el.replaceChildren();
    };
  }, [transparent]);

  return <div ref={host} className="globe" aria-label="Globe of today's sales" />;
}
