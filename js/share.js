/** 사진 임시 업로드 + 로컬 저장 (QR용 공개 URL) */
const PhotoShare = (() => {
  const DB_NAME = "goyak-necut";
  const STORE = "photos";

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function uid() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  async function saveLocal(dataUrl, id = uid()) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ dataUrl, createdAt: Date.now() }, id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return id;
  }

  async function loadLocal(id) {
    const db = await openDb();
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return row;
  }

  function dataUrlToBlob(dataUrl) {
    const [meta, b64] = dataUrl.split(",");
    const mime = (meta.match(/:(.*?);/) || [])[1] || "image/jpeg";
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), ms);
      promise.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        }
      );
    });
  }

  function normalizeUrl(text) {
    const url = String(text || "").trim().split(/\s+/)[0];
    if (!/^https?:\/\//i.test(url)) return null;
    // tmpfiles.org 페이지 URL → 직접 다운로드 URL
    const m = url.match(/^https?:\/\/tmpfiles\.org\/(\d+)/i);
    if (m) return `https://tmpfiles.org/dl/${m[1]}`;
    return url;
  }

  async function uploadLitterbox(blob) {
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("time", "24h");
    form.append("fileToUpload", blob, `goyak-${Date.now()}.jpg`);
    const res = await fetch("https://litterbox.catbox.moe/resources/internals/api.php", {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error("litterbox " + res.status);
    const url = normalizeUrl(await res.text());
    if (!url) throw new Error("litterbox invalid");
    return url;
  }

  async function uploadCatbox(blob) {
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("fileToUpload", blob, `goyak-${Date.now()}.jpg`);
    const res = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error("catbox " + res.status);
    const url = normalizeUrl(await res.text());
    if (!url) throw new Error("catbox invalid");
    return url;
  }

  async function uploadTmpfiles(blob) {
    const form = new FormData();
    form.append("file", blob, `goyak-${Date.now()}.jpg`);
    const res = await fetch("https://tmpfiles.org/api/v1/upload", {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error("tmpfiles " + res.status);
    const json = await res.json();
    const url = normalizeUrl(json && json.data && json.data.url);
    if (!url) throw new Error("tmpfiles invalid");
    return url;
  }

  /** 여러 호스트에 순차 업로드 → 직접 열리는 이미지 URL */
  async function uploadPublic(dataUrl) {
    // QR/모바일 전송용으로 용량 줄인 복사본
    const slim = await compressForUpload(dataUrl, 0.82, 1080);
    const blob = dataUrlToBlob(slim);
    const hosts = [uploadCatbox, uploadLitterbox, uploadTmpfiles];
    let lastErr = null;
    for (const host of hosts) {
      try {
        return await withTimeout(host(blob), 12000);
      } catch (e) {
        lastErr = e;
        console.warn("upload fail", host.name, e);
      }
    }
    throw lastErr || new Error("upload failed");
  }

  function compressForUpload(dataUrl, quality, maxW) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  /**
   * QR에는 공개 이미지 URL을 넣습니다 (다른 폰에서 바로 열림).
   * 업로드 실패 시에만 같은 기기용 download.html?v= 로 폴백.
   */
  async function publishForQr(draftDataUrl) {
    const id = uid();
    await saveLocal(draftDataUrl, id);

    try {
      const remoteUrl = await uploadPublic(draftDataUrl);
      return { id, url: remoteUrl, remote: true, remoteUrl };
    } catch (e) {
      console.warn("공개 업로드 실패 → 로컬 폴백", e);
      const base = new URL("download.html", window.location.href);
      base.search = "";
      base.searchParams.set("v", id);
      return { id, url: base.toString(), remote: false, remoteUrl: null };
    }
  }

  function triggerDownload(dataUrl, filename = "goyak-necut.jpg") {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function downloadPageUrl({ id, imgUrl } = {}) {
    const base = new URL("download.html", window.location.href);
    base.search = "";
    if (imgUrl) base.searchParams.set("img", imgUrl);
    else if (id) base.searchParams.set("v", id);
    return base.toString();
  }

  return {
    publishForQr,
    saveLocal,
    loadLocal,
    downloadPageUrl,
    triggerDownload,
    uploadPublic,
    uid,
  };
})();
