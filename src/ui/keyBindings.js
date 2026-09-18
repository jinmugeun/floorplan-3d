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
// 그 키를 이미 쓰는 다른 동작(자기 자신은 충돌이 아니다).
export function conflictAction(keymap, key, action) {
  const other = buildTable(keymap).get(norm(key));
  return other && other !== action ? other : null;
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
