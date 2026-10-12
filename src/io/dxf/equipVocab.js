// 기구 블록 이름 어휘표(2026-10-12 · 계획 13 Task 2). 급식기구 배치도의 블록 이름은 **한국어 품명 + 크기**가 관례다
// (`세정대 2조 1500-750` · `냉장고 4도어 1100L 1260-850` · `후드1500-1300` — 사동중·신상중 두 사무소가 같은 어휘를 쓴다).
// 이 표는 파라미터가 아니라 DOOR_BLOCK류의 **이름 표**다(사전 검토 p13-preflight.md §4-9) — params.js에 두지 않는다.
// 근거: Task 1 진단(p13-task-1-report.md §6 어휘 초안 52칸 · §7 제외 목록)과 사전 검토(§3 어휘 42칸)를 합쳤다. 괄호 안 수는 네 도면 영역 안
// 세움 419개 중 그 항목이 맡은 인스턴스(Task 1 v2). 이 파일도 워커의 import 사슬이다: DOM·ui를 건드리지 않는다.
//
// 비교는 정규화(소문자 + 공백·밑줄 제거)한 이름의 **부분 문자열**이고 앞 항목이 이긴다(손세정대 → 세정대, 소변기 → 변기, 김치 → 냉장고 순서가 뜻이 있다).
// keys에는 정규식도 둘 수 있다(원 이름에 맞춘다). z = 바닥에서 아랫면까지(mm) · size 'product' = 카탈로그 크기(식탁 — 상자가 의자를 품는다) ·
// maxLong = 상자 긴 변이 이보다 크면 그 제품이 아니라 도면 기구다(내곡중 `To소변기A(w)` 3772×4382 · `To양변기F(w)` 2623×1509는 여럿을 그린 묶음 — 사전 검토 I-8).
const GEN = 'equip-generic';
export const EQUIP_VOCAB = [
  // 벽 부착 — 벽(면)이 300 mm 안이면 벽에 붙이고 아니면 제자리(equipment.js). 어휘의 부착이 제품의 부착을 이긴다.
  { keys: ['워터릴'], productId: GEN, height: 550, attach: 'wall', z: 1000 },                                   // 16
  { keys: ['온수기'], productId: GEN, height: 600, attach: 'wall', z: 1200 },                                   // 6
  { keys: ['배전함', '분전함', '스위치'], productId: GEN, height: 1000, attach: 'wall', z: 900 },               // 1 (+ 글자 1)
  { keys: ['에어커튼'], productId: GEN, height: 250, attach: 'wall', z: 2200 },                                 // 13
  { keys: ['소화기', '소화전'], productId: GEN, height: 700, attach: 'wall', z: 300 },
  { keys: [/(^|[^a-z])tv([^a-z]|$)/i, '티비'], productId: 'tv-55', height: 720, attach: 'wall', z: 900 },
  { keys: ['거울'], productId: 'mirror-wall', height: 900, attach: 'wall', z: 900 },
  { keys: ['샤워기', '수전'], productId: GEN, height: 300, attach: 'wall', z: 1500 },
  { keys: ['손소독기', '타올기', '영유아거치대', '공기살균기'], productId: GEN, height: 400, attach: 'wall', z: 1100 },   // 3 (+ 글자 3)
  // 살균수 제조기(450-255 — 깊이 255의 벽걸이): 바닥형으로 세우면 아래의 세정대·야채세척기와 95 %·79 % 겹쳤다(2026-10-12 측정 p13t2-measure.mjs).
  { keys: ['살균수'], productId: GEN, height: 600, attach: 'wall', z: 1200 },                                    // 2
  { keys: ['상부장'], productId: 'cabinet-upper', height: 700, attach: 'wall', z: 1500 },
  { keys: ['소변기'], productId: GEN, height: 650, attach: 'wall', z: 400, maxLong: 1200 },                     // 2
  { keys: ['세면기', '세면대'], productId: 'washbasin', height: 200, attach: 'wall', z: 800, maxLong: 1200 },    // 6
  // 천장 — 후드는 hood-box(환기 집계에 든다). 익명 X-상자도 이 칸으로 간다(equipment.js).
  { keys: ['후드'], productId: 'hood-box', height: 600, attach: 'ceiling' },                                     // 8 + X-상자 11
  // 바닥 — 카탈로그 제품
  { keys: ['식탁6인', '6인식탁'], productId: 'dining-6', height: 750, attach: 'floor', size: 'product' },          // 89 (21 %)
  { keys: ['식탁4인', '4인식탁'], productId: 'dining-4', height: 750, attach: 'floor', size: 'product' },          // 7
  // 인원 없는 '식탁'은 카탈로그 크기를 강요하지 않는다(리뷰 M-8 — 네 도면 0건): 몇 인용인지 모르니 이름 치수 → 상자 순서 그대로다.
  { keys: ['식탁'], productId: 'dining-6', height: 750, attach: 'floor' },
  { keys: ['회의용테이블', '회의테이블', '회의탁자'], productId: 'meeting-table-2400', height: 750, attach: 'floor' },   // 1
  { keys: ['책상'], productId: 'desk-1400', height: 750, attach: 'floor' },                                      // 2 (xref 책상L형 — 영양사실 L자 책상)
  { keys: ['의자'], productId: 'chair-dining', height: 900, attach: 'floor' },
  { keys: ['손세정대', '손세척대'], productId: 'washbasin', height: 850, attach: 'floor' },                       // 6 — 조리실 손세정대는 바닥에 서는 페달식
  { keys: ['세정대1조', '개수대', '싱크대', '청소대'], productId: 'sink-single', height: 850, attach: 'floor' },   // 11
  { keys: ['세정대', '싱크', '담금', 'tr1500s', 'tr1800s'], productId: 'sink-double', height: 850, attach: 'floor' },   // 10 (수류담금세척기 = 담금조)
  { keys: ['컵자동세척기', '컵세척기'], productId: 'dishwasher', height: 1800, attach: 'floor' },                  // 4 (사전 검토 §3)
  { keys: ['야채자동세척기', '야채세척기'], productId: GEN, height: 850, attach: 'floor' },                         // 1
  { keys: ['컨베이어'], productId: 'dishwasher-conveyor', height: 1500, attach: 'floor' },                         // 0 (세척 라인은 익명 *U266 · zw$22AD)
  { keys: ['식기세척기', '세척기'], productId: 'dishwasher', height: 850, attach: 'floor' },
  { keys: ['김치'], productId: 'fridge-kimchi', height: 1800, attach: 'floor' },                                 // 2
  { keys: ['냉장고', '냉동고', '보냉고'], productId: 'fridge-2door', height: 1800, attach: 'floor' },              // 10
  { keys: ['보온고', '온장고'], productId: 'warmer-cabinet', height: 1800, attach: 'floor' },                     // 2 (+ 글자 1)
  { keys: ['신발장', '사물함', '옷장', '보관함'], productId: 'locker-12', height: 1800, attach: 'floor' },          // 6 (+ 글자 10)
  { keys: ['소독기', '소독고', '살균고'], productId: 'warmer-cabinet', height: 1800, attach: 'floor' },            // 12 — 대용(같은 스테인리스 캐비닛 꼴)
  { keys: ['취반기', '밥솥'], productId: 'ricecooker-gas', height: 900, attach: 'floor' },                         // 6
  { keys: ['회전국솥', '국솥'], productId: 'soup-kettle', height: 850, attach: 'floor' },                          // 4
  { keys: ['볶음솥'], productId: 'wok-kettle', height: 900, attach: 'floor' },
  { keys: ['그리들', '부침'], productId: 'griddle-electric', height: 850, attach: 'floor' },                       // 2
  { keys: ['렌지', '레인지', '인덕션'], productId: 'range-gas-6', height: 850, attach: 'floor' },                   // 2 — 대용(range-induction은 60 mm 쿡탑)
  { keys: ['스티머', '오븐'], productId: 'steamer-combi', height: 1800, attach: 'floor' },                         // 2 — 대용(oven-built는 z 850 큐브)
  { keys: ['다단식선반', '선반', '건조대'], productId: 'shelf-steel-4', height: 1800, attach: 'floor' },           // 20
  { keys: ['캐비닛', '하부장'], productId: 'cabinet-lower', height: 850, attach: 'floor' },                        // 9 (+ 글자 2)
  { keys: ['작업대', '검수대', '조리대'], productId: 'worktable-1800', height: 850, attach: 'floor' },              // 13
  { keys: ['배식대', '배분대'], productId: 'serve-counter', height: 900, attach: 'floor' },                       // 3
  { keys: ['건조기'], productId: 'dryer', height: 850, attach: 'floor' },                                         // 1 (세탁 건조기 — 건조대와 따로)
  { keys: ['세탁기'], productId: 'washer-drum', height: 850, attach: 'floor' },                                   // 1
  { keys: ['에어컨'], productId: 'aircon-stand', height: 1800, attach: 'floor' },
  { keys: ['양변기', '대변기', '변기'], productId: 'toilet', height: 800, attach: 'floor', maxLong: 1200 },        // 5 — '소변기'가 앞에서 걸린다
  { keys: ['벤치'], productId: 'bench-1200', height: 450, attach: 'floor' },
  // 바닥 — 카탈로그에 비슷한 것이 없는 기구(도면 기구 · 높이만 안다)
  { keys: ['운반차', '운반카', '회수차', '카트', '트롤리'], productId: GEN, height: 900, attach: 'floor' },         // 26 (6 %)
  { keys: ['실외기'], productId: GEN, height: 1000, attach: 'floor' },                                           // 3
  { keys: ['음식물처리기'], productId: GEN, height: 1100, attach: 'floor' },                                       // 1
  { keys: ['쓰레기통'], productId: GEN, height: 900, attach: 'floor' },                                           // 4
  { keys: ['세미기', '탈피기', '탈수기', '절단', '제습기', '밀대짤통'], productId: GEN, height: 1000, attach: 'floor' },   // 8
  { keys: ['받침대'], productId: GEN, height: 200, attach: 'floor' },                                             // 5
];

