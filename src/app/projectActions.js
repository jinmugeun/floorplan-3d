// 프로젝트 단위 동작(새로 만들기 · 템플릿으로 저장 · JSON 내보내기 · 나가기 · 시작 화면).
// main.js가 267줄이라 여기로 뺐다(계획 4의 deleteActions · 계획 5의 arrangeActions ·
// 계획 6의 fileActions·dndActions와 같은 자리). 네 동작이 모두 §15.7의 dirty 판정을 쓰므로
// 한 파일에 모이는 것이 자연스럽다.
import { createEmptyProject } from '../state/schema.js';
import { serializeProject, downloadText, filenameFor } from '../io/file.js';
import { templateProject, saveTemplate, listTemplates, BUILTIN_TEMPLATES } from '../templates/projectTemplates.js';
import { loadSample } from '../samples/gangdang.js';
import { openStartScreen } from '../ui/startScreen.js';
import { openBackgroundDialog } from '../ui/backgroundDialog.js';
import { confirmDialog } from '../ui/confirmDialog.js';
import { promptDialog } from '../ui/promptDialog.js';
import { projectIsEmpty, confirmLeave } from './topbar.js';
import { RESTORED, TEMPLATE_SAVED, TEMPLATE_SAVE_FAIL, JSON_EXPORTED, NAME_REQUIRED, TEMPLATE_NAME_TAKEN } from '../ui/messages.js';

export function createProjectActions({ store, ui, view, toast = () => {}, restored = null, isDirty = () => true, markSaved = () => {}, saveNow = () => {} }) {
  // 자동 저장본은 브라우저 대화상자로 묻지 않는다: 시작 화면의 "이어서 작업" 카드로 제안한다(§12.5).
  function showStart({ restore = restored, onClose = () => {} } = {}) {
    openStartScreen({
      store,
      restored: restore,
      onClose,
      // 복원은 되돌릴 단계가 아니고, 복원한 상태는 자동 저장본과 같으므로 "자동 저장됨"이 사실이다
      // (§15.7). 다만 표시 시각은 자동 저장 시각이 아니라 복원 시각이다 — 저장본에 시각이 없다.
      onRestore: () => { if (restore) { store.replace(restore, { record: false }); view.fit(); markSaved('auto'); toast(RESTORED); } },
      onEmpty: () => {},
      onUpload: () => openBackgroundDialog({ store }),
      onSample: () => { loadSample(store); view.fit(); },
      onTemplate: id => { const p = templateProject(id); if (p) { store.replace(p); view.fit(); } },
    });
  }

  // 더보기 메뉴의 "템플릿으로 저장". 이름은 프로젝트 이름을 기본값으로 묻고, 이미 있는 이름은 막는다
  // (saveTemplate은 같은 이름을 조용히 덮어쓴다 — 실수로 저장해 둔 템플릿을 지우지 않게 여기서 거른다).
  async function saveAsTemplate() {
    const taken = new Set([...listTemplates(), ...BUILTIN_TEMPLATES].map(t => String(t.name).trim()));
    const name = await promptDialog({
      title: '템플릿으로 저장', label: '템플릿 이름', value: store.get().name, ok: '저장',
      validate: t => (!t.trim() ? NAME_REQUIRED : taken.has(t.trim()) ? TEMPLATE_NAME_TAKEN : null),
    });
    if (name === null) return;
    const saved = saveTemplate(name, store.get());
    toast(saved ? TEMPLATE_SAVED(saved.name) : TEMPLATE_SAVE_FAIL);
  }

  const actions = {
    newProject: async () => {
      // §15.7: 빈 프로젝트나 저장 직후에는 묻지 않는다(잃을 것이 없다).
      const risky = !projectIsEmpty(store.get()) && isDirty();
      if (risky && !(await confirmDialog({ title: '새로 만들기', message: '현재 도면이 초기화됩니다. 새로 만들까요?', ok: '새로 만들기' }))) return;
      store.replace(createEmptyProject());
      ui.set({ selection: null, soloRoom: null, matPick: null });
      view.fit();
      markSaved('none');                 // 빈 프로젝트는 "저장 안 된 변경"도, 저장된 것도 아니다
      showStart({ restore: null });      // 방금 비웠으므로 "이어서 작업" 카드는 뜻이 없다
    },
    saveAsTemplate,
    exportJson: () => { downloadText(filenameFor(store.get()), serializeProject(store.get())); toast(JSON_EXPORTED); },
    // 시작 화면은 샘플·템플릿으로 프로젝트를 갈아 끼운다: 작업 중이면 먼저 묻는다(새로만들기와 같은 규칙).
    exit: async () => { if (await confirmLeave(store.get(), { saveNow, dirty: isDirty() })) showStart({ restore: null }); },
  };

  return { actions, showStart };
}
