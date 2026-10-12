// 역할표(2026-10-12 · 계획 12 Task 9): 레이어·블록·문자의 역할을 **규칙 대신** 정하는 표의 형식과 검사.
// 왜: 사무소마다 다른 이름 관례(내곡중 `건축` 한 레이어 · 신상중 창 `WID` · "보냉고 양문"은 문이 아니다)를 키워드 사전으로 쫓는 데 한계가
// 있다. 표는 도구(tools/dxf-corpus/llm-roles.mjs — 언어 모델, 또는 사람이 손으로 쓴 드라이런)가 도면당 한 번 만들고, 앱·점수판은
// 파싱 옵션(`{ type: 'parse', buf, fileName, roles }`)으로 받는다. **기하는 그대로 결정적이다** — 표는 역할 이름만 바꾼다.
// 앱 번들에는 API 호출이 없다(키 노출 · 서버 없음): 이 파일은 형식 검사뿐이다.
//
// 형식(tools/dxf-corpus/README.md "역할표"):
//   { layers: { <레이어>: wall|opening|text|dim|equip|mep|grid|hatch|rail|other },
//     blocks: { <블록>: { kind: door|window|pocket|slide|pass|equip|symbol|column|other, width: mm|null } },  (pass = 문 없는 통로 · 2026-10-12 Task 3 리뷰)
//     texts:  { <글자 그대로(앞뒤 공백 무시)>: room|area|title|label|axis|other } }
// 다른 최상위 칸(meta 등)은 보지 않는다. 표에 없는 이름은 규칙으로 간다. 잘못된 칸은 버리고(그 이름은 규칙으로) 이유를 errors에 적는다.
import { ROLE_LABEL } from './classify.js';

export const LAYER_ROLES = Object.freeze(Object.keys(ROLE_LABEL));
export const BLOCK_KINDS = Object.freeze(['door', 'window', 'pocket', 'slide', 'pass', 'equip', 'symbol', 'column', 'other']);
export const TEXT_ROLES = Object.freeze(['room', 'area', 'title', 'label', 'axis', 'other']);

const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);

// raw(JSON에서 읽은 그대로) → { table: { layers: Map, blocks: Map, texts: Map } | null, errors: [문장] }.
// Map을 쓰는 까닭: 레이어·글자 이름은 아무 문자열이나 된다(`constructor`·`__proto__`도) — 평범한 객체의 프로토타입과 섞이지 않게.
export function checkRoles(raw) {
  if (!isObj(raw)) return { table: null, errors: ['역할표가 객체가 아니다'] };
  const errors = [], table = { layers: new Map(), blocks: new Map(), texts: new Map() };
  const section = key => {
    if (raw[key] == null) return [];
    if (!isObj(raw[key])) { errors.push(`${key}는 객체여야 한다`); return []; }
    return Object.entries(raw[key]);
  };
  for (const [name, role] of section('layers')) {
    if (LAYER_ROLES.includes(role)) table.layers.set(name, role);
    else errors.push(`layers["${name}"]: 모르는 역할 ${JSON.stringify(role)}`);
  }
  for (const [name, v] of section('blocks')) {
    const width = v?.width ?? null;
    if (!isObj(v) || !BLOCK_KINDS.includes(v.kind)) errors.push(`blocks["${name}"]: 모르는 종류 ${JSON.stringify(v?.kind ?? v)}`);
    else if (width !== null && !(typeof width === 'number' && Number.isFinite(width) && width > 0)) errors.push(`blocks["${name}"]: 폭은 양수 mm 또는 null ${JSON.stringify(width)}`);
    else table.blocks.set(name, { kind: v.kind, width });
  }
  for (const [text, role] of section('texts')) {
    if (TEXT_ROLES.includes(role)) table.texts.set(text.trim(), role);
    else errors.push(`texts["${text}"]: 모르는 역할 ${JSON.stringify(role)}`);
  }
  return { table, errors };
}