// 세우면 안 되는 것(이유별 — equipment.js의 stats.skipped 칸). 영역 안 실측(Task 1 §7): 육가 11 · 그레이팅 7 · 매립 발판소독 16 · 배수구 3 · Z_DOT 30 ·
// 신발250 19 · sss…dfdfsa 16(현관 구멍판 발판) · *B1203~1207(사동 AZ-LEAL 지시선·38 mm 막대) · 도면틀(권-효성a3 61 m · S-S3 63 m) · 포켓도어 11(문 —
// Task 6(a)가 이름 규칙에 넣었다; 역할표·옛 규칙 경로를 위해 여기도 둔다) · 1f plan-1(위생 기구 8개를 품은 평면 블록) · 내곡 묶음(장애인화장실 대변기_평면 ·
// afadfasdfasfd — 내장 기구 전개는 이월, 사전 검토 반영 9) · 내곡 벽 조각 1층_방풍실_식당(1140×6900 ×2).
// "도어"는 숫자 바로 뒤가 아닐 때만 개구부다 — 냉장고 4도어·6도어는 문짝 수다(사전 검토 반영 3).
export const EQUIP_SKIP = [
  { keys: [/(?<!\d\s*)도어/], reason: 'opening' },
  { keys: ['육가', '그레이팅', '트렌치', '배수구', '드레인', '그리스트랩', '매립형', '점자블럭', '중심선', '조경', '노즐', '각재'], reason: 'fixture' },
  { keys: ['z_dot', '넘버-', 'key-', '탑차', /^신발\s*\d/, /^s{6,}[a-z]*$/i, /^\*b\d+$/i], reason: 'symbol' },
  { keys: ['권-효성', 's-s3', '도곽', '도면틀', 'titleblock'], reason: 'frame' },
  { keys: [/^\d+f\s*plan/i, '장애인화장실 대변기_평면', /^afadfasdfasfd$/i], reason: 'composite' },
  { keys: ['1층_방풍실_식당'], reason: 'wallPiece' },
];

