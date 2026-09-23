// 3D 라벨 텍스처의 캐시와 캔버스 공장. **잎 모듈**이다(아무것도 import하지 않는다): 라벨
// 스프라이트(labels3d.js)와 접힌 점 배치(labelDots.js)가 같은 캐시를 나눠 쓰는데, 캐시가 둘 중
// 한쪽에 살면 다른 쪽이 그 파일을 도로 import해 순환이 된다(최종 리뷰 I-3).
// node 테스트에는 document가 없으므로 캔버스 공장을 주입한다.
// 같은 글자·색의 텍스처는 하나뿐이다(같은 후드 번호가 여럿이어도 텍스처는 하나다).
const cache = new Map();
let makeCanvas = null;

export function setLabelCanvasFactory(fn) { clearLabelCache(); makeCanvas = typeof fn === 'function' ? fn : null; }
export function clearLabelCache() { for (const t of cache.values()) t.dispose?.(); cache.clear(); }

function newCanvas() {
  if (makeCanvas) return makeCanvas();
  return typeof document === 'undefined' ? null : document.createElement('canvas');
}

// 캐시에 있으면 그것을, 없으면 make(canvas)로 한 번 만들어 넣는다. 캔버스도 2D 컨텍스트도 없는
// 환경에서는 make가 null을 돌려주고 캐시에는 아무것도 남지 않는다(다음에 다시 시도한다).
export function cachedTexture(key, make) {
  if (cache.has(key)) return cache.get(key);
  const c = newCanvas();
  const tex = c ? make(c) : null;
  if (tex) cache.set(key, tex);
  return tex;
}
