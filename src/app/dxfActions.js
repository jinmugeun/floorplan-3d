// DXF 가져오기의 배선(§18.7). ui/dxfDialog.js는 뷰·저장 표시를 모르므로(ui/는 view2d/·app/을
// import하지 않는다) 그 셋을 여기서 이어 준다. 교체는 store.swap 한 줄이다 — 되돌리기 단계 0개(§17.3).
import { openDxfDialog } from '../ui/dxfDialog.js';
import { confirmDialog } from '../ui/confirmDialog.js';
import { activeFloor } from '../state/schema.js';
import { projectIsEmpty } from './topbar.js';
import { CONFIRM_LOAD, DXF_IMPORTED } from '../ui/messages.js';

export function createDxfActions({
  store, ui, view, toast = () => {}, isDirty = () => false, markSaved = () => {},
  saveNow = () => {}, onProjectSwap = () => {}, confirm = confirmDialog, openDialog = openDxfDialog, workerFactory,
} = {}) {
  // fileActions.loadFile과 **같은 순서**다: 작업 중이면 먼저 묻고, 확인 뒤에 자동 저장본을
  // 최신으로 만들고, 그다음 교체한다. false를 돌려주면 대화상자는 열린 채 남는다.
  const onImported = async ({ project, stats }) => {
    if (!projectIsEmpty(store.get()) && isDirty()) {
      if (!(await confirm(CONFIRM_LOAD))) return false;
      saveNow();
    }
    store.swap(project);
    view.fit();
    onProjectSwap();
    markSaved('none');                 // 가져온 직후는 저장한 것이 아니다("저장 이력 없음")
    // 끊긴 끝점 안내는 이 기능의 결론이다(§18.10): 배너와 2D 마커가 같은 배열을 본다.
    // **순서**는 openEnds2d.js의 머리 주석이 못 박은 계약이다(Task 13 리뷰 I-3): 이 ui.set은
    // 반드시 store.swap **뒤**다 — 안내는 켜지는 순간의 벽 기하를 기준으로 삼으므로, 먼저 켜면
    // 뒤따르는 swap이 안내를 조용히 지운다. floor는 가져온 층의 **id**다(Task 13 재검토 I-4):
    // 다른 층으로 가면 배너도 빨간 ✚도 감춘다(번호가 아니라 id라 앞 층을 지워도 어긋나지 않는다).
    ui.set({
      selection: null, soloRoom: null, matPick: null,
      openEnds: stats.openEnds?.length ? { pts: stats.openEnds, index: 0, floor: activeFloor(store.get())?.id } : null,
    });
    toast(DXF_IMPORTED(stats.walls, stats.rooms));
    return true;
  };
  const open = (file = null) => openDialog({ file, workerFactory, onImported, toast });
  return { open, onDxfFile: f => open(f) };
}
