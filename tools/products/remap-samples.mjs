// 내장 샘플 두 벌의 기존 급식 제품 → 엑셀 급식기구(계획 17 Task 9). 다시 돌려도 결과가 같다(이미 엑셀 제품이면 건너뛴다).
//   node tools/products/remap-samples.mjs          → src/samples/sinsang.json · gangdang.json을 고쳐 쓰고 바꾼 수를 알린다
//   node tools/products/remap-samples.mjs --check  → 쓰지 않고 바꿀 것이 남았는지만 본다(남았으면 종료 1)
// 신상중(가져온 결과 그대로의 저장 프로젝트): 기구마다 kitchenFor(기존 id, 그 기구 크기, 도면 이름)로 같은 세부품명 안 크기가 가장 가까운 엑셀 제품을 고른다 —
//   지금 가져오기(io/dxf/equipment.js)가 고를 제품과 같게(2026-10-20 · 컨트롤러 결정). 도면 이름 = 아이템 이름이 기존 제품 이름과 다를 때의 그 이름
//   (기존 제품 이름 그대로면 익명 블록이라 이름 없이 고른다 — 가져오기도 익명 블록에는 이름을 주지 않는다).
//   productId·code·kind를 새 제품으로, dxfProduct는 productId와 같았을 때만(견적 0원 '도면 기구' 규칙 — estimate.isDrawnItem), 이름은 기존 제품 이름
//   그대로였을 때만(익명 블록 — 라벨 규칙 labels2d.itemNameLabel), 색은 기존 제품 색 그대로였을 때만 새 제품 색으로 바꾼다. 자리·크기·회전·부착·벽은 그대로.
//   설비가 아니던 것이 설비가 되면(컵자동세척기 → 상업용식기세척기) 새 제품의 설비 씨앗을 props로 단다. 이미 설비면 props는 그대로 두되, 기존 제품의
//   씨앗 값 그대로인 칸만 새 제품 값으로 바꾼다(같은 규칙 — 취반기(전기)가 전기 취반기가 되면 열원도 전기 · 후드 번호·면풍속·후드 연결은 그대로).
//   급식실 마감: 방 바닥 칩 에폭시 · 벽 안쪽 흰 타일.
// 강당중(기술서 JSON — 손으로 정리한 CRLF 서식): 설비 한 줄씩 "product"만 바꾸고, 크기가 없던 줄(조리기구)은 기존 제품 크기를 적어 배치를 그대로 둔다.
//   후드는 props(filter·faceVelocity)를 이미 적어 두어 풍량이 그대로다. 벽 타일은 gangdang.js가 짓는 단계에서 붙인다(기술서에는 벽이 없다).
//   기술서에는 도면 이름이 없어 이름 없이 고른다.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { productById } from '../../src/products/catalog.js';
import { kitchenFor } from '../../src/products/catalogKitchen.js';
import { defaultFloorMat, kitchenWallMat } from '../../src/materials/defaults.js';

const SAMPLES = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/samples');
const isKitchen = id => String(id ?? '').startsWith('k-');
// 기존 제품 → 엑셀 제품 id(없으면 null — 문·창·기둥·도면 기구·환기 부속은 그대로다).
const target = (oldId, size, name = '') => (isKitchen(oldId) || !productById(oldId) ? null : kitchenFor(oldId, size, name));

// 설비 씨앗: 설비가 되면 새 씨앗을 달고, 이미 설비면 기존 씨앗 값 그대로인 칸(또는 빈 칸)만 새 값으로. 설비가 아니게 되면 뗀다.
function reseed(it, old, np) {
  if (!np.equip) { delete it.props; return; }
  if (!it.props) { it.props = { ...np.equip }; return; }
  for (const [k, v] of Object.entries(np.equip)) if (it.props[k] === undefined || it.props[k] === old.equip?.[k]) it.props[k] = v;
}

export function remapSinsang(spec) {
  const out = structuredClone(spec);
  let items = 0, finishes = 0;
  for (const f of out.floors ?? []) {
    for (const it of f.items ?? []) {
      const old = productById(it.productId);
      const nid = target(it.productId, it.size, old && it.name !== old.name ? it.name : '');
      if (!nid) continue;
      const np = productById(nid);
      if (it.dxfProduct === it.productId) it.dxfProduct = nid;
      if (it.name === old.name) it.name = np.name;
      if (it.color === old.color) it.color = np.color;
      it.productId = nid; it.code = np.code; it.kind = np.kind;
      reseed(it, old, np);
      items++;
    }
    for (const r of f.rooms ?? []) { if (r.floorMat?.id !== defaultFloorMat().id) finishes++; r.floorMat = defaultFloorMat(); }
    for (const w of f.walls ?? []) if (!w.virtual) { if (w.matIn?.id !== kitchenWallMat().id) finishes++; w.matIn = kitchenWallMat(); }
  }
  return { spec: out, items, finishes };
}

export function remapGangdangText(text) {
  const spec = JSON.parse(text);
  let items = 0;
  const lines = text.split('\n').map(line => {
    const m = /"id": "([^"]+)", "product": "([^"]+)"/.exec(line);
    if (!m) return line;
    const e = spec.equipment.find(x => x.id === m[1]), old = productById(m[2]);
    const nid = target(m[2], e?.size ?? old?.size);
    if (!nid) return line;
    items++;
    let out = line.replace(`"product": "${m[2]}"`, `"product": "${nid}"`);
    if (!e.size) out = out.replace('"props":', `"size": [${old.size.join(', ')}], "props":`);
    return out;
  });
  return { text: lines.join('\n'), items };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  const sPath = resolve(SAMPLES, 'sinsang.json'), gPath = resolve(SAMPLES, 'gangdang.json');
  const s = remapSinsang(JSON.parse(readFileSync(sPath, 'utf8')));
  const g = remapGangdangText(readFileSync(gPath, 'utf8'));
  console.log(`신상중: 기구 ${s.items}개 · 마감 ${s.finishes}면 / 강당중: 설비 ${g.items}개`);
  if (check) process.exit(s.items + s.finishes + g.items ? 1 : 0);
  writeFileSync(sPath, JSON.stringify(s.spec));          // 원본처럼 한 줄 · 끝 줄바꿈 없음
  writeFileSync(gPath, g.text);                         // 줄 단위로만 고쳐 손 서식(CRLF)을 지킨다
}
