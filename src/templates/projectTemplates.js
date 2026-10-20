// 프로젝트 템플릿: 시작 화면에서 고르는 "처음 상태". 내장 3개(빈 프로젝트 · 강당중 조리실 · 경산 신상중 급식실) + 사용자가 저장한 것(localStorage).
// 서버가 없으므로 사용자 템플릿은 이 브라우저에만 남는다(내보내려면 JSON 저장을 쓴다). 원룸 6평은 계획 17(2026-10-20 — 조리실 전용 카탈로그)에서 뺐다.
import { createEmptyProject, migrate } from '../state/schema.js';
import { buildSampleProject } from '../samples/gangdang.js';
import { buildSinsangProject } from '../samples/sinsang.js';

export const TEMPLATE_KEY = 'kvp.templates';

export const BUILTIN_TEMPLATES = [
  { id: 'builtin-empty', name: '빈 프로젝트', desc: '빈 화면에서 방과 벽을 직접 그립니다.', build: () => migrate(createEmptyProject()) },
  { id: 'builtin-gangdang', name: '강당중 조리실', desc: '방 11개 · 환기 설비 39개 · 덕트 10계통이 그려진 예제 도면으로 시작합니다.', build: () => buildSampleProject() },
  // 2026-10-13 · 사용자 요청: 경산 신상중 급식기구 배치도(DXF)를 가져온 결과를 누구나 시작 화면에서 열어 보게 — samples/sinsang.js.
  { id: 'builtin-sinsang', name: '경산 신상중 급식실', desc: 'CAD 도면(DXF)에서 가져온 급식실 — 방 13개 · 문·창 32개 · 급식기구 167개가 배치된 예제입니다.', build: () => buildSinsangProject() },
];

const readAll = () => { try { const t = JSON.parse(localStorage.getItem(TEMPLATE_KEY) ?? '[]'); return Array.isArray(t) ? t : []; } catch { return []; } };
// 성공 여부를 돌려준다: 용량 초과·사생활 보호 모드에서는 false → 호출자가 "저장했습니다"라고 속이지 않게 한다.
const writeAll = list => { try { localStorage.setItem(TEMPLATE_KEY, JSON.stringify(list)); return true; } catch { return false; } };

// 배경 이미지는 dataURL이라 용량이 커서 뺀다. 같은 이름의 템플릿은 덮어쓴다.
// 저장이 실패하면(용량 초과 등) null을 돌려준다.
// DXF 가져오기 기록(meta.dxfImport)도 뺀다(2026-10-12 · 계획 12 최종 리뷰 X-8 · M10-3): 그 기록은 "이 프로젝트를 가져온 직후"의 스냅숏이라,
// 템플릿에 실리면 그 템플릿으로 시작한 모든 프로젝트가 남의 가져오기를 기준으로 교정 기록을 냈다. 다른 meta 필드는 그대로 두고,
// 가져오기 기록뿐이던 meta는 통째로 뺀다(옛 파일처럼 meta 없는 템플릿).
export function saveTemplate(name, project) {
  const clean = { ...structuredClone(project), background: null };
  if (clean.meta && typeof clean.meta === 'object' && 'dxfImport' in clean.meta) {
    delete clean.meta.dxfImport;
    if (!Object.keys(clean.meta).length) delete clean.meta;
  }
  clean.name = String(name ?? '').trim() || project.name || '템플릿';
  // id에 난수 4자를 붙인다: 같은 밀리초에 두 번 저장하면 Date.now()만으로는 겹친다.
  const entry = { id: `tpl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: clean.name, savedAt: new Date().toISOString(), project: clean };
  const ok = writeAll([...readAll().filter(t => t.name !== entry.name), entry]);
  return ok ? { id: entry.id, name: entry.name, savedAt: entry.savedAt } : null;
}
export const listTemplates = () => readAll()
  .map(({ id, name, savedAt }) => ({ id, name, savedAt: savedAt ?? '' }))
  .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
export const deleteTemplate = id => writeAll(readAll().filter(t => t.id !== id));

// 이름 변경(§16.10 · 감사 §18). 이름은 템플릿의 열쇠나 다름없으므로(saveTemplate이 같은 이름을
// 덮어쓴다) 이미 쓰는 이름으로는 바꾸지 않는다. 빈 이름도 거절한다. 바꿨으면 true.
export function renameTemplate(id, name) {
  const next = String(name ?? '').trim();
  if (!next) return false;
  const all = readAll();
  const mine = all.find(t => t.id === id);
  if (!mine) return false;
  if (all.some(t => t.id !== id && t.name === next)) return false;
  if (BUILTIN_TEMPLATES.some(t => t.name === next)) return false;
  return writeAll(all.map(t => (t.id === id ? { ...t, name: next, project: { ...t.project, name: next } } : t)));
}

// 사용자 템플릿도 migrate를 지나야 한다: 옛 스키마로 저장해 둔 것이 그대로 앱에 들어가지 않게 한다.
// project 필드가 손상돼 있으면(수동 조작 등) migrate()가 던질 수 있다 — 그 항목만 건너뛰고 null을 돌려준다.
export function templateProject(id) {
  const b = BUILTIN_TEMPLATES.find(t => t.id === id);
  if (b) return b.build();
  const e = readAll().find(t => t.id === id);
  if (!e?.project) return null;
  try { return migrate(e.project); } catch { return null; }
}
export const allTemplateCards = () => [
  ...BUILTIN_TEMPLATES.map(t => ({ id: t.id, name: t.name, desc: t.desc, user: false })),
  ...listTemplates().map(t => ({ id: t.id, name: t.name, desc: `저장한 템플릿 · ${String(t.savedAt).slice(0, 10)}`, user: true })),
];
