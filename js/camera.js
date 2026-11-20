/** 웹캠 제어 — 저장 비율 = 100:148 (인쇄 규격과 동일) */
const Camera = (() => {
  let stream = null;
  const SLOT_W = 510;
  const SLOT_H = 755; // 100:148
  const ASPECT = 100 / 148;
  const OUT_W = SLOT_W * 2;
  const OUT_H = SLOT_H * 2;

  async function start(videoEl) {
    if (stream) {
      attach(videoEl);
      return stream;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 1920 },
          aspectRatio: { ideal: ASPECT },
        },
      });
    } catch (e) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user" },
      });
    }

    attach(videoEl);
    return stream;
  }

  function attach(videoEl) {
    if (!videoEl || !stream) return;
    videoEl.srcObject = stream;
    videoEl.play().catch(() => {});
  }

  function stop() {
    if (!stream) return;
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  /** 미리보기·저장 모두 100:148 중앙 크롭 (늘림 없음) */
  function capture(videoEl, canvasEl, { mirror = true } = {}) {
    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    if (!vw || !vh) throw new Error("카메라가 준비되지 않았습니다.");

    let sx;
    let sy;
    let sw;
    let sh;
    const videoAspect = vw / vh;
    if (videoAspect > ASPECT) {
      sh = vh;
      sw = vh * ASPECT;
      sx = (vw - sw) / 2;
      sy = 0;
    } else {
      sw = vw;
      sh = vw / ASPECT;
      sx = 0;
      sy = (vh - sh) / 2;
    }

    canvasEl.width = OUT_W;
    canvasEl.height = OUT_H;
    const ctx = canvasEl.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, OUT_W, OUT_H);

    if (mirror) {
      ctx.translate(OUT_W, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H);

    return canvasEl.toDataURL("image/jpeg", 0.92);
  }

  return { start, attach, stop, capture, ASPECT, OUT_W, OUT_H, SLOT_W, SLOT_H };
})();
