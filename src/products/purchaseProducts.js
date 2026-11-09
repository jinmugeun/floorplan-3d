// 구입목록 제품 펼치기(계획 20 Task 4 · 명세 D6·D7). purchaseData.js(학교 구입목록에서 생성)의 '카탈로그에 없음'·'덮어쓰기' 제품을
// 엑셀 제품과 같은 규칙(kitchenRules.expandRow — 형상·칩·심벌·설비 씨앗)으로 제품으로 만든다. 순수 — 합치기는 catalogKitchen.js.
// 식별번호가 있으면 id = k-<식별번호>(expandRow 그대로), 없으면(수의·재사용) id = ss-<구입목록 번호> · 코드 SS-<번호>.
// extra.school · extra.purchaseNo로 "이 학교 구입목록에서 왔다"를 남긴다(표시·추적용). 도면 기구 짝(kitchenFor) 후보에서 빠지는 것은 이 표지가 아니라
// catalogKitchen이 구입목록 제품을 따로 PURCHASE_PRODUCTS로 두고 kitchenFor는 KITCHEN_PRODUCTS만 보기 때문이다.
// 식별번호 없는 제품(수의·재사용 · 0원 · 이름에 실 이름이 든 것도 있다)은 hidden: true — 모든 사용자의 라이브러리·검색에는 나오지 않고
// productById로는 풀려 신상중 템플릿이 그대로 보인다(2026-11-09 계획 20 최종 리뷰 · 사용자 결정: 라이브러리에는 식별번호 제품만).
import { expandRow } from './kitchenRules.js';

export function purchaseProducts(data) {
  const out = [];
  for (const p of data.products) {
    if (p.inCatalog && !p.override) continue;
    const rec = [p.kid ?? `ss${p.no}`, p.name, 0, ...p.size, p.round ? 1 : 0, p.price, 0, '', p.contract];
    const e = expandRow(rec, { vendors: [p.vendor], subs: [p.sub] });
    const school = { school: data.school, purchaseNo: p.no }, tags = `${e.tags} ${data.school}`;
    out.push(p.kid ? { ...e, tags, extra: { ...e.extra, ...school } }
      : { ...e, id: p.id, code: `SS-${p.no}`, tags, hidden: true, extra: { ...e.extra, kid: null, ...school } });
  }
  return out;
}
