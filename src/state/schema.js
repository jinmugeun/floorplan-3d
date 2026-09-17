let counter = 0;
export const SCHEMA_VERSION = 1;

export function uid(prefix = 'id') {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

export function createFloor(name = 'Floor 1') {
  return { id: uid('f'), name, height: 2300, walls: [], rooms: [], items: [], ducts: [], guides: [], groups: [] };
}

export function createEmptyProject(name = '새 프로젝트') {
  return {
    version: SCHEMA_VERSION,
    name,
    units: 'mm',
    background: null,
    floors: [createFloor()],
    activeFloor: 0,
    camera: { mode: '2d', target: [0, 0], azimuth: 47, elevation: 35, zoom: 1 },
    view: { grid: true, labels: true, dimensions: true, cutaway: true, wallOpacity: 1, background: true, collision: true },
  };
}

export function migrate(p) {
  if (!p || typeof p !== 'object') throw new Error('프로젝트 파일이 아닙니다');
  if (p.version === SCHEMA_VERSION) return p;
  if (p.version === undefined) return { ...createEmptyProject(), ...p, version: SCHEMA_VERSION };
  throw new Error(`지원하지 않는 파일 버전입니다: ${p.version}`);
}

export function activeFloor(p) {
  return p.floors[p.activeFloor ?? 0];
}
