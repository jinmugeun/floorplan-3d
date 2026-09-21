import { activeFloor } from '../state/schema.js';
import { ductLinksOf } from '../state/ductOps.js';

// 2A의 contextMenu가 먹는 배열을 만든다. 실제 동작은 main.js가 넘기는 itemActions가 한다.
export function itemMenuItems({ store, ui, ids, itemActions = {} }) {
  const f = activeFloor(store.get());
  const items = f.items.filter(i => ids.includes(i.id));
  if (!items.length) return null;
  const a = itemActions;
  const call = (name, ...args) => () => a[name]?.(...args);
  const grouped = (f.groups ?? []).some(g => g.itemIds.some(id => ids.includes(id)));
  const allHidden = items.every(i => i.hidden);
  const allLocked = items.every(i => i.locked);
  // 경로 배열 복사는 2D 캔버스에 경로를 그려야 한다: 3D에서는 비활성으로 두고 이유를 알린다(§13.1).
  const in2d = ui.get().mode === '2d';
  // 설비에 이어진 덕트 꼭짓점은 설비 아래에 숨는다: 메뉴에서 바로 그 꼭짓점을 고를 수 있게 한다(§12.5).
  // "연결된 덕트가 있으면"만 보인다 — 설비가 아니거나 연결이 없으면 항목 자체를 뺀다(비활성 표시가 아니다).
  const link = items.length === 1 && items[0].kind === 'equipment' ? (ductLinksOf(f, items[0].id)[0] ?? null) : null;
  return [
    { label: '좌우 반전', shortcut: 'Alt+H', onSelect: call('mirror', 'h') },
    { label: '상하 반전', shortcut: 'Alt+V', onSelect: call('mirror', 'v') },
    { label: '제품 교체', onSelect: call('replace') },
    ...(link ? [{ label: '연결 덕트 선택', onSelect: () => ui.set({ selection: { type: 'duct', id: link.ductId, segment: null, vertex: link.point } }) }] : []),
    'sep',
    { label: '상대이동', shortcut: 'Alt+R', onSelect: call('relativeMove') },
    { label: '직선 배열 복사', shortcut: 'Alt+A', onSelect: call('arrayCopy', 'linear') },
    { label: '원형 배열 복사', shortcut: 'Alt+C', onSelect: call('arrayCopy', 'circular') },
    { label: '회전 복사', shortcut: 'Alt+X', onSelect: call('arrayCopy', 'rotate') },
    { label: '경로 배열 복사', shortcut: 'Alt+S', disabled: !in2d, ...(in2d ? {} : { title: '2D에서 사용' }), onSelect: call('pathArray') },
    'sep',
    { label: '복사', shortcut: 'Ctrl+C', onSelect: call('copy') },
    { label: '붙여넣기', shortcut: 'Ctrl+V', disabled: !(ui.get().clipboard?.length), onSelect: call('paste') },
    { label: '그룹화', shortcut: 'Ctrl+G', disabled: items.length < 2, onSelect: call('group') },
    { label: '그룹 해제', shortcut: 'Ctrl+Shift+G', disabled: !grouped, onSelect: call('ungroup') },
    'sep',
    { label: '같은 제품 선택', disabled: items.length !== 1, onSelect: call('selectSame') },
    { label: allHidden ? '숨김 해제' : '숨김', shortcut: 'Ctrl+H', onSelect: call('toggleHidden') },
    { label: allLocked ? '잠금 해제' : '잠금', shortcut: 'Ctrl+L', onSelect: call('toggleLocked') },
    'sep',
    { label: '삭제', shortcut: '⌫', danger: true, onSelect: call('remove') },
  ];
}
