
export type BeepKind = 'success' | 'warning' | 'error';

let audioCtx: AudioContext | null = null;
let lastBeepTime = 0;

export const playBeep = (kind: BeepKind) => {
  const now = Date.now();
  if (now - lastBeepTime < 120) return; // Throttle 120ms
  lastBeepTime = now;

  try {
    // Initialize AudioContext lazily
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (Ctx) {
        audioCtx = new Ctx();
      }
    }

    if (!audioCtx) return;

    // Resume if suspended (browser policy)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    let freq = 880;
    let duration = 0.09;
    let type: OscillatorType = 'sine';

    switch (kind) {
      case 'success':
        freq = 880;
        duration = 0.09;
        type = 'sine';
        break;
      case 'warning':
        freq = 660;
        duration = 0.11;
        type = 'triangle';
        break;
      case 'error':
        freq = 330;
        duration = 0.13;
        type = 'sawtooth';
        break;
    }

    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    // Simple envelope to avoid clicking
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);

  } catch (e) {
    // Silent fail if audio not supported or other issue
    console.warn('Audio beep failed', e);
  }
};
