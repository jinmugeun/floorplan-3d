// 덕트 정규화(명세 §14의 duct JSON, 아키텍처 §11.2). schema.js가 300줄을 넘지 않게 여기로 나눴다.
// schema.js ↔ ductSchema.js는 서로를 import하지만(uid ↔ normalizeDuct) 둘 다 "함수가 불릴 때"만
// 상대 바인딩을 읽으므로 모듈 평가 시점에는 문제가 없다(floorOps ↔ itemOps와 같은 규칙).
import { uid } from './schema.js';

export const DUCT_DEFAULT_SEGMENT = { w: 500, h: 300, z: 2900 };
export const DUCT_RANGE = { w: [50, 3000], h: [50, 3000], z: [0, 8000], t: [0, 1] };
export const DAMPER_TYPES = ['VD', 'FVD'];

const num = (v, def, [min, max]) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const arr = v => (Array.isArray(v) ? v : []);
const pt = v => (Array.isArray(v) && Number.isFinite(Number(v[0])) && Number.isFinite(Number(v[1])) ? [Number(v[0]), Number(v[1])] : null);
const segOf = (s, prev) => ({ w: num(s?.w, prev.w, DUCT_RANGE.w), h: num(s?.h, prev.h, DUCT_RANGE.h), z: num(s?.z, prev.z, DUCT_RANGE.z) });

// 점 2개 미만이면 덕트가 아니다(null → 호출자가 버린다).
// segments는 늘 points.length - 1개다: 모자라면 앞 구간을 복제하고(처음이면 기본 단면), 남으면 잘라 낸다.
// itemIds를 주면 없는 설비를 가리키는 연결을 버린다(불러오기·설비 삭제 뒤 정리).
export function normalizeDuct(d, { itemIds = null } = {}) {
  const src = d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  const points = arr(src.points).map(pt).filter(Boolean);
  if (points.length < 2) return null;
  const segments = [];
  let prev = { ...DUCT_DEFAULT_SEGMENT };
  for (let i = 0; i < points.length - 1; i++) { prev = segOf(arr(src.segments)[i], prev); segments.push(prev); }

  const seen = new Set();
  // 범위 밖 점 번호는 클램프하지 않고 버린다(마지막 점으로 조용히 옮기면 도면을 잘못 읽는다).
  // num(...)은 유한한 수를 늘 min..max로 끌어당기므로 여기서는 쓰지 않는다.
  const connections = arr(src.connections).map(c => {
    const id = c?.itemId ?? c?.item;                       // 명세 §14는 item, 앱 안에서는 itemId를 쓴다
    const pi = Number(c?.point);
    return { point: Number.isInteger(pi) ? pi : -1, itemId: typeof id === 'string' && id ? id : null };
  }).filter(c => {
    if (!c.itemId || c.point < 0 || c.point > points.length - 1) return false;
    if (itemIds && !itemIds.has(c.itemId)) return false;
    if (seen.has(c.point)) return false;                   // 한 점에 연결은 하나다
    seen.add(c.point);
    return true;
  });

  // 댐퍼의 구간 번호도 같다: 없는 구간을 가리키면 버린다(클램프하면 마지막 구간으로 조용히 옮겨 붙는다).
  const dampers = arr(src.dampers).map(x => {
    const raw = Number(x?.segment);
    const si = Number.isInteger(raw) ? raw : -1;
    const base = segments[si] ?? DUCT_DEFAULT_SEGMENT;
    const m = typeof x?.size === 'string' ? /^\s*(\d+)\s*[x×X]\s*(\d+)\s*$/.exec(x.size) : null;  // 명세 §14의 "550x450"
    return {
      segment: si, t: num(x?.t, 0.5, DUCT_RANGE.t), type: DAMPER_TYPES.includes(x?.type) ? x.type : 'VD',
      w: num(x?.w ?? (m ? m[1] : undefined), base.w, DUCT_RANGE.w),
      h: num(x?.h ?? (m ? m[2] : undefined), base.h, DUCT_RANGE.h),
    };
  }).filter(x => x.segment >= 0 && x.segment < segments.length);

  return {
    id: typeof src.id === 'string' && src.id ? src.id : uid('d'),
    kind: src.kind === 'supply' ? 'supply' : 'exhaust',
    system: typeof src.system === 'string' ? src.system : '',
    points, segments, connections, dampers,
    locked: !!src.locked, hidden: !!src.hidden,
    estimated: !!src.estimated,      // 도면에서 경로를 읽지 못해 사람이 추정해 그린 덕트(샘플 표시용)
  };
}

export function createDuct(patch = {}) {
  return normalizeDuct({ id: uid('d'), kind: 'exhaust', system: '', points: [[0, 0], [1000, 0]], ...patch });
}
