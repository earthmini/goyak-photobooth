(() => {
  "use strict";

  const TOTAL_SHOTS = 8;
  const NEED_SELECT = 4;
  const COUNTDOWN_FROM = 5;
  const RESULT_SHOW_MS = 2000;
  const CUSTOM_FRAMES_KEY = "goyak-custom-frames";

  const state = {
    printQty: 1,
    frame: null,
    frames: [],
    photos: [],
    selected: [],
    compositeDataUrl: null,
    downloadUrl: null,
    shooting: false,
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  function showScreen(id) {
    $$(".screen").forEach((el) => el.classList.remove("active"));
    const screen = $(`#screen-${id}`);
    if (screen) screen.classList.add("active");
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function setShotProgress(current, total = TOTAL_SHOTS) {
    const text = `${current}/${total}`;
    const top = $("#capture-progress");
    const overlay = $("#shot-progress");
    if (top) top.textContent = text;
    if (overlay) overlay.textContent = text;
  }

  // —— 옛 ?v= 링크는 사진 전용 download.html 로 보냄 ——
  function redirectLegacyViewer() {
    const params = new URLSearchParams(location.search);
    const id = params.get("v");
    const img = params.get("img");
    if (!id && !img) return false;
    const target = PhotoShare.downloadPageUrl({
      id: id || undefined,
      imgUrl: img || undefined,
    });
    location.replace(target);
    return true;
  }

  // —— Frames ——
  function defaultFrames() {
    return [
      { id: "white", type: "white", name: "파스텔" },
      { id: "black", type: "black", name: "버건디" },
    ];
  }

  function loadCustomFrames() {
    try {
      return JSON.parse(localStorage.getItem(CUSTOM_FRAMES_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveCustomFrames(list) {
    localStorage.setItem(CUSTOM_FRAMES_KEY, JSON.stringify(list));
  }

  function refreshFrames() {
    state.frames = [...defaultFrames(), ...loadCustomFrames()];
    renderFrameGrid();
  }

  function applyChrome(el, frame) {
    if (!el || !frame) return;
    const keep = el.id === "select-chrome" ? " select-chrome" : "";
    el.className = "frame-chrome" + keep;
    el.style.backgroundImage = "";
    // 가이드 레이아웃은 테마 배경으로 처리, 커스텀만 오버레이
    if (frame.type === "custom" && frame.src) {
      el.classList.add("custom-frame");
      el.style.backgroundImage = `url(${frame.src})`;
    }
  }

  function renderFrameGrid() {
    const grid = $("#frame-grid");
    grid.innerHTML = "";
    state.frames.forEach((frame) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `frame-card ${frame.type}`;
      if (frame.type === "custom" && frame.src) {
        card.style.backgroundImage = `url(${frame.src})`;
      }
      if (state.frame && state.frame.id === frame.id) card.classList.add("selected");
      card.innerHTML = `<span>${frame.name}</span>`;
      card.addEventListener("click", () => selectFrame(frame));
      grid.appendChild(card);
    });
  }

  function applyFrameTheme(root, frame) {
    if (!root || !frame) return;
    root.classList.toggle("theme-black", frame.type === "black");
    root.classList.toggle("theme-white", frame.type === "white");
    root.classList.toggle("theme-custom", frame.type === "custom");
  }

  function selectFrame(frame) {
    state.frame = frame;
    renderFrameGrid();
    applyChrome($("#preview-chrome"), frame);
    applyChrome($("#select-chrome"), frame);
    applyFrameTheme($("#guide-frame"), frame);
    applyFrameTheme($("#select-frame-preview"), frame);
    $("#btn-frame-next").disabled = false;
  }

  function handleFrameUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const custom = loadCustomFrames();
      const item = {
        id: `custom-${Date.now()}`,
        type: "custom",
        name: file.name.replace(/\.[^.]+$/, "").slice(0, 12) || "행사용",
        src: reader.result,
      };
      custom.push(item);
      while (custom.length > 6) custom.shift();
      saveCustomFrames(custom);
      refreshFrames();
      selectFrame(item);
    };
    reader.readAsDataURL(file);
  }

  // —— Capture ——
  async function runCaptureSequence() {
    if (state.shooting) return;
    state.shooting = true;
    state.photos = [];
    $("#btn-shoot").disabled = true;
    setShotProgress(0);

    const video = $("#capture-video");
    const canvas = $("#capture-canvas");
    const countdownEl = $("#countdown");
    const resultEl = $("#capture-result");
    const flash = $("#shutter-flash");

    BoothAudio.ensure();

    try {
      for (let i = 0; i < TOTAL_SHOTS; i++) {
        // 카운트다운·촬영 중: 현재 찍는 장 (예: 3/8)
        setShotProgress(i + 1, TOTAL_SHOTS);
        resultEl.hidden = true;
        countdownEl.hidden = false;

        for (let n = COUNTDOWN_FROM; n >= 1; n--) {
          countdownEl.textContent = String(n);
          countdownEl.style.animation = "none";
          void countdownEl.offsetWidth;
          countdownEl.style.animation = "";
          BoothAudio.countdownBeep(n);
          await sleep(1000);
        }

        countdownEl.hidden = true;
        BoothAudio.shutter();
        flash.classList.remove("on");
        void flash.offsetWidth;
        flash.classList.add("on");

        const dataUrl = Camera.capture(video, canvas, { mirror: true });
        state.photos.push(dataUrl);
        setShotProgress(i + 1, TOTAL_SHOTS);

        resultEl.src = dataUrl;
        resultEl.hidden = false;
        await sleep(RESULT_SHOW_MS);
        resultEl.hidden = true;
      }

      showSelectScreen();
    } catch (err) {
      console.error(err);
      alert("촬영 중 오류가 발생했습니다: " + (err.message || err));
      $("#btn-shoot").disabled = false;
      setShotProgress(state.photos.length);
    } finally {
      state.shooting = false;
    }
  }

  // —— Select ——
  function showSelectScreen() {
    state.selected = [];
    renderThumbs();
    updateSelectSlots();
    applyFrameTheme($("#select-frame-preview"), state.frame);
    applyChrome($("#select-chrome"), state.frame);
    Camera.stop();
    showScreen("select");
  }

  function renderThumbs() {
    const grid = $("#thumb-grid");
    grid.innerHTML = "";
    state.photos.forEach((src, index) => {
      const thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "thumb";
      thumb.dataset.index = String(index);
      thumb.innerHTML = `<img src="${src}" alt="사진 ${index + 1}" /><span class="order"></span>`;
      thumb.addEventListener("click", () => toggleSelect(index));
      grid.appendChild(thumb);
    });
    syncThumbUI();
  }

  function toggleSelect(index) {
    const pos = state.selected.indexOf(index);
    if (pos >= 0) state.selected.splice(pos, 1);
    else if (state.selected.length < NEED_SELECT) state.selected.push(index);
    syncThumbUI();
    updateSelectSlots();
  }

  function syncThumbUI() {
    $$("#thumb-grid .thumb").forEach((el) => {
      const idx = Number(el.dataset.index);
      const order = state.selected.indexOf(idx);
      el.classList.toggle("selected", order >= 0);
      el.querySelector(".order").textContent = order >= 0 ? String(order + 1) : "";
    });
    $("#select-count").textContent = `(${state.selected.length}/${NEED_SELECT})`;
    $("#btn-select-next").disabled = state.selected.length !== NEED_SELECT;
  }

  function updateSelectSlots() {
    $$("#select-frame-preview .slot").forEach((slot) => {
      const i = Number(slot.dataset.slot);
      const img = slot.querySelector("img");
      const photoIdx = state.selected[i];
      if (photoIdx !== undefined) {
        img.src = state.photos[photoIdx];
        slot.classList.add("has-photo");
      } else {
        img.removeAttribute("src");
        slot.classList.remove("has-photo");
      }
    });
  }

  async function renderQrTo(canvas, url) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = 180;
    canvas.height = 180;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 180, 180);

    if (!url) {
      ctx.fillStyle = "#888";
      ctx.font = "13px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("QR 준비 중", 90, 95);
      return;
    }

    try {
      const dataUrl = await Compose.makeQRDataUrl(url, 180);
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.crossOrigin = "anonymous";
        i.src = dataUrl;
      });
      ctx.drawImage(img, 0, 0, 180, 180);
    } catch (e) {
      console.warn(e);
      ctx.fillStyle = "#333";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("QR 생성 실패", 90, 95);
    }
  }

  // —— Compose ——
  async function runCompose() {
    showScreen("compose");
    $("#btn-compose-next").disabled = true;
    $("#compose-status").textContent = "고해상도 이미지를 생성하고 있습니다…";
    $("#compose-preview").removeAttribute("src");
    await renderQrTo($("#compose-qr-canvas"), null);

    const selectedUrls = state.selected.map((i) => state.photos[i]);

    try {
      // 1) QR 없이 먼저 합성 → 미리보기 즉시 표시
      const draft = await Compose.compose(selectedUrls, state.frame, null);
      state.compositeDataUrl = draft;
      $("#compose-preview").src = draft;
      $("#compose-status").textContent = "QR 링크를 준비하는 중…";

      // 2) 공개 이미지 URL 업로드 (다른 폰 QR용)
      $("#compose-status").textContent = "다운로드용 사진을 업로드하는 중…";
      const published = await PhotoShare.publishForQr(draft);
      state.downloadUrl = published.url;
      await renderQrTo($("#compose-qr-canvas"), state.downloadUrl);

      // 3) QR 포함 최종 합성
      $("#compose-status").textContent = "QR을 넣어 최종 합성 중…";
      const finalImage = await Compose.compose(selectedUrls, state.frame, published.url);
      await PhotoShare.saveLocal(finalImage, published.id);
      state.compositeDataUrl = finalImage;
      $("#compose-preview").src = finalImage;

      $("#compose-status").textContent = published.remote
        ? "합성이 완료되었습니다. QR을 스캔해 사진을 받으세요."
        : "합성 완료. 네트워크 업로드 실패 — 이 기기에서만 QR이 동작합니다.";
      $("#btn-compose-next").disabled = false;
    } catch (err) {
      console.error(err);
      if (state.compositeDataUrl) {
        $("#compose-preview").src = state.compositeDataUrl;
        $("#compose-status").textContent = "미리보기는 준비됨 (QR 생성 실패 가능)";
        $("#btn-compose-next").disabled = false;
      } else {
        $("#compose-status").textContent = "합성 실패: " + (err.message || err);
        alert("합성에 실패했습니다.");
      }
    }
  }

  // —— Print ——
  async function showPrintScreen() {
    showScreen("print");
    $("#print-preview").src = state.compositeDataUrl;
    $("#print-image").src = state.compositeDataUrl;
    $("#print-status").textContent = `출력 매수: ${state.printQty}장 · CP1500 / 4x6 인화지`;
    await renderQrTo($("#qr-canvas"), state.downloadUrl);
  }

  function waitAfterPrint() {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.removeEventListener("afterprint", finish);
        resolve();
      };
      window.addEventListener("afterprint", finish);
      setTimeout(finish, 2500);
    });
  }

  async function doPrint() {
    const btn = $("#btn-print");
    btn.disabled = true;
    $("#print-status").textContent = "인쇄 중… 프린트 대화상자에서 CP1500 · 4x6을 선택하세요.";

    for (let i = 0; i < state.printQty; i++) {
      $("#print-status").textContent = `인쇄 중… (${i + 1}/${state.printQty})`;
      $("#print-image").src = state.compositeDataUrl;
      window.print();
      await waitAfterPrint();
      if (i < state.printQty - 1) await sleep(800);
    }

    $("#print-status").textContent = "인쇄가 완료되었습니다. QR로 사진을 받아가세요.";
    btn.disabled = false;
  }

  function resetToStart() {
    state.photos = [];
    state.selected = [];
    state.compositeDataUrl = null;
    state.downloadUrl = null;
    state.shooting = false;
    $("#btn-shoot").disabled = false;
    setShotProgress(0);
    Camera.stop();
    showScreen("start");
  }

  function goFrame() {
    showScreen("frame");
    refreshFrames();
    if (!state.frame) selectFrame(state.frames[0]);
    else selectFrame(state.frame);
  }

  async function goCapture() {
    showScreen("capture");
    $("#btn-shoot").disabled = false;
    setShotProgress(0);
    try {
      await Camera.start($("#capture-video"));
    } catch (err) {
      alert(
        "카메라를 시작할 수 없습니다.\n아이패드는 HTTPS(또는 localhost)에서만 카메라가 동작합니다.\n" +
          (err.message || err)
      );
    }
  }

  function initQty() {
    const render = () => {
      $("#qty-value").textContent = String(state.printQty);
    };
    $("#qty-minus").addEventListener("click", () => {
      state.printQty = Math.max(1, state.printQty - 1);
      render();
    });
    $("#qty-plus").addEventListener("click", () => {
      state.printQty = Math.min(9, state.printQty + 1);
      render();
    });
    render();
  }

  async function init() {
    if (redirectLegacyViewer()) return;

    initQty();
    refreshFrames();
    setShotProgress(0);

    $("#btn-start").addEventListener("click", () => {
      BoothAudio.ensure();
      goFrame();
    });

    $$("[data-back]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-back");
        if (target === "start") {
          Camera.stop();
          showScreen("start");
        } else if (target === "frame") {
          if (state.shooting) return;
          Camera.stop();
          goFrame();
        }
      });
    });

    $("#frame-upload").addEventListener("change", (e) => {
      handleFrameUpload(e.target.files && e.target.files[0]);
      e.target.value = "";
    });

    $("#btn-frame-next").addEventListener("click", () => {
      if (!state.frame) return;
      goCapture();
    });

    $("#btn-shoot").addEventListener("click", runCaptureSequence);

    $("#btn-retake").addEventListener("click", () => {
      state.photos = [];
      state.selected = [];
      goCapture();
    });

    $("#btn-select-next").addEventListener("click", () => {
      if (state.selected.length !== NEED_SELECT) return;
      runCompose();
    });

    $("#btn-compose-next").addEventListener("click", showPrintScreen);
    $("#btn-print").addEventListener("click", doPrint);
    $("#btn-download").addEventListener("click", () => {
      if (state.compositeDataUrl) PhotoShare.triggerDownload(state.compositeDataUrl);
    });
    $("#btn-home").addEventListener("click", resetToStart);

    if (navigator.wakeLock) {
      document.addEventListener("visibilitychange", async () => {
        if (document.visibilityState === "visible") {
          try {
            await navigator.wakeLock.request("screen");
          } catch (_) {}
        }
      });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
