// 셸 마크업 한 곳(§9의 파일 배치 규칙 + §14.1·§14.3이 이 마크업을 여러 번 고친다).
// shell.js가 277줄이라 "더하기 전에 나눈다"는 전역 규칙을 따랐다: 이 파일은 문자열만 만들고
// 스토어·DOM·이벤트를 모른다(그래서 마크업을 고치는 태스크가 배선 코드를 건드리지 않는다).
import { esc } from '../util/html.js';
import { CANVAS_LABEL, MINIMAP_LABEL } from './messages.js';

export function shellHtml({ name = '' } = {}) {
  return `
  <div id="layout">
    <header id="topbar">
      <!-- §16.5(감사 §38): 상단 바 13개 모두 title을 갖고, 단축키는 대괄호 표기로 함께 알린다. -->
      <div class="group"><button id="btnUndo" title="실행 취소 [Ctrl+Z]" aria-label="실행 취소">↶</button><button id="btnRedo" title="다시 실행 [Ctrl+Shift+Z]" aria-label="다시 실행">↷</button></div>
      <div class="group"><input id="projectName" aria-label="프로젝트 이름" value="${esc(name)}"><span id="savedAt" class="muted">저장 이력 없음</span></div>
      <div class="group"><button id="btnRender" title="렌더샷 — 고해상도 이미지 한 장">렌더샷</button><button id="btnGallery" title="갤러리 — 저장한 렌더샷">갤러리</button><button id="btnEstimate" title="실시간 견적서 — 제품·마감재·덕트 물량">실시간 견적서</button><button id="btnSpec" title="시방서 — 인쇄용 도면·표">시방서</button><button id="btnNew" title="새로만들기">새로만들기</button><button id="btnMore" title="더보기" aria-label="더보기">더보기 ▾</button></div>
      <div class="group"><button id="btnHelp" data-popover="help" title="도움말" aria-label="도움말" aria-expanded="false">?</button><button id="btnSettings" title="설정 [Ctrl+,]" aria-label="설정">설정</button><button id="btnCapture" data-action="capture" title="화면 캡처">캡처</button><button id="btnLoad" title="불러오기 — JSON 파일 열기">불러오기</button><button id="btnSave" class="primary" title="저장 [Ctrl+S]">저장</button></div>
    </header>
    <nav id="rail" aria-label="작업 영역">
      <button data-panel="draw" class="on" title="도면 그리기" aria-pressed="true"><span>도면 그리기</span></button>
      <button data-panel="products" title="제품" aria-pressed="false"><span>제품</span></button>
      <button data-panel="materials" title="마감재" aria-pressed="false"><span>마감재</span></button>
      <button data-panel="background" title="배경 도면" aria-pressed="false"><span>배경 도면</span></button>
      <button data-panel="airflow" title="풍량" aria-pressed="false"><span>풍량</span></button>
      <button data-panel="layers" title="레이어" aria-pressed="false"><span>레이어</span></button>
    </nav>
    <aside id="panel">
      <section data-panel="draw">
        <h3>방 만들기</h3>
        <button data-tool="wall" title="벽 그리기 [L]" aria-pressed="false">벽 그리기 <kbd>L</kbd></button>
        <button data-tool="room" title="방 그리기 [F]" aria-pressed="false">방 그리기 <kbd>F</kbd></button>
        <button data-tool="delete" title="삭제 도구 [D]" aria-pressed="false">삭제 <kbd>D</kbd></button>
        <h3>구조물</h3>
        <button data-tool="column-square" title="사각 기둥 [R]" aria-pressed="false">사각 기둥 <kbd>R</kbd></button>
        <button data-tool="column-round" title="원형 기둥 [C]" aria-pressed="false">원형 기둥 <kbd>C</kbd></button>
        <button data-tool="opening" title="개구부 [O]" aria-pressed="false">개구부 <kbd>O</kbd></button>
        <h3>도면 반전 / 회전</h3>
        <div class="row"><button data-action="flipH" title="도면 전체를 좌우로 뒤집습니다">좌우 반전</button><button data-action="flipV" title="도면 전체를 상하로 뒤집습니다">상하 반전</button><button data-action="rotL" title="도면 전체를 반시계로 90° 회전" aria-label="반시계 90도 회전">↺ 90°</button><button data-action="rotR" title="도면 전체를 시계로 90° 회전" aria-label="시계 90도 회전">↻ 90°</button></div>
        <h3>보조선 그리기</h3>
        <button data-tool="guide" title="보조선 [E]" aria-pressed="false">보조선 <kbd>E</kbd></button>
        <button data-tool="measure" title="측정 [M]" aria-pressed="false">측정 <kbd>M</kbd></button>
        <h3>환기 덕트</h3>
        <button data-tool="duct" title="덕트 그리기 [T]" aria-pressed="false">덕트 그리기 <kbd>T</kbd></button>
        <h3>일반</h3>
        <button data-tool="select" title="선택 [Esc]" aria-pressed="false">선택 <kbd>Esc</kbd></button>
      </section>
      <section data-panel="products" hidden><h3>제품</h3><div id="library"></div></section>
      <section data-panel="materials" hidden><h3>마감재</h3><div id="materials"></div></section>
      <section data-panel="background" hidden>
        <h3>배경 도면</h3>
        <button data-action="background">도면 이미지 업로드 <kbd>B</kbd></button>
        <p class="hint">사진이나 스캔을 올리고 모서리를 찍어 펴고, 두 점으로 축척을 잡습니다.</p>
      </section>
      <section data-panel="airflow" hidden><h3>풍량 집계</h3><div id="airflow"></div></section>
      <!-- 레일 라벨과 패널 제목은 같은 이름이다(§16.8 · 감사 §33): 두 이름은 "다른 화면"으로 읽혔다. -->
      <section data-panel="layers" hidden><h3>레이어</h3><div id="layers"></div></section>
    </aside>
    <div id="panelSplitter" class="splitter" role="separator" aria-orientation="vertical" aria-label="작업 패널 폭 조절"></div>
    <main id="canvasWrap">
      <div id="optionBar" hidden></div>
      <div id="banner" hidden></div>
      <div id="canvasStack">
        <canvas id="c2d" role="application" aria-label="${CANVAS_LABEL}"></canvas>
        <div id="c3d" hidden></div>
        <div id="imageStrip" hidden>
          <span class="muted">이미지 세팅</span>
          <label>투명도 <input type="range" name="stripOpacity" min="0" max="1" step="0.05"></label>
          <label><input type="checkbox" name="stripVisible"> 표시</label>
          <button type="button" id="btnBgLock" aria-label="배경 도면 잠금">잠금</button>
        </div>
      </div>
    </main>
    <div id="rightSplitter" class="splitter" role="separator" aria-orientation="vertical" aria-label="속성 패널 폭 조절"></div>
    <aside id="right"><div id="minimap"><div class="mm-label">미니맵</div><canvas aria-label="${MINIMAP_LABEL}"></canvas></div><div id="props"></div></aside>
    <footer id="bottombar">
      <div class="seg"><button data-mode="2d" class="on" title="2D 도면 [1]" aria-pressed="true">2D</button><button data-mode="plan" title="평면 뷰어 [2]" aria-pressed="false">평면 <kbd>2</kbd></button><button data-mode="iso" title="ISO 3D [3]" aria-pressed="false">3D <kbd>3</kbd></button><button data-mode="fp" title="1인칭 [4]" aria-pressed="false">1인칭 <kbd>4</kbd></button></div>
      <div class="seg"><button id="btnView" data-popover="view" title="보기 옵션 — 격자·라벨·컷어웨이" aria-expanded="false">보기</button></div>
      <div class="seg" id="seg3d" data-overflow="1"><button id="btnCam" data-popover="cam" title="카메라 설정 — 고도·방위·시야각" aria-expanded="false" hidden>카메라 설정</button><button id="btnSun" data-popover="sun" title="햇빛 — 시각·방위" aria-expanded="false" hidden>햇빛</button></div>
      <!-- data-overflow의 값은 접기 단계다(bottomBar.js): 1 = 3D 전용, 2 = 도면 잠금, 3 = 단위.
           1100 px에서는 1단계 + 꼬리 라벨 아이콘화로도 133 px이 남아 sticky 꼬리가 단위 묶음을
           94 px 덮었다(리뷰 I-1) — 꼬리가 붙기 전에 2·3단계를 접는 것이 "겹침 0"의 조건이다. -->
      <div class="seg" id="segLock" data-overflow="2"><button id="btnLock" title="도면 잠금 — 벽·방을 실수로 옮기지 않게" aria-pressed="false">도면 잠금</button></div>
      <!-- 상단 바와 같은 동작(data-action="capture")이므로 같은 표기다(§16.8 · 감사 §34). -->
      <div class="seg" id="segCapture" data-overflow="1"><button data-action="capture" title="화면 캡처">캡처</button></div>
      <div class="seg" id="segPreset" data-overflow="1"><label class="muted">2D 투영 <select id="viewPreset" aria-label="2D 투영 뷰"><option value="">—</option><option value="front">정면</option><option value="back">배면</option><option value="left">좌측</option><option value="right">우측</option><option value="top">평면</option><option value="bottom">저면</option></select></label></div>
      <div class="seg" id="segGizmo" data-overflow="1"><button id="btnGizmoMode" title="3D 기즈모 모드 — 이동 ↔ 회전" aria-label="3D 기즈모 모드" aria-pressed="false" hidden>이동</button></div>
      <div class="seg" id="unitSeg" data-overflow="3"><button data-units="mm" class="on" title="치수를 밀리미터로" aria-pressed="true">mm</button><button data-units="ftin" title="치수를 피트·인치로" aria-pressed="false">ft·in</button></div>
      <!-- 오른쪽 끝의 묶음들은 바가 가로로 넘쳐도 늘 보여야 한다(§14.3의 "두 번 클릭" 프로브):
           한 겹으로 감싸 sticky로 붙여 둔다 — 각각 sticky로 하면 서로 겹친다.
           줌도 여기 있다: §14.3이 "모드·보기·줌은 항상 보인다"로 못 박은 셋 중 줌만 스크롤 밖에
           있었고, 불투명한 이 꼬리가 scrollLeft 0에서 바로 그 줌 묶음을 덮었다(Task 3의 87 px).
           덮이는 쪽은 이제 상대적으로 덜 급한 단위·잠금 묶음이다. -->
      <div id="bottomTail">
        <div class="seg"><button id="btnZoomIn" title="도면 확대 [+]" aria-label="도면 확대">＋</button><button id="btnZoomOut" title="도면 축소 [-]" aria-label="도면 축소">－</button><button id="btnFit" title="화면 맞추기 [0]" aria-label="화면 맞추기"><span class="wide">화면 맞추기</span><span class="narrow" aria-hidden="true">⤢</span></button></div>
        <!-- 압축된 바에서는 꼬리 자신부터 줄인다(§15.4 · 리뷰 I-1의 1순위): 라벨을 아이콘으로 바꿔
             꼬리 폭 ~199 px에서 ~67 px을 되찾는다. 이름은 title·aria-label에 남는다(#btnFit과 같은 패턴). -->
        <div class="seg"><button id="btnBottomMore" title="더보기" aria-label="더보기" aria-expanded="false" aria-controls="bottomMore" hidden><span class="wide">더보기 ▾</span><span class="narrow" aria-hidden="true">▾</span></button></div>
        <div class="seg" id="rightToggleSeg"><button id="btnRightPanel" title="속성 패널" aria-label="속성 패널" hidden><span class="wide">속성 ▸</span><span class="narrow" aria-hidden="true">▸</span></button></div>
      </div>
    </footer>
    <div id="bottomMore" class="bottom-more" hidden></div>
    <!-- 알림 영역은 상주한다(§15.14): 라이브 영역은 갱신 전에 DOM에 있어야 첫 알림도 낭독된다.
         position: fixed라 #layout의 그리드 흐름을 차지하지 않는다(#bottomMore와 같다). -->
    <div id="toasts" role="status" aria-live="polite"></div>
  </div>`;
}
