/**
 * 프린터 가이드 규격
 * 캔버스 1080×1620
 * 사진 칸 466×690 @ (63,77) (552,77) (63,789) (552,789)
 * 하단 문구 CAPTION 1080×104 (y=1516)
 */
const Compose = (() => {
  const W = 1080;
  const H = 1620;
  const SLOT_W = 466;
  const SLOT_H = 690;
  const CAPTION_H = 104;
  const CAPTION_Y = H - CAPTION_H; // 1516

  const SLOTS = [
    { x: 63, y: 77, w: SLOT_W, h: SLOT_H },
    { x: 552, y: 77, w: SLOT_W, h: SLOT_H },
    { x: 63, y: 789, w: SLOT_W, h: SLOT_H },
    { x: 552, y: 789, w: SLOT_W, h: SLOT_H },
  ];

  // 하단 캡션(104px) 안에 들어가는 QR
  const QR_SIZE = 80;
  const QR_X = W - 27 - QR_SIZE;
  const QR_Y = CAPTION_Y + Math.floor((CAPTION_H - QR_SIZE) / 2);

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

  function drawBuiltinFrame(ctx, type) {
    // 파스텔 블러시 / 버건디 프레임
    const color = type === "black" ? "#5C2230" : "#F6E9EF";
    const textColor = type === "black" ? "#F2D5DE" : "#7A2F3F";

    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = textColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const textX = 40;
    const textCY = CAPTION_Y + CAPTION_H / 2;
    ctx.font = '700 40px "Outfit", "Noto Sans KR", sans-serif';
    ctx.fillText("고약네컷", textX, textCY - 12);
    ctx.font = '500 18px "Noto Sans KR", sans-serif';
    ctx.globalAlpha = 0.85;
    ctx.fillText("제5회 고약인의 밤", textX, textCY + 18);
    ctx.globalAlpha = 1;
  }

  async function makeQRDataUrl(text, size = 160) {
    // qrcodejs (davidshimjs)
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

    ctx.fillStyle = frame.type === "black" ? "#5C2230" : "#F6E9EF";
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
