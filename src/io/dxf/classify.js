// 레이어 역할 판정(§18.2): **키워드는 사전 확률, 도형이 증거, 사용자가 심판**.
// 2026-10-02: 이름이 아무것도 말하지 않는 레이어는 내용으로 고친다(layerGuess.refineByContent — 청록 창호 · 벽 추정).
// 이 도면의 WALL·CON·DOR·DOOR·A-WALL·WALL-FIN은 정의만 있고 엔티티가 0개이고, 실제 벽은
// WAL·WAL-2·기존·FIN·ST-PL·BLO·COL 일곱에 흩어져 있다 — 이름만 믿는 구현은 벽 0개를 반환한다.
import { refineByContent, CYAN } from './layerGuess.js';
import { HEIGHT_RANGE } from './params.js';

// 앞의 규칙이 이긴다. 비교는 소문자 부분일치다(keys) — exact는 앞뒤 공백을 뗀 소문자 이름 전체가 같을 때만(2026-10-12 · 계획 13 Task 7 · rail의 divider).
// grid의 'dote'(2026-10-12 · 계획 12 Task 4): 공개 코퍼스의 TArch 축선 레이어 `DOTE` — 2suite (1) 선 65개 · 길이 중앙값 3,000 mm, 6suite (6)
// 33개 · 18,266 mm, 둘 다 꺼짐. other로 두면 켜진 도면에서 청록 창호·벽 추정(layerGuess)으로 올라갈 수 있다(축선은 3~18 m라 평행 짝이 길다).
export const LAYER_RULES = [
  { role: 'dim',     keys: ['dim', '치수', 'az-leal', 'az-leat', 'az-cutl', 'tol'] },
  { role: 'text',    keys: ['text', 'txt', 'note', '문자', 'title', 'number', 'a-she', 'revision', 'sym-t'] },
  { role: 'opening', keys: ['win', 'dor', 'door', '창호', '창', '문', '개구', 'wind', 'wd'] },
  { role: 'equip',   keys: ['급식', '기구', 'fur', 'fu-', 'equip', '가구', '설비', '후드', 'hood', 'kitchen', 'sit', '주방'] },
  { role: 'mep',     keys: ['전기', 'ele', 'el-line', 'elline', '급배수', '덕트', 'duct', 'hvac', '트렌치', 'pipe'] },
  { role: 'grid',    keys: ['cen', 'grid', 'axis', 'a-guide', 'guide', 'defpoints', 'polycen', 'dote'] },
  { role: 'hatch',   keys: ['hat', 'poche', '해치'] },
  { role: 'wall',    keys: ['wal', 'wall', '벽', 'con', 'col', '기둥', 'blo', '벽체', 'a-wall', 'st-pl', 'structure', '구조', '기존', 'fin', '마감'] },
  // rail(2026-10-12 · 계획 12 Task 5): 난간 — 벽이 아니라 방을 닫는 구획선의 재료다(railDividers.js · 기본 체크 아님). **wall 뒤**에 둔다:
  // 공개 코퍼스의 `BALCONY`(8도면)·`Balcony(阳台)`(5)·`BACONY`(1)는 `con` 키로 벽이고 그 도면들의 발코니는 이미 잘 닫힌다(회귀 금지).
  // 키 근거(놓친 발코니·정원 정답의 빈 변을 그 레이어 선이 60 % 이상 덮는 수): `栏杆` 78 · `0-栏杆` 36 · `阳台栏杆SHUTTER` 15 · `RAIL` 1 →
  // `栏杆`·`rail`(`난간`·`handrail`은 사전 검토가 정한 한국어·영어 이름), `阳台` 계열 `屋顶轮廓阳台` 28 · `阳台露台` 9 · `阳台` 8 → `阳台`,
  // 철자가 틀린 `4-BACLONY` 36(2suite (9)·3suite (3)·(4)·(10) — 그림으로 확인한 발코니 앞 두 줄 난간) → `baclony`.
  // `divider`(2026-10-12 · 최종 리뷰 X-1): 정규화 DXF 내보내기는 구획선(virtual)을 `DIVIDER` 레이어에 쓴다. '기타'로 버리면 난간으로 닫은 발코니가
  // 왕복 한 번에 다시 열렸다(방 2 → 1 · 끊긴 끝 0 → 2). 난간 역할이면 railDividers가 벽 두 곳 이상에 닿는 railMin 이상 선을 구획선으로 다시 긋는다
  // (더 짧은 것은 잃는다). 두 코퍼스에 `divider`가 든 레이어 이름은 없다(점수 불변).
  // `divider`는 **정확 이름**(exact · 2026-10-12 계획 13 Task 7 · 최종 재리뷰 R-3): 부분 문자열이면 "TOILET DIVIDER"(화장실 칸막이)·"ROOM DIVIDER"·
  // "DIVIDER-PANEL" 같은 남의 레이어가 난간이 되고, 벽 두 곳에 닿는 칸막이 선이 구획선이 되어 헛방을 만든다. 우리 내보내기의 레이어는 `DIVIDER`
  // 하나뿐이다(dxfExportTemplate.js) — 그 이름만 난간으로, 나머지는 예전처럼(기타) 둔다. 다른 난간 키는 부분 문자열 그대로다.
  { role: 'rail',    keys: ['栏杆', '난간', 'rail', 'handrail', '阳台', 'baclony'], exact: ['divider'] },
];
export const ROLE_LABEL = { wall: '벽', opening: '개구부', equip: '기구', mep: '설비', dim: '치수', text: '문자', grid: '축선', hatch: '해치', rail: '난간', other: '기타' };