// AutoCAD·ZWCAD 익명 블록(zw$ · A$C · *U · *B · $0$…)과 자판을 두드린 이름(sssssssssssdfdfsa · afadfasdfasfd · adafdsaf · ffffffffffffff3f3f) —
// 이름이 아무것도 말하지 않는다(Task 1 §4-2). 어휘로 맞추지 않고 모양·안쪽 글자·자식 이름으로만 맞춘다(equipment.js).
const ANON = /^(zw\$|a\$c|\*[a-z]|\$)/i, JUNK = /^[asdf3]{6,}$/i;
export const isAnonymous = name => ANON.test(String(name ?? '')) || JUNK.test(String(name ?? ''));

const norm = s => String(s ?? '').toLowerCase().replace(/[\s_]+/g, '');
const hit = (keys, raw) => { const n = norm(raw); return keys.some(k => (k instanceof RegExp ? k.test(raw) : n.includes(norm(k)))); };

export function skipReason(name) {
  const raw = String(name ?? '');
  return EQUIP_SKIP.find(s => hit(s.keys, raw))?.reason ?? null;
}
export const isSkipped = name => skipReason(name) != null;

// 이름 → { productId, height, attach, z, size?, maxLong? } | null. 익명 이름은 null(이름이 품명이 아니다).
export function matchEquip(name) {
  const raw = String(name ?? '');
  if (!raw.trim() || isAnonymous(raw)) return null;
  const v = EQUIP_VOCAB.find(e => hit(e.keys, raw));
  if (!v) return null;
  const out = { productId: v.productId, height: v.height, attach: v.attach, z: v.z ?? 0 };
  if (v.size) out.size = v.size;
  if (v.maxLong) out.maxLong = v.maxLong;
  return out;
}

