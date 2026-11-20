/** 1080×1920 (9:16) 합성 + 하단 문구/QR 영역 */
const Compose = (() => {
  const W = 1080;
  const H = 1920;
  const SLOT_W = 466;
  const SLOT_H = 690;
  const FOOTER_Y = 1479;

  // 사진 칸 4개 (픽셀 좌표) — 466×690, 하단 문구 영역 위(y < 1479)
  const GAP_BETWEEN_X = 40;
  const SIDE_X = Math.floor((W - SLOT_W * 2 - GAP_BETWEEN_X) / 2); // 54
  const TOP_Y = 50;
  const GAP_Y = 40;
  const X2 = SIDE_X + SLOT_W + GAP_BETWEEN_X;
  const Y2 = TOP_Y + SLOT_H + GAP_Y;

  const SLOTS = [
    { x: SIDE_X, y: TOP_Y, w: SLOT_W, h: SLOT_H },
    { x: X2, y: TOP_Y, w: SLOT_W, h: SLOT_H },
    { x: SIDE_X, y: Y2, w: SLOT_W, h: SLOT_H },
    { x: X2, y: Y2, w: SLOT_W, h: SLOT_H },
  ];

  // 하단 문구 영역 y 1479~1920 안에 QR 배치
  const QR_SIZE = 168;
  const QR_PAD = 36;
  const QR_X = W - QR_PAD - QR_SIZE;
  const QR_Y = FOOTER_Y + Math.floor(((H - FOOTER_Y) - QR_SIZE) / 2);

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
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
    let sx, sy, sw, sh;
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

  function drawBuiltinFrame(ctx, type) {
    const color = type === "black" ? "#0a0a0a" : "#f7f4ec";
    const textColor = type === "black" ? "#f0e6c8" : "#2a2418";

    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);

    // 슬롯 사이 간격 채우기 (이미 배경색)
    // 하단 문구 영역
    ctx.fillRect(0, FOOTER_Y, W, H - FOOTER_Y);

    ctx.fillStyle = textColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const textX = 48;
    const textCY = FOOTER_Y + (H - FOOTER_Y) / 2 - 10;
    ctx.font = '600 52px "Cormorant Garamond", "Noto Sans KR", serif';
    ctx.fillText("고약네컷", textX, textCY - 18);
    ctx.font = '400 24px "Noto Sans KR", sans-serif';
    ctx.globalAlpha = 0.8;
    ctx.fillText("제5회 고약인의 밤", textX, textCY + 28);
    ctx.globalAlpha = 1;
  }

  async function makeQRDataUrl(text, size = 200) {
    if (typeof QRCode === "undefined") {
      throw new Error("QRCode 라이브러리를 불러오지 못했습니다.");
    }
    return QRCode.toDataURL(text, {
      width: size,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });
  }

  async function drawQR(ctx, downloadUrl) {
    if (!downloadUrl) return;
    const qrUrl = await makeQRDataUrl(downloadUrl, 220);
    const qr = await loadImage(qrUrl);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(QR_X - 10, QR_Y - 10, QR_SIZE + 20, QR_SIZE + 20);
    ctx.drawImage(qr, QR_X, QR_Y, QR_SIZE, QR_SIZE);

    ctx.fillStyle = "#333333";
    ctx.font = '500 16px "Noto Sans KR", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("SCAN", QR_X + QR_SIZE / 2, QR_Y + QR_SIZE + 4);
  }

  /**
   * @param {string[]} photoDataUrls
   * @param {{type:string, src?:string}} frame
   * @param {string|null} downloadUrl
   */
  async function compose(photoDataUrls, frame, downloadUrl) {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = frame.type === "black" ? "#0a0a0a" : "#f7f4ec";
    if (frame.type === "custom") ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, W, H);

    const photos = await Promise.all(photoDataUrls.map(loadImage));

    let customImg = null;
    let customAsOverlay = false;
    if (frame.type === "custom" && frame.src) {
      customImg = await loadImage(frame.src);
      customAsOverlay = imageHasAlpha(customImg);
      if (!customAsOverlay) ctx.drawImage(customImg, 0, 0, W, H);
    } else {
      drawBuiltinFrame(ctx, frame.type);
    }

    SLOTS.forEach((slot, i) => {
      if (photos[i]) drawCover(ctx, photos[i], slot.x, slot.y, slot.w, slot.h);
    });

    if (frame.type === "custom" && customImg && customAsOverlay) {
      ctx.drawImage(customImg, 0, 0, W, H);
    }

    // 하단 영역에 QR 항상 할당·표시
    await drawQR(ctx, downloadUrl);

    return canvas.toDataURL("image/jpeg", 0.95);
  }

  return {
    compose,
    makeQRDataUrl,
    W,
    H,
    SLOTS,
    SLOT_W,
    SLOT_H,
    FOOTER_Y,
    QR_SIZE,
    QR_X,
    QR_Y,
  };
})();
