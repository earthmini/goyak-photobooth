/** 웹캠 제어 — 화면·저장 비율 9:16, 슬롯 466×690 맞춤 */
const Camera = (() => {
  let stream = null;
  const ASPECT = 9 / 16; // width / height
  const OUT_W = 466 * 2; // 고해상도 캡처 (슬롯 비율 유지)
  const OUT_H = 690 * 2;

  async function start(videoEl) {
    if (stream) {
      attach(videoEl);
      return stream;
    }

    const constraints = {
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 1080 },
        height: { ideal: 1920 },
        aspectRatio: { ideal: ASPECT },
      },
    };

    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1920 } },
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

  /**
   * 미리보기와 동일한 9:16 비율로 크롭 캡처.
   * mirror=true면 거울 모드(좌우 반전)로 저장.
   */
  function capture(videoEl, canvasEl, { mirror = true } = {}) {
    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    if (!vw || !vh) throw new Error("카메라가 준비되지 않았습니다.");

    let sx, sy, sw, sh;
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

  return { start, attach, stop, capture, ASPECT, OUT_W, OUT_H };
})();
