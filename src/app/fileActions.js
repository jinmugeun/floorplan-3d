// 파일 열기·캡처·캔버스 드롭 배선(§9). main.js가 283줄이라 "더하기 전에 나눈다"는 전역 규칙을 따라
// 여기로 옮겼다 — 계획 4의 app/deleteActions.js, 계획 5의 app/arrangeActions.js와 같은 자리다.
// 동작은 옮기기 전과 같다(문구·순서 포함).
import { parseProject, readTextFile, capture2D, filenameFor } from '../io/file.js';
import { openBackgroundDialog } from '../ui/backgroundDialog.js';
import { confirmDialog } from '../ui/confirmDialog.js';
import { CONFIRM_LOAD, LOADED } from '../ui/messages.js';
import { projectIsEmpty } from './topbar.js';

// isDirty 기본값이 false인 것은 판정을 넘기지 않는 기존 호출자(드롭 배선 테스트)를 위한 것이다
// — confirmLeave는 반대로 true(묻는 쪽)를 기본값으로 쓴다. 새로 배선하는 곳은 반드시 넘긴다(m2).
export function createFileActions({ store, ui, view, view3d, toast = () => {}, confirm = confirmDialog, isDirty = () => false, markSaved = () => {}, saveNow = () => {} }) {
  async function loadFile(file) {
    if (!file) return;                            // 파일 선택 취소
    // §15.13(감사 §19): 작업 중이면 먼저 묻는다. 빈 프로젝트나 저장 직후에는 잃을 것이 없다.
    if (!projectIsEmpty(store.get()) && isDirty()) {
      if (!(await confirm(CONFIRM_LOAD))) return;
      saveNow();                                  // 확인 뒤·교체 전에 자동 저장본을 최신으로 만든다:
                                                  // 문구가 약속한 "자동 저장본은 남습니다"를 사실로 한다
    }
    // 불러온 직후는 "파일과 같은 상태"이지만 저장한 것은 아니다: 표시는 "저장 이력 없음"이 사실이다
    // (이 순간 자동 저장본은 방금 남긴 직전 프로젝트다 — "자동 저장됨"이라고 적으면 거짓이다).
    try { store.replace(parseProject(await readTextFile(file))); view.fit(); markSaved('none'); toast(LOADED); }
    catch (e) { toast(e.message); }
  }
  function openFileDialog() {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = '.json,application/json';
    i.onchange = () => loadFile(i.files[0]);
    i.click();
  }
  async function captureNow() {
    try {
      const url = ui.get().mode === '2d' ? await capture2D(store, ui) : view3d.capture();
      const a = document.createElement('a');
      a.href = url; a.download = filenameFor(store.get()).replace('.json', '.png'); a.click();
    } catch (e) { toast(e.message); }
  }
  // 캔버스 영역에 떨어뜨린 파일: JSON은 프로젝트로 열고, 이미지는 배경 도면 대화상자로 보낸다.
  // 이 리스너는 #canvasWrap에, 제품 드래그 리스너(§14.11)는 그 안의 #c2d에 붙는다: 한 드롭이
  // 두 경로를 지나므로 둘 다 자기 페이로드만 본다(여기는 dataTransfer.files, 저기는 ui.dragProduct)
  // — 어느 쪽도 stopPropagation을 부르지 않는다(부르면 나머지 한쪽이 조용히 죽는다).
  function wireDrop(el) {
    if (!el) return;
    el.addEventListener('dragover', ev => ev.preventDefault());
    el.addEventListener('drop', ev => {
      ev.preventDefault();
      const file = ev.dataTransfer?.files?.[0];
      if (!file) return;
      if (file.type === 'application/json' || /\.json$/i.test(file.name)) loadFile(file);
      else if (/^image\//.test(file.type)) openBackgroundDialog({ store });
    });
  }
  return { loadFile, openFileDialog, captureNow, wireDrop };
}
