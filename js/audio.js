/** 카운트다운·셔터 효과음 (Web Audio API) */
const BoothAudio = (() => {
  let ctx = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, duration, type = "sine", gain = 0.18) {
    const ac = ensure();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + duration);
  }

  function countdownBeep(n) {
    // 5~2: 낮은 비프, 1: 높은 비프
    if (n <= 1) tone(880, 0.22, "square", 0.16);
    else tone(520, 0.15, "sine", 0.14);
  }

  function shutter() {
    const ac = ensure();
    const bufferSize = ac.sampleRate * 0.08;
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const src = ac.createBufferSource();
    const g = ac.createGain();
    src.buffer = buffer;
    g.gain.value = 0.35;
    src.connect(g);
    g.connect(ac.destination);
    src.start();
    tone(180, 0.08, "triangle", 0.1);
  }

  return { ensure, countdownBeep, shutter };
})();
