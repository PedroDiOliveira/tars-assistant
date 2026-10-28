/**
 * Som ambiente da respiração: um sopro suave (ruído marrom num filtro passa-baixa) que abre na inspiração e se
 * recolhe na expiração, como vento ou mar ao longe. Sintetizado com Web Audio: sem arquivos, sem dependências.
 *
 * Segue os MESMOS valores que animam a tela (`update` é chamado a cada quadro pelo relógio da sessão), então o som
 * nunca se descola do personagem. Desligado de fábrica. No iOS o áudio só pode começar dentro de um toque, por isso
 * `start` é chamado no próprio toque que inicia a sessão (ou no botão de som).
 */

export interface BreathAudio {
  /** Liga o som. Chamar dentro de um gesto do usuário. */
  start(): void;
  /** Acompanha a respiração (0..1). Barato: ignora chamadas mais frequentes que ~30 por segundo. */
  update(breath: number, presence: number): void;
  /** Desliga com fade curto. */
  stop(): void;
  dispose(): void;
}

/** Volume no pulmão vazio e cheio (com a sessão em plena presença). Ajuste fino de ouvido, no aparelho. */
const FLOOR_GAIN = 0.03;
const PEAK_GAIN = 0.16;
/** O filtro abre na inspiração: o sopro fica mais "aberto" e claro. */
const LOW_HZ = 260;
const HIGH_HZ = 1200;
/** constante de tempo das rampas, em segundos: suaviza qualquer degrau entre quadros */
const SMOOTHING = 0.08;
const MIN_UPDATE_S = 0.03;
const NOISE_SECONDS = 6;

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };
type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** Ruído marrom em loop, sem estalo na emenda: a tendência linear é removida para o fim encontrar o começo. */
function brownNoise(context: AudioContext): AudioBuffer {
  const length = Math.floor(context.sampleRate * NOISE_SECONDS);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i += 1) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  const drift = data[length - 1] - data[0];
  for (let i = 0; i < length; i += 1) data[i] -= (drift * i) / (length - 1);
  return buffer;
}

export function createBreathAudio(): BreathAudio {
  let context: AudioContext | null = null;
  let gain: GainNode | null = null;
  let filter: BiquadFilterNode | null = null;
  let source: AudioBufferSourceNode | null = null;
  let on = false;
  let lastUpdate = -1;
  let suspendTimer: ReturnType<typeof setTimeout> | undefined;

  function build(): AudioContext | null {
    if (context) return context;
    const Ctor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!Ctor) return null;
    try {
      // "ambient": mistura com a música que já estiver tocando e respeita a chave de silêncio do iPhone.
      const session = (navigator as AudioSessionNavigator).audioSession;
      if (session) session.type = "ambient";
    } catch {
      // sem Audio Session API: o navegador decide
    }
    try {
      const ctx = new Ctor();
      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 40;
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = LOW_HZ;
      lowpass.Q.value = 0.6;
      const out = ctx.createGain();
      out.gain.value = 0;
      const noise = ctx.createBufferSource();
      noise.buffer = brownNoise(ctx);
      noise.loop = true;
      noise.connect(highpass).connect(lowpass).connect(out).connect(ctx.destination);
      noise.start();
      context = ctx;
      gain = out;
      filter = lowpass;
      source = noise;
      return ctx;
    } catch {
      return null;
    }
  }

  return {
    start() {
      const ctx = build();
      if (!ctx) return;
      on = true;
      clearTimeout(suspendTimer);
      void ctx.resume().catch(() => {});
    },
    update(breath, presence) {
      if (!on || !context || !gain || !filter) return;
      const now = context.currentTime;
      if (now - lastUpdate < MIN_UPDATE_S) return;
      lastUpdate = now;
      gain.gain.setTargetAtTime(presence * (FLOOR_GAIN + (PEAK_GAIN - FLOOR_GAIN) * breath), now, SMOOTHING);
      filter.frequency.setTargetAtTime(LOW_HZ + (HIGH_HZ - LOW_HZ) * breath, now, SMOOTHING);
    },
    stop() {
      on = false;
      if (!context || !gain) return;
      const ctx = context;
      // Só rampas "a partir de agora" são agendadas, então não há nada futuro a cancelar (e cancelar dá degrau no Safari).
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      clearTimeout(suspendTimer);
      // Depois do fade, o contexto dorme (não gasta bateria parado).
      suspendTimer = setTimeout(() => {
        if (!on) void ctx.suspend().catch(() => {});
      }, 900);
    },
    dispose() {
      on = false;
      clearTimeout(suspendTimer);
      try {
        source?.stop();
      } catch {
        // já parado
      }
      void context?.close().catch(() => {});
      context = null;
      gain = null;
      filter = null;
      source = null;
      lastUpdate = -1;
    },
  };
}
