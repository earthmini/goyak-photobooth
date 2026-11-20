/**
 * 프레임 원본 1080×1920 기준 합성
 * 인쇄는 100×148mm (CSS에서 맞춤)
 * 슬롯은 투명 PNG 프레임 기준
 */
const Compose = (() => {
  const W = 1080;
  const H = 1920;
  const SLOT_W = 466;
  const SLOT_H = 668;

  const SLOTS = [
    { x: 64, y: 78, w: SLOT_W, h: SLOT_H },
    { x: 550, y: 78, w: SLOT_W, h: SLOT_H },
    { x: 64, y: 754, w: SLOT_W, h: SLOT_H },
    { x: 550, y: 754, w: SLOT_W, h: SLOT_H },
  ];

  const CAPTION_Y = 1480;
  const CAPTION_H = H - CAPTION_Y;
  const QR_SIZE = 88;
  const QR_X = W - 36 - QR_SIZE;
  const QR_Y = H - 36 - QR_SIZE;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("이미지 로드 실패"));
      img.src = src;
    });
  }

  function imageHasAlpha(img) {
    const c = document.createElement("canvas");
    const w = Math.min(img.width, 80);
    const h = Math.min(img.height, 80);
    c.width = w;
    c.height = h;
    const cx = c.getContext("2d");
    cx.drawImage(img, 0, 0, w, h);
    const data = cx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 245) return true;
    }
    return false;
  }

  function drawCover(ctx, img, x, y, w, h) {
    const ir = img.width / img.height;
    const tr = w / h;
    let sx;
    let sy;
    let sw;
    let sh;
    if (ir > tr) {
      sh = img.height;
      sw = img.height * tr;
      sx = (img.width - sw) / 2;
      sy = 0;
    } else {
      sw = img.width;
      sh = img.width / tr;
      sx = 0;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  async function makeQRDataUrl(text, size = 160) {
    if (typeof QRCode !== "undefined") {
      const host = document.createElement("div");
      host.style.cssText = "position:fixed;left:-9999px;top:0;";
      document.body.appendChild(host);
      try {
        // eslint-disable-next-line no-new
        new QRCode(host, {
          text: String(text),
          width: size,
          height: size,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M,
        });
        await new Promise((r) => setTimeout(r, 30));
        const canvas = host.querySelector("canvas");
        const img = host.querySelector("img");
        if (canvas) return canvas.toDataURL("image/png");
        if (img && img.src) return img.src;
      } finally {
        host.remove();
      }
    }
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(text)}`;
  }

  async function drawQR(ctx, downloadUrl) {
    if (!downloadUrl) return false;
    try {
      const qrUrl = await makeQRDataUrl(downloadUrl, 160);
      const qr = await loadImage(qrUrl);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(QR_X - 4, QR_Y - 4, QR_SIZE + 8, QR_SIZE + 8);
      ctx.drawImage(qr, QR_X, QR_Y, QR_SIZE, QR_SIZE);
      return true;
    } catch (e) {
      console.warn("QR 그리기 실패", e);
      return false;
    }
  }

  async function compose(photoDataUrls, frame, downloadUrl) {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, W, H);

    const photos = await Promise.all(photoDataUrls.map(loadImage));
    const frameImg = frame && frame.src ? await loadImage(frame.src) : null;
    const asOverlay = frameImg ? imageHasAlpha(frameImg) : false;

    if (frameImg && !asOverlay) {
      ctx.drawImage(frameImg, 0, 0, W, H);
    }

    SLOTS.forEach((slot, i) => {
      if (photos[i]) drawCover(ctx, photos[i], slot.x, slot.y, slot.w, slot.h);
    });

    if (frameImg && asOverlay) {
      ctx.drawImage(frameImg, 0, 0, W, H);
    }

    await drawQR(ctx, downloadUrl);
    return canvas.toDataURL("image/jpeg", 0.92);
  }

  return {
    compose,
    makeQRDataUrl,
    W,
    H,
    SLOTS,
    SLOT_W,
    SLOT_H,
    CAPTION_Y,
    CAPTION_H,
    QR_SIZE,
    QR_X,
    QR_Y,
  };
})();
