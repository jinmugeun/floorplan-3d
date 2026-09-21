// 환기 설비 전용 값의 정본(아키텍처 §11.1, 명세 §11.1). 설비는 별도 타입이 아니라 item이고,
// 전용 값만 item.props에 산다 — 그래서 배치·드래그·기즈모·레이어·견적이 제품과 똑같이 동작한다.
// three도 DOM도 스토어도 쓰지 않는 순수 모듈이다(스키마·2D·3D·풍량·패널이 모두 여기를 읽는다).

export const EQUIP_TYPES = ['hood', 'appliance', 'diffuser', 'fan', 'ventcap'];

export const EQUIP_DEFAULTS = {
  hood: { type: 'hood', no: 1, filter: false, faceVelocity: 0.5, cmh: 0, system: '' },
  appliance: { type: 'appliance', kind: 'range', heat: 'gas', hoodId: null },
  diffuser: { type: 'diffuser', symbol: '가', flow: 'supply', a: 650, b: 650, cmh: 3200 },
  fan: { type: 'fan', fanId: 'F-2', flow: 'exhaust', chamber: [700, 700, 700], cmh: 0 },
  ventcap: { type: 'ventcap', dia: 100 },
};

export const EQUIP_RANGE = { no: [1, 99], faceVelocity: [0, 5], cmh: [0, 200000], ab: [50, 3000], chamber: [100, 3000] };
export const APPLIANCE_KINDS = [['range', '가스렌지'], ['ricecooker', '취반기'], ['soupkettle', '국솥'], ['wok', '볶음솥'], ['griddle', '부침기'], ['steamer', '스티머'], ['dishwasher', '세척기']];
export const HEAT_KINDS = [['gas', '가스'], ['electric', '전기']];
export const FLOW_KINDS = [['supply', '급기'], ['exhaust', '배기']];
export const DIFFUSER_SYMBOLS = ['가', '나', '다', '라', '마', '바'];
export const VENTCAP_DIAS = [100, 150];
export const HOOD_CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
export const EQUIP_TYPE_LABELS = { hood: '후드', appliance: '조리기구', diffuser: '디퓨저', fan: '팬', ventcap: '환기캡' };
// 급기 파랑 · 배기 빨강(명세 DT-03). 덕트 도구 미리보기·2D 띠·3D 박스·패널 배지가 모두 이 한 곳을 읽는다.
export const FLOW_COLORS = { supply: '#2563eb', exhaust: '#dc2626' };

const clamp = (v, def, [min, max]) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const pickOne = (v, list, def) => (list.some(x => (Array.isArray(x) ? x[0] : x) === v) ? v : def);
const text = (v, def) => (typeof v === 'string' ? v : def);

export const isEquip = item => item?.kind === 'equipment';
export const equipType = item => (isEquip(item) && EQUIP_TYPES.includes(item?.props?.type) ? item.props.type : null);

// 후드 풍량은 사용자 입력이 아니라 늘 "후드 면적 × 면풍속 × 3600"이다(명세 §11.1).
// normalizeItem이 크기·면풍속이 바뀔 때마다 이 값으로 props.cmh를 덮어쓴다.
export function hoodCmh(item) {
  const w = Number(item?.size?.[0]) || 0, d = Number(item?.size?.[1]) || 0;
  const fv = clamp(item?.props?.faceVelocity, EQUIP_DEFAULTS.hood.faceVelocity, EQUIP_RANGE.faceVelocity);
  return Math.round(((w * d) / 1e6) * fv * 3600);
}

// 2D 심벌과 3D 스프라이트가 함께 쓰는 라벨(명세 §11.4). 조리기구는 라벨이 없다(위 후드 번호가 그 자리다).
export function equipLabel(item) {
  const t = equipType(item);
  const p = item?.props ?? {};
  if (t === 'hood') return HOOD_CIRCLED[p.no - 1] ?? String(p.no);
  if (t === 'diffuser') return p.symbol;
  if (t === 'fan') return p.fanId;
  if (t === 'ventcap') return `Ø${p.dia}`;
  return null;
}

// 모르는 종류는 후드로 떨어뜨린다(설비인데 종류를 잃은 옛 파일이 빈 props로 남지 않게).
export function normalizeEquipProps(props) {
  const src = props && typeof props === 'object' && !Array.isArray(props) ? props : {};
  const type = EQUIP_TYPES.includes(src.type) ? src.type : 'hood';
  const def = EQUIP_DEFAULTS[type];
  if (type === 'hood') {
    return {
      type, no: Math.round(clamp(src.no, def.no, EQUIP_RANGE.no)), filter: !!src.filter,
      faceVelocity: clamp(src.faceVelocity, def.faceVelocity, EQUIP_RANGE.faceVelocity),
      cmh: Math.round(clamp(src.cmh, def.cmh, EQUIP_RANGE.cmh)), system: text(src.system, def.system),
    };
  }
  if (type === 'appliance') {
    return { type, kind: pickOne(src.kind, APPLIANCE_KINDS, def.kind), heat: pickOne(src.heat, HEAT_KINDS, def.heat), hoodId: typeof src.hoodId === 'string' ? src.hoodId : null };
  }
  if (type === 'diffuser') {
    return {
      type, symbol: pickOne(src.symbol, DIFFUSER_SYMBOLS, def.symbol), flow: pickOne(src.flow, FLOW_KINDS, def.flow),
      a: Math.round(clamp(src.a, def.a, EQUIP_RANGE.ab)), b: Math.round(clamp(src.b, def.b, EQUIP_RANGE.ab)),
      cmh: Math.round(clamp(src.cmh, def.cmh, EQUIP_RANGE.cmh)),
    };
  }
  if (type === 'fan') {
    const c = Array.isArray(src.chamber) ? src.chamber : [];
    return {
      type, fanId: text(src.fanId, def.fanId).trim() || def.fanId, flow: pickOne(src.flow, FLOW_KINDS, def.flow),
      chamber: [0, 1, 2].map(i => Math.round(clamp(c[i], def.chamber[i], EQUIP_RANGE.chamber))),
      cmh: Math.round(clamp(src.cmh, def.cmh, EQUIP_RANGE.cmh)),
    };
  }
  return { type, dia: VENTCAP_DIAS.includes(Number(src.dia)) ? Number(src.dia) : def.dia };
}
