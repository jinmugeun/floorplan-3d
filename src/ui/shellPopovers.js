// 셸의 팝오버 배선(보기·카메라·햇빛·도움말). shell.js가 300줄 예산에 닿아 설명 주석을 깎던
// 자리라, 계획의 "커지기 전에 나눈다"대로 덩어리째 여기로 옮겼다(리뷰 I-8 · 아키텍처 §9).
// 한 곳에 모이는 규칙 셋: ① 팝오버는 한 번에 하나만 열린다 ② 같은 버튼을 다시 누르면 닫힌다
// ③ 보기 옵션 변경은 되돌릴 단계가 아니다({ record: false }).
import { createPopover } from './popover.js';
import { labelDensity, setLabelDensity } from './prefs.js';
import { viewPopoverHtml, cameraPopoverHtml, sunPopoverHtml } from './viewOptions.js';
import { helpHtml } from './helpPopover.js';

// 보기 옵션의 경로 지정(cameraPreset.elevation → d.view.cameraPreset.elevation).
const setPath = (o, path, v) => { const ks = path.split('.'); let t = o; for (const k of ks.slice(0, -1)) t = t[k]; t[ks.at(-1)] = v; };

// onOpen: 다른 팝업(하단 바 더보기)을 닫아 달라는 신호다 — 셸이 그 배선을 갖고 있다.
// onLabelDensity: 라벨 밀도는 프로젝트가 아니라 브라우저 설정이라 store.dispatch가 아니라
// kvp에 쓴다(§17.10) — 씬을 다시 짓는 것은 배선(main.js)의 일이므로 콜백으로 알린다.
export function createShellPopovers(root, { store, ui, onOpenKeymap = () => {}, onOpen = () => {}, onLabelDensity = () => {} }) {
  const q = s => root.querySelector(s);
  const pop = createPopover(root);
  let popKind = null;
  // 도움말은 현재 화면에 맞는 규칙을 보여 준다: 덕트 도구가 켜져 있으면 덕트, 아니면 2D/3D.
  const popHtml = kind => {
    const v = store.get().view;
    if (kind === 'view') return viewPopoverHtml(v, ui.get().mode === '2d' ? '2d' : '3d');
    if (kind === 'cam') return cameraPopoverHtml(v);
    if (kind === 'sun') return sunPopoverHtml(v);
    if (kind === 'help') return helpHtml(ui.get().tool === 'duct' ? 'duct' : ui.get().mode === '2d' ? '2d' : '3d');
    return '';
  };
  // 접힌 하단 바의 버튼(카메라·햇빛)은 더보기 팝오버 안에 있다. 그 팝오버를 닫으면 버튼이
  // display: none이 되어 rect가 0이 되므로(팝오버가 좌상단으로 튄다) 늘 보이는 "더보기 ▾"를
  // 앵커로 삼는다 — 팝오버는 접힌 바에서도 버튼 근처에 뜬다.
  const anchorFor = el => (el?.closest?.('#bottomMore') ? q('#btnBottomMore') : el);
  // 팝오버 버튼은 눌린 상태가 아니라 "열려 있는지"를 알린다(§14.10).
  const syncPopButtons = () => root.querySelectorAll('[data-popover]').forEach(b => b.setAttribute('aria-expanded', String(pop.isOpen() && popKind === b.dataset.popover)));
  // 보기 옵션은 되돌릴 단계가 아니다(record: false).
  function applyViewChange(ev) {
    const el = ev.target;
    // 라벨 밀도만 스토어가 아니라 로컬 설정이다(§17.10(2)). select는 한 번의 선택에 input → change를
    // 연달아 쏘므로 값이 **실제로 바뀔 때만** 통과시킨다(리뷰 I-1): 한 번 고르면 씬도 한 번만 다시 센다.
    if (el?.dataset?.pref === 'labelDensity') { if (el.value !== labelDensity()) { setLabelDensity(el.value); onLabelDensity(el.value); } return; }
    if (!el || (!el.dataset.v2 && !el.dataset.v3 && !el.dataset.view)) return;
    const value = el.type === 'checkbox' ? el.checked : el.type === 'range' || el.type === 'number' ? Number(el.value) : el.value;
    store.dispatch(d => {
      if (el.dataset.v2) d.view.v2[el.dataset.v2] = value;
      else if (el.dataset.v3) d.view.v3[el.dataset.v3] = value;
      else setPath(d.view, el.dataset.view, value);
    }, { record: false });
    const out = el.parentElement?.querySelector('output'); if (out) out.textContent = `${el.value}${out.dataset.suffix ?? ''}`;
  }
  function onPopoverClick(ev) {
    // 도움말 팝오버의 "단축키 표 열기": 닫고 설정의 단축키 탭을 연다(같은 내용을 두 곳에 적지 않는다).
    if (ev.target?.dataset?.help === 'keymap') { pop.close(); onOpenKeymap(); return; }
    const spec = ev.target?.dataset?.preset;
    if (!spec) return;
    const [key, value] = spec.split(':');
    store.dispatch(d => { setPath(d.view, key, Number(value)); }, { record: false });
    refresh(); // 슬라이더 위치를 새 값으로 다시 그린다
  }
  const handlers = { onChange: applyViewChange, onInput: applyViewChange, onClick: onPopoverClick, onClose: () => { popKind = null; syncPopButtons(); } };
  function open(kind, anchor) {
    const at = anchorFor(anchor);
    onOpen();                            // 팝오버는 한 번에 하나만 열린다(하단 바 더보기를 닫는다)
    if (pop.isOpen() && popKind === kind) { pop.close(); popKind = null; syncPopButtons(); return; }
    popKind = kind;
    pop.open(at, popHtml(kind), handlers);
    syncPopButtons();
  }
  function refresh() { if (pop.isOpen() && popKind) pop.open(anchorFor(root.querySelector(`[data-popover="${popKind}"]`)), popHtml(popKind), handlers); }
  // [?] 버튼도 다른 팝오버 버튼([보기]/[카메라 설정]/[햇빛])과 같은 data-popover 경로를 타므로
  // open의 "이미 열려 있으면 닫는다" 규칙을 그대로 물려받아 두 번째 클릭에 닫힌다.
  root.querySelectorAll('[data-popover]').forEach(b => b.addEventListener('click', () => open(b.dataset.popover, b)));
  return { pop, open, refresh, kind: () => popKind, isOpen: () => pop.isOpen(), close: () => pop.close(), destroy: () => pop.destroy() };
}