export const classifyLayer = name => {
  const n = String(name).toLowerCase(), whole = n.trim();
  for (const r of LAYER_RULES) if (r.keys.some(k => n.includes(k)) || r.exact?.includes(whole)) return r.role;
  return 'other';
};

// 레이어 이름의 높이 꼬리(2026-10-13 · 계획 16 Task A): 이름 끝 `_숫자 3~4자리`가 HEIGHT_RANGE 안이면 그 레이어 벽의 높이(mm)다. 아키스케치 CAD 업로드의
// `wall_2800` 규칙과 같다(조사 2026-10-13-research-rea-archisketch.md §1.1) — 사무소가 층고를 도면에 적을 수 있는 가장 싼 길. 범위 밖(`BLO_1000` 같은
// 도면 번호 꼴)은 꼬리가 아니다. 우리 내보내기의 `WALL-2`(붙임표·한 자리)는 맞지 않는다. 코퍼스 43파일의 레이어 이름 442개 중 맞는 것은 0(사전 검토 5).
// 지금은 층고 **하나**로 납작해진다(레이어마다 다른 높이는 범위 밖 — 선분이 가장 많은 체크 벽 레이어의 값이 층고 칸에 간다).
export const layerHeight = name => {
  const m = /_(\d{3,4})$/.exec(String(name ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  return h >= HEIGHT_RANGE[0] && h <= HEIGHT_RANGE[1] ? h : null;
};
// 체크된 벽 레이어의 높이 꼬리 → 층고 후보 하나(선분이 가장 많은 레이어의 값). 검토 창이 **지금 체크 집합**으로 다시 계산해 층고 칸에 미리 넣고 사람이 고친다.
export const heightHint = (rows, checked) => {
  const r = rows.filter(x => x.role === 'wall' && x.height && checked.has(x.name)).sort((a, b) => b.segs - a.segs)[0];
  return r ? { height: r.height, layer: r.name } : null;
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
  // 치수가 선분 이상일 때만 치수 레이어다(2026-10-02 내곡중: 선 14,829개가 든 유일한 레이어가 DIMENSION 19개 때문에
  // 통째로 "치수"가 되어 벽 레이어가 0개가 됐다).
  if (r.dims > 0 && r.dims >= r.segs) return 'dim';
  if (r.texts > r.segs) return 'text';
  if (r.keyRole === 'other' && r.segs > 1000 && r.medianSeg < 20) return 'hatch';
  return r.keyRole;
}

// 이 배열이 §18.6 체크리스트의 유일한 원천이다. 레이어 테이블에 없는데 도형만 있는 이름도
// 행을 얻는다(블록 안에서만 쓰인 레이어).
// roles(2026-10-12 · 계획 12 Task 9): roles.checkRoles가 낸 역할표. **규칙을 표 없이 그대로 다 돌린 뒤**(키워드 · 도형 신호 · 청록 창호 ·
// 벽 추정) 표에 있는 레이어만 그 역할로 덮고 byTable을 단다(guessed·byColor는 배지·알림에 묶인 "추정" 표지라 지운다). 그래서 표에 없는
// 레이어의 행은 표가 없을 때와 같다 — 추정 벽도 그대로다(리뷰 M-1: 표를 먼저 적용하면 표의 벽 한 줄이 벽 추정의 조기 반환을 만족시켜,
// 무관한 레이어 하나 `{FUR: wall}`만으로 모든 추정 벽이 사라졌다). 표가 벽을 하나도 남기지 않으면(유일한 벽 레이어를 other로 바꾼 표)
// 표에 없는 레이어끼리 벽 추정을 한 번 더 한다(refineByContent는 byTable 행을 건너뛴다). 꺼짐·동결·선 수는 표가 바꾸지 못한다.
export function layerStats(doc, ex, { roles = null } = {}) {
  const rows = new Map();
  const get = name => {
    let r = rows.get(name ?? '0');
    if (!r) {
      r = { name: name ?? '0', color: 7, off: false, frozen: false, role: 'other', keyRole: 'other', height: null,
        segs: 0, arcs: 0, circles: 0, texts: 0, dims: 0, inserts: 0, lenM: 0, medianSeg: 0, cyan: 0, lens: [] };
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
  // cyan: 실제 색이 청록인 선분 수 — 선에 색이 있으면 그것이, 없으면(ByLayer) 레이어 색이 실제 색이다.
  for (const s of ex.segs ?? []) {
    const r = get(s.layer);
    r.segs++; r.lens.push(Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]));
    if ((s.color ?? Math.abs(r.color)) === CYAN) r.cyan++;
  }
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
    r.height = layerHeight(r.name);     // 행에는 역할과 상관없이 단다 — 층고 후보(heightHint)·배지는 벽 행만 본다(2026-10-13 계획 16 Task A)
    out.push(r);
  }
  // 내용으로 고치기(청록 창호 · 이름으로 벽을 못 찾았을 때의 벽 추정) — 레이어별 선분은 필요할 때만 모은다.
  let byLayer = null;
  const segsOf = name => {
    if (!byLayer) { byLayer = new Map(); for (const s of ex.segs ?? []) (byLayer.get(s.layer) ?? byLayer.set(s.layer, []).get(s.layer)).push(s); }
    return byLayer.get(name) ?? [];
  };
  refineByContent(out, segsOf);
  // 역할표는 규칙 **뒤에** 덮는다(위 roles 주석 · 리뷰 M-1).
  let touched = false;
  for (const r of out) {
    const t = roles?.layers?.get(r.name);
    if (!t) continue;
    r.role = t; r.byTable = true; delete r.guessed; delete r.byColor; touched = true;
  }
  if (touched && !out.some(r => r.role === 'wall' && !r.off && r.segs > 0)) refineByContent(out, segsOf);
  // 도형이 하나도 없는 정의는 행이 아니다(사전 검토 I-4): 실파일의 레이어 정의 101개 중
  // 도형이 실린 것은 45개뿐이고, 빈 정의 56줄을 체크리스트에 늘어놓으면 §18.6의 수치가 무의미해진다.
  return out.filter(r => r.segs || r.arcs || r.circles || r.texts || r.dims || r.inserts)
    .sort((a, b) => b.segs - a.segs || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));   // 코드포인트 비교 — localeCompare는 실행 로캘에 따라 순서가 달라 CI(en-US-POSIX)와 ko-KR이 어긋난다(Task 8 리뷰 C-1)
}

// 기본 체크 = 벽 역할 · 켜짐 · 선분 > 0. 실파일에서 정확히 일곱 개가 켜진다. 내용으로 추정한 벽(guessed)도 벽 역할이다.
// 난간(rail)은 체크하지 않는다 — 체크는 "벽으로 세울 레이어"이고, 난간 선은 워커가 roleLayers(rows, 'rail')로 따로 모아 구획선으로만 쓴다.
export const defaultChecked = rows => new Set(rows.filter(r => r.role === 'wall' && !r.off && r.segs > 0).map(r => r.name));

// 역할별 레이어 이름. checked를 주면 교집합이다(개구부 보조 면선이 이 함수를 쓴다 — §18.3-3).
export const roleLayers = (rows, role, { checked = null } = {}) =>
  new Set(rows.filter(r => r.role === role && !r.off && (!checked || checked.has(r.name))).map(r => r.name));
