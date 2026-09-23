// 렌더샷 저장소. 클라우드가 없으므로 브라우저 IndexedDB에 둔다(dataURL은 수 MB가 될 수 있어
// localStorage로는 부족하다). IndexedDB를 쓸 수 없는 환경(node 테스트·사생활 보호 모드)에서는
// 같은 API로 동작하는 메모리 배열로 떨어진다.
export const GALLERY_DB = 'kvp-gallery';
const STORE = 'shots';
let memory = [];
let dbPromise = null;

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise(res => {
      let req;
      try { req = indexedDB.open(GALLERY_DB, 1); } catch { res(null); return; }
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(null);                    // 열리지 않으면 메모리로
      req.onblocked = () => res(null);
    });
  }
  return dbPromise;
}
// getAll()의 결과는 트랜잭션이 끝난 뒤 request.result로 읽어야 하므로 요청 객체를 들고 있다가 oncomplete에서 꺼낸다.
const tx = (db, mode, fn) => new Promise((res, rej) => {
  const t = db.transaction(STORE, mode);
  const out = fn(t.objectStore(STORE));
  t.oncomplete = () => res(out?.result ?? null);
  t.onerror = () => rej(t.error);
  t.onabort = () => rej(t.error);
});
const newId = () => `shot_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
// 한 밀리초 안에 두 장을 저장해도 최신 순 정렬이 흔들리지 않도록 savedAt을 반드시 증가시킨다.
let lastMs = 0;
const stamp = () => { const t = Math.max(Date.now(), lastMs + 1); lastMs = t; return new Date(t).toISOString(); };

export async function addShot({ name = '', dataUrl = '', width = 0, height = 0 } = {}) {
  if (!dataUrl) throw new Error('이미지가 없습니다');
  const shot = { id: newId(), name: String(name).trim() || `렌더샷 ${new Date().toLocaleString('ko-KR')}`, dataUrl, width, height, savedAt: stamp() };
  const db = await openDb();
  if (!db) { memory.push(shot); return shot; }
  await tx(db, 'readwrite', s => s.put(shot));
  return shot;
}
export async function listShots() {
  const db = await openDb();
  const all = db ? (await tx(db, 'readonly', s => s.getAll())) ?? [] : [...memory];
  return [...all].sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
}
export async function deleteShot(id) {
  const db = await openDb();
  if (!db) { memory = memory.filter(s => s.id !== id); return; }
  await tx(db, 'readwrite', s => s.delete(id));
}
export async function clearShots() {
  const db = await openDb();
  if (!db) { memory = []; return; }
  await tx(db, 'readwrite', s => s.clear());
}

// 해상도 이름(§16.9). 캡션이 짧아야 카드가 두 줄로 늘어나지 않는다 — 숫자 크기는 이름이 있는
// 세 가지만 줄이고, 그 밖에는 숫자 그대로 적는다.
export const SIZE_LABELS = { '3840×2160': '4K', '1920×1080': 'FHD', '1280×720': 'HD' };
export const sizeLabel = (width, height) => SIZE_LABELS[`${width}×${height}`] ?? `${width}×${height}`;
// "4K · 09:46". 이름(프로젝트 · 뷰)은 <b>에 따로 적으므로 여기에는 넣지 않는다(크기 중복 제거).
export function shotCaption(shot) {
  const size = sizeLabel(shot?.width, shot?.height);
  const d = shot?.savedAt ? new Date(shot.savedAt) : null;
  if (!d || Number.isNaN(d.getTime())) return size;
  const p = n => String(n).padStart(2, '0');
  return `${size} · ${p(d.getHours())}:${p(d.getMinutes())}`;
}
