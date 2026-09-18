// 단축키 재지정. 저장 형태는 { [action]: keys[] }이고 브라우저(localStorage)에만 남는다.
// keymap.js의 KEYMAP이 기본값이고, 여기서 만든 표를 setTable로 넣어 핸들러가 쓰게 한다.
import { KEYMAP } from './keymap.js';

export const KEYMAP_KEY = 'kvp.keymap';
const ACTIONS = new Set(KEYMAP.filter(e => e.action).map(e => e.action));

function valid(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  for (const [action, keys] of Object.entries(o)) {
    if (!ACTIONS.has(action)) return false;
    if (!Array.isArray(keys) || !keys.length) return false;
    if (!keys.every(k => typeof k === 'string' && k.trim())) return false;
  }
  return true;
}

export function loadOverrides() {
  try {
    const o = JSON.parse(localStorage.getItem(KEYMAP_KEY) ?? '{}');
    return valid(o) ? o : {};
  } catch { return {}; }
}
export const saveOverrides = o => { try { localStorage.setItem(KEYMAP_KEY, JSON.stringify(o)); } catch { /* 저장 불가 */ } };
export const reset = () => { try { localStorage.removeItem(KEYMAP_KEY); } catch { /* 저장 불가 */ } };

// KEYMAP 사본을 만들어 지정된 동작의 keys만 갈아 끼운다(원본 배열은 절대 건드리지 않는다).
// 삭제(Delete/Backspace)처럼 키가 여러 개인 동작도 예외 없이 새 키 "하나"로 전부 바뀐다(추가가 아니라 교체).
export const effectiveKeymap = (overrides = loadOverrides()) =>
  KEYMAP.map(e => ({ ...e, keys: e.action && overrides[e.action] ? [...overrides[e.action]] : [...e.keys] }));

// keymap.js의 토큰 규칙과 같아야 한다(대소문자 무시, 빈칸 제거).
export const norm = k => String(k).trim().toLowerCase().replace(/\s+/g, '');
export function buildTable(keymap) {
  const t = new Map();
  for (const e of keymap) if (e.action) for (const k of e.keys) t.set(norm(k), e.action);
  return t;
}
// keydown 이벤트를 KEYMAP 표기(예: 'Ctrl+Shift+Z')로 바꾼다. norm(keyLabel(ev)) === tokenOf(ev)여야 한다.
export function keyLabel(ev) {
  const raw = String(ev.key ?? '');
  const k = raw === 'Escape' ? 'Esc' : raw === ' ' ? 'Space' : raw.length === 1 ? raw.toUpperCase() : raw;
  const ctrl = !!(ev.ctrlKey || ev.metaKey);
  return `${ctrl ? 'Ctrl+' : ''}${ctrl && ev.shiftKey ? 'Shift+' : ''}${k}`;
}

// KEYMAP 표(action이 있는 행)에는 없지만 다른 곳에서 이미 그 키를 소비하는 키들.
// - keymap.js의 itemCombo가 선택이 있을 때 먼저 가져가는 조합키(Ctrl+C/V/H/L/G, Ctrl+Shift+G, Alt+H/V/R/A/C/X)
// - 도구 단계에서 먼저 소비하는 키(방향키로 제품 이동, Q로 제품 90° 회전 — selectTool.js)
// 이 키들로 재지정하면 표에는 저장되지만 선택이 있는 동안은 절대 눌리지 않으므로 conflictAction에서 충돌로 본다.
// (1인칭에서 걷는 동안의 W/A/S/D/Q/E는 여기 포함하지 않는다 — 1인칭 모드에서는 도구/아이템 키를 아예 주지 않는다.)
export const RESERVED_KEYS = [
  { key: 'ctrl+c', label: '제품 복사' },
  { key: 'ctrl+v', label: '제품 붙여넣기' },
  { key: 'ctrl+h', label: '제품 숨김' },
  { key: 'ctrl+l', label: '제품 잠금' },
  { key: 'ctrl+g', label: '제품 그룹' },
  { key: 'ctrl+shift+g', label: '제품 그룹 해제' },
  { key: 'alt+h', label: '제품 좌우 반전' },
  { key: 'alt+v', label: '제품 상하 반전' },
  { key: 'alt+r', label: '제품 상대이동' },
  { key: 'alt+a', label: '제품 직선 배열 복사' },
  { key: 'alt+c', label: '제품 원형 배열 복사' },
  { key: 'alt+x', label: '제품 회전 배열 복사' },
  { key: 'arrowleft', label: '제품 이동' },
  { key: 'arrowright', label: '제품 이동' },
  { key: 'arrowup', label: '제품 이동' },
  { key: 'arrowdown', label: '제품 이동' },
  { key: 'q', label: '제품 90° 회전' },
];
const RESERVED_MAP = new Map(RESERVED_KEYS.map(r => [r.key, r.label]));

// 그 키를 이미 쓰는 다른 동작(자기 자신은 충돌이 아니다), 또는 RESERVED_KEYS가 이미 가져간 키.
// 표 충돌은 action 이름을, 예약 키 충돌은 한글 라벨을 그대로 돌려준다 — 둘 다 labelOf에 넣으면
// (KEYMAP에 없는 문자열은 그대로 반환하므로) toast에 바로 쓸 수 있는 라벨이 나온다.
export function conflictAction(keymap, key, action) {
  const token = norm(key);
  const other = buildTable(keymap).get(token);
  if (other && other !== action) return other;
  return RESERVED_MAP.get(token) ?? null;
}
export const labelOf = action => KEYMAP.find(e => e.action === action)?.label ?? action;

export const exportJson = () => JSON.stringify(loadOverrides(), null, 2);
export function importJson(text) {
  let o;
  try { o = JSON.parse(text); } catch { throw new Error('JSON 파일이 아닙니다'); }
  if (!valid(o)) throw new Error('단축키 파일 형식이 아닙니다');
  saveOverrides(o);
  return o;
}
