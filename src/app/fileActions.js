// 파일 열기·캡처·캔버스 드롭 배선(§9). main.js가 283줄이라 "더하기 전에 나눈다"는 전역 규칙을 따라
// 여기로 옮겼다 — 계획 4의 app/deleteActions.js, 계획 5의 app/arrangeActions.js와 같은 자리다.
// 동작은 옮기기 전과 같다(문구·순서 포함).
import { parseProject, readTextFile, capture2D, filenameFor } from '../io/file.js';
import { openBackgroundDialog } from '../ui/backgroundDialog.js';

export function createFileActions({ store, ui, view, view3d, toast = () => {} }) {
  async function loadFile(file) {
    if (!file) return;                            // 파일 선택 취소
    try { store.replace(parseProject(await readTextFile(file))); view.fit(); toast('불러왔습니다'); }
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
