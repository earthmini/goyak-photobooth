/** 서버 없이 사진 저장·다운로드 URL 생성 */
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

  /** 사진만 받는 전용 페이지 URL (부스 웹사이트 아님) */
  function downloadPageUrl({ id, imgUrl } = {}) {
    const base = new URL("download.html", window.location.href);
    base.search = "";
    base.hash = "";
    if (imgUrl) base.searchParams.set("img", imgUrl);
    else if (id) base.searchParams.set("v", id);
    return base.toString();
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

  async function uploadTemp(dataUrl) {
    const blob = dataUrlToBlob(dataUrl);
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("time", "24h");
    form.append("fileToUpload", blob, `goyak-${Date.now()}.jpg`);

    const res = await fetch("https://litterbox.catbox.moe/resources/internals/api.php", {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error("upload failed");
    const text = (await res.text()).trim();
    if (!/^https?:\/\//i.test(text)) throw new Error("invalid upload response");
    return text;
  }

  /**
   * QR용 URL: 항상 download.html (사진만)
   * - 원격 업로드 성공 시 download.html?img=원격주소
   * - 실패 시 download.html?v=로컬ID
   */
  async function publishForQr(draftDataUrl) {
    const id = uid();
    await saveLocal(draftDataUrl, id);

    let remoteUrl = null;
    try {
      remoteUrl = await withTimeout(uploadTemp(draftDataUrl), 8000);
    } catch (e) {
      console.warn("공개 업로드 생략", e);
    }

    const url = remoteUrl
      ? downloadPageUrl({ imgUrl: remoteUrl })
      : downloadPageUrl({ id });

    return { id, url, remote: Boolean(remoteUrl), remoteUrl };
  }

  function triggerDownload(dataUrl, filename = "goyak-necut.jpg") {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /** iOS/Android 문자 앱에 다운로드 링크 넣기 */
  function openSmsWithLink(downloadUrl, phone = "") {
    const body = encodeURIComponent("고약네컷 사진 받기: " + downloadUrl);
    const phonePart = phone.replace(/[^0-9+]/g, "");
    const href = phonePart
      ? `sms:${phonePart}&body=${body}`
      : `sms:&body=${body}`;
    window.location.href = href;
  }

  return {
    publishForQr,
    saveLocal,
    loadLocal,
    downloadPageUrl,
    triggerDownload,
    openSmsWithLink,
    uid,
  };
})();