// 사람이 도면과 대조할 이름(item.name): `_` → 공백, 회사명(Task 1 §4-7: 선경인케이 · 선경산업 · 선경 · HK · LG트롬 · LG · 원더텍) 빼기,
// 빈 괄호 · 양 끝의 `-` 빼기(회사명이 앞에 있으면 `HK-1200` → `-1200`이 남았다 — 리뷰 Nit), xref 접두(`xref-전체평면도$0$`) 빼기.
// 치수 꼬리는 남긴다(`1500-750` — 사전 검토 m-7: 가운데 `-`는 건드리지 않는다).
const MAKER = /선경인케이|선경산업|선경|원더텍|lg트롬|(?<![a-z])(hk|lg)(?![a-z])/gi;
export function cleanName(name) {
  return String(name ?? '').replace(/^xref-[^$]*\$\d+\$/i, '').replace(/_/g, ' ').replace(MAKER, ' ').replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ').trim().replace(/^[-\s]+|[-\s]+$/g, '');
}

// 이름의 치수 → [W, D] 또는 [W, D, H] (mm, 이름 순서 그대로 — 방향은 equipment.js가 상자에 맞춘다) | null.
// 3~4자리 수 둘(셋)이 `-`·`x`·`×`·`*`로 이어진 첫 자리. 단위 낱말이 바로 붙은 수(200L · 150인용 · 20kg · 4도어)는 치수가 아니다:
// 깊이 자리의 수가 그렇다면 그 자리를 버리고 다음을 찾고, 높이 자리면 높이만 버린다(사전 검토 반영 3).
const DIM = /(?<!\d)(\d{3,4})\s*[-x×X*]\s*(\d{3,4})(?:\s*[-x×X*]\s*(\d{3,4}))?(?!\d)/g;
const UNIT = /^\s*(l|ℓ|kg|인|도어|단|구|벌|켤레|ea)(?![a-z])/i;
export function sizeInName(name) {
  const raw = String(name ?? '');
  for (const m of raw.matchAll(DIM)) {
    const after = raw.slice(m.index + m[0].length);
    if (m[3] == null) { if (UNIT.test(after)) continue; return [+m[1], +m[2]]; }
    if (!UNIT.test(after)) return [+m[1], +m[2], +m[3]];
    const two = raw.slice(m.index).match(/^(\d{3,4})\s*[-x×X*]\s*(\d{3,4})/);
    return [+two[1], +two[2]];
  }
  return null;
}
