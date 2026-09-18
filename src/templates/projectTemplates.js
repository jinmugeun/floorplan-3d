// 프로젝트 템플릿: 시작 화면에서 고르는 "처음 상태". 내장 3개 + 사용자가 저장한 것(localStorage).
// 서버가 없으므로 사용자 템플릿은 이 브라우저에만 남는다(내보내려면 JSON 저장을 쓴다).
import { createEmptyProject, migrate, activeFloor } from '../state/schema.js';
import { rectWalls } from '../geom/walls.js';
import { normalizeWalls } from '../geom/normalize.js';
import { detectRooms } from '../geom/rooms.js';
import { buildSampleProject } from '../samples/gangdang.js';
import { placeTemplate, templateById } from './roomTemplates.js';

export const TEMPLATE_KEY = 'kvp.templates';

// 원룸 6평: 벽 두께 150이라 중심선 4150 × 5150이면 내부가 정확히 4000 × 5000 = 20 m²(약 6.05평)다.
// (중심선을 4000 × 5000으로 두면 내부는 3850 × 4850 ≈ 18.7 m² ≈ 5.7평이라 이름과 어긋난다 — M-29.)
function buildStudio() {
  const p = createEmptyProject('원룸 6평');
  const f = activeFloor(p);
  f.name = '1층';
  f.height = 2400;
  f.walls = normalizeWalls(rectWalls([0, 0], [4150, 5150], 150, 2400));
  f.rooms = detectRooms(f.walls);
  const room = f.rooms[0];
  room.name = '원룸'; room.height = 2400;
  f.items = placeTemplate(f, room, templateById('studio-basic'));
  return migrate(p);           // 파생값(면적 등)을 앱과 같은 규칙으로 다시 계산한다
}

export const BUILTIN_TEMPLATES = [
  { id: 'builtin-empty', name: '빈 프로젝트', desc: '빈 화면에서 방과 벽을 직접 그립니다.', build: () => migrate(createEmptyProject()) },
  { id: 'builtin-gangdang', name: '강당중 조리실', desc: '방 11개가 그려진 예제 도면으로 시작합니다.', build: () => buildSampleProject() },
  { id: 'builtin-studio', name: '원룸 6평', desc: '침대·옷장·책상이 놓인 원룸 한 칸.', build: buildStudio },
];

const readAll = () => { try { const t = JSON.parse(localStorage.getItem(TEMPLATE_KEY) ?? '[]'); return Array.isArray(t) ? t : []; } catch { return []; } };
// 성공 여부를 돌려준다: 용량 초과·사생활 보호 모드에서는 false → 호출자가 "저장했습니다"라고 속이지 않게 한다.
const writeAll = list => { try { localStorage.setItem(TEMPLATE_KEY, JSON.stringify(list)); return true; } catch { return false; } };

// 배경 이미지는 dataURL이라 용량이 커서 뺀다. 같은 이름의 템플릿은 덮어쓴다.
// 저장이 실패하면(용량 초과 등) null을 돌려준다.
export function saveTemplate(name, project) {
  const clean = { ...structuredClone(project), background: null };
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
