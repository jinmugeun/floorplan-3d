// 레이어 역할 판정(§18.2): **키워드는 사전 확률, 도형이 증거, 사용자가 심판**.
// 이 도면의 WALL·CON·DOR·DOOR·A-WALL·WALL-FIN은 정의만 있고 엔티티가 0개이고, 실제 벽은
// WAL·WAL-2·기존·FIN·ST-PL·BLO·COL 일곱에 흩어져 있다 — 이름만 믿는 구현은 벽 0개를 반환한다.

// 앞의 규칙이 이긴다. 비교는 소문자 부분일치다.
export const LAYER_RULES = [
  { role: 'dim',     keys: ['dim', '치수', 'az-leal', 'az-leat', 'az-cutl', 'tol'] },
  { role: 'text',    keys: ['text', 'txt', 'note', '문자', 'title', 'number', 'a-she', 'revision', 'sym-t'] },
  { role: 'opening', keys: ['win', 'dor', 'door', '창호', '창', '문', '개구', 'wind', 'wd'] },
  { role: 'equip',   keys: ['급식', '기구', 'fur', 'fu-', 'equip', '가구', '설비', '후드', 'hood', 'kitchen', 'sit', '주방'] },
  { role: 'mep',     keys: ['전기', 'ele', 'el-line', 'elline', '급배수', '덕트', 'duct', 'hvac', '트렌치', 'pipe'] },
  { role: 'grid',    keys: ['cen', 'grid', 'axis', 'a-guide', 'guide', 'defpoints', 'polycen'] },
  { role: 'hatch',   keys: ['hat', 'poche', '해치'] },
  { role: 'wall',    keys: ['wal', 'wall', '벽', 'con', 'col', '기둥', 'blo', '벽체', 'a-wall', 'st-pl', 'structure', '구조', '기존', 'fin', '마감'] },
];
export const ROLE_LABEL = { wall: '벽', opening: '개구부', equip: '기구', mep: '설비', dim: '치수', text: '문자', grid: '축선', hatch: '해치', other: '기타' };

export const classifyLayer = name => {
  const n = String(name).toLowerCase();
  for (const r of LAYER_RULES) if (r.keys.some(k => n.includes(k))) return r.role;
  return 'other';
};

// 도형 신호는 **셋만** 키워드를 뒤집는다 — 증거 없는 승격 규칙을 더하지 않는다.
// 사전 검토 C-3의 두 정정이 여기 있다:
//  ⓐ 이름이 개구부 키워드를 맞히면 도형 통계가 뒤집지 못한다. 실파일의 `04창호`는 선분 3,069개에
//     길이 중앙값 12.5 mm(문 블록 안의 손잡이·모따기 디테일)라 ③에 걸려 hatch가 되고, 그러면
//     roleLayers(rows, 'opening')에서 빠져 **문·창의 재료가 buildOpenings에 도달하지 못한다**.
//  ⓑ ③은 이름이 아무것도 맞히지 못한 레이어에만 쓴다. §18.2가 근거로 든 SYM(15,772 선분 ·
//     중앙값 1.0 mm)이 바로 keyRole 'other'이고, `급식기구`(16,789 · 7.1 mm)는 이름대로 equip이다.
function shapeRole(r) {
  if (r.keyRole === 'opening') return 'opening';
  if (r.dims > 0) return 'dim';
  if (r.texts > r.segs) return 'text';
  if (r.keyRole === 'other' && r.segs > 1000 && r.medianSeg < 20) return 'hatch';
  return r.keyRole;
}

// 이 배열이 §18.6 체크리스트의 유일한 원천이다. 레이어 테이블에 없는데 도형만 있는 이름도
// 행을 얻는다(블록 안에서만 쓰인 레이어).
export function layerStats(doc, ex) {
  const rows = new Map();
  const get = name => {
    let r = rows.get(name ?? '0');
    if (!r) {
      r = { name: name ?? '0', color: 7, off: false, frozen: false, role: 'other', keyRole: 'other',
        segs: 0, arcs: 0, circles: 0, texts: 0, dims: 0, inserts: 0, lenM: 0, medianSeg: 0, lens: [] };
      rows.set(r.name, r);
    }
    return r;
  };
  for (const [name, l] of doc.layers ?? new Map()) {
    const r = get(name);
    r.color = l.color ?? 7;
    r.frozen = !!(l.flags & 1);
    r.off = r.color < 0 || r.frozen;      // §18.2: 꺼짐도 동결도 무조건 체크 해제다(배지는 하나)
  }
  for (const s of ex.segs ?? []) { const r = get(s.layer); r.segs++; r.lens.push(Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])); }
  for (const a of ex.arcs ?? []) get(a.layer).arcs++;
  for (const c of ex.circles ?? []) get(c.layer).circles++;
  for (const t of ex.texts ?? []) get(t.layer).texts++;
  for (const d of ex.dims ?? []) get(d.layer).dims++;
  for (const i of ex.inserts ?? []) get(i.layer).inserts++;
  const out = [];
  for (const r of rows.values()) {
    r.lens.sort((a, b) => a - b);
    r.lenM = Math.round(r.lens.reduce((a, x) => a + x, 0) / 100) / 10;
    r.medianSeg = r.lens.length ? r.lens[Math.floor(r.lens.length / 2)] : 0;
    delete r.lens;
    r.keyRole = classifyLayer(r.name);
    r.role = shapeRole(r);
    out.push(r);
  }
  // 도형이 하나도 없는 정의는 행이 아니다(사전 검토 I-4): 실파일의 레이어 정의 101개 중
  // 도형이 실린 것은 45개뿐이고, 빈 정의 56줄을 체크리스트에 늘어놓으면 §18.6의 수치가 무의미해진다.
  return out.filter(r => r.segs || r.arcs || r.circles || r.texts || r.dims || r.inserts)
    .sort((a, b) => b.segs - a.segs || a.name.localeCompare(b.name));
}

// 기본 체크 = 벽 역할 · 켜짐 · 선분 > 0. 실파일에서 정확히 일곱 개가 켜진다.
export const defaultChecked = rows => new Set(rows.filter(r => r.role === 'wall' && !r.off && r.segs > 0).map(r => r.name));

// 역할별 레이어 이름. checked를 주면 교집합이다(개구부 보조 면선이 이 함수를 쓴다 — §18.3-3).
export const roleLayers = (rows, role, { checked = null } = {}) =>
  new Set(rows.filter(r => r.role === role && !r.off && (!checked || checked.has(r.name))).map(r => r.name));
