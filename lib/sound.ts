// The cash-register sound is synthesised, so there is no audio file to license
// or load. Browsers only allow audio after a click, hence unlockAudio().

let ctx: AudioContext | null = null;
let lastPlayed = 0;

export async function unlockAudio(): Promise<boolean> {
  try {
    ctx ??= new AudioContext();
    if (ctx.state !== "running") await ctx.resume();
    return ctx.state === "running";
  } catch {
    return false;
  }
}

/** "Ka" (drawer clunk: filtered noise) then "ching" (bell partials struck twice). */
export function playKaching(big = false): void {
  if (!ctx || ctx.state !== "running") return;
  const nowMs = performance.now();
  if (nowMs - lastPlayed < 140) return; // a burst of sales shouldn't turn into noise
  lastPlayed = nowMs;

  const ac = ctx;
  const t = ac.currentTime + 0.01;
  const master = ac.createGain();
  master.gain.value = 0.22;
  master.connect(ac.destination);

  const len = Math.floor(ac.sampleRate * 0.06);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const noise = ac.createBufferSource();
  noise.buffer = buf;
  const band = ac.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1800;
  band.Q.value = 0.9;
  noise.connect(band).connect(master);
  noise.start(t);

  const ring = big ? 1.7 : 1;
  const strike = (at: number, gain: number) => {
    for (const [freq, level, decay] of [
      [2093, 1, 0.9],
      [2637, 0.6, 0.7],
      [3136, 0.45, 0.55],
      [4186, 0.25, 0.4],
    ]) {
      const osc = ac.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const env = ac.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(gain * level, at + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0001, at + decay * ring);
      osc.connect(env).connect(master);
      osc.start(at);
      osc.stop(at + decay * ring + 0.05);
    }
  };
  strike(t + 0.05, 0.5);
  strike(t + 0.13, 0.35);
}
