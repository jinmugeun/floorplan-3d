// 셸 마크업 한 곳(§9의 파일 배치 규칙 + §14.1·§14.3이 이 마크업을 여러 번 고친다).
// shell.js가 277줄이라 "더하기 전에 나눈다"는 전역 규칙을 따랐다: 이 파일은 문자열만 만들고
// 스토어·DOM·이벤트를 모른다(그래서 마크업을 고치는 태스크가 배선 코드를 건드리지 않는다).
import { esc } from '../util/html.js';

export function shellHtml({ name = '' } = {}) {
  return `
  <div id="layout">
    <header id="topbar">
      <div class="group"><button id="btnUndo" aria-label="실행 취소">↶</button><button id="btnRedo" aria-label="다시 실행">↷</button></div>
      <div class="group"><input id="projectName" aria-label="프로젝트 이름" value="${esc(name)}"><span id="savedAt" class="muted">저장 이력 없음</span></div>
      <div class="group"><button id="btnRender">렌더샷</button><button id="btnGallery">갤러리</button><button id="btnEstimate">실시간 견적서</button><button id="btnSpec">시방서</button><button id="btnNew">새로만들기</button><button id="btnMore" aria-label="더보기">더보기 ▾</button></div>
      <div class="group"><button id="btnHelp" data-popover="help" aria-label="도움말">?</button><button id="btnSettings" aria-label="설정">설정</button><button id="btnCapture" data-action="capture">캡처</button><button id="btnLoad">불러오기</button><button id="btnSave" class="primary">저장</button></div>
    </header>
    <nav id="rail" aria-label="작업 영역">
      <button data-panel="draw" class="on"><span>도면 그리기</span></button>
      <button data-panel="products"><span>제품</span></button>
      <button data-panel="materials"><span>마감재</span></button>
      <button data-panel="background"><span>배경 도면</span></button>
      <button data-panel="airflow"><span>풍량</span></button>
      <button data-panel="layers"><span>레이어</span></button>
    </nav>
    <aside id="panel">
      <section data-panel="draw">
        <h3>방 만들기</h3>
        <button data-tool="wall">벽 그리기 <kbd>L</kbd></button>
        <button data-tool="room">방 그리기 <kbd>F</kbd></button>
        <button data-tool="delete">삭제 <kbd>D</kbd></button>
        <h3>구조물</h3>
        <button data-tool="column-square">사각 기둥 <kbd>R</kbd></button>
        <button data-tool="column-round">원형 기둥 <kbd>C</kbd></button>
        <button data-tool="opening">개구부 <kbd>O</kbd></button>
        <h3>도면 반전 / 회전</h3>
        <div class="row"><button data-action="flipH">좌우 반전</button><button data-action="flipV">상하 반전</button><button data-action="rotL">↺ 90°</button><button data-action="rotR">↻ 90°</button></div>
        <h3>보조선 그리기</h3>
        <button data-tool="guide">보조선 <kbd>E</kbd></button>
        <button data-tool="measure">측정 <kbd>M</kbd></button>
        <h3>환기 덕트</h3>
        <button data-tool="duct">덕트 그리기 <kbd>T</kbd></button>
        <h3>일반</h3>
        <button data-tool="select">선택 <kbd>Esc</kbd></button>
      </section>
      <section data-panel="products" hidden><h3>제품</h3><div id="library"></div></section>
      <section data-panel="materials" hidden><h3>마감재</h3><div id="materials"></div></section>
      <section data-panel="background" hidden>
        <h3>배경 도면</h3>
        <button data-action="background">도면 이미지 업로드 <kbd>B</kbd></button>
        <p class="hint">사진이나 스캔을 올리고 모서리를 찍어 펴고, 두 점으로 축척을 잡습니다.</p>
      </section>
      <section data-panel="airflow" hidden><h3>풍량 집계</h3><div id="airflow"></div></section>
      <section data-panel="layers" hidden><h3>리소스 관리</h3><div id="layers"></div></section>
    </aside>
    <div id="panelSplitter" class="splitter" role="separator" aria-orientation="vertical" aria-label="작업 패널 폭 조절"></div>
    <main id="canvasWrap">
      <div id="optionBar" hidden></div>
      <div id="banner" hidden></div>
      <div id="canvasStack">
        <canvas id="c2d"></canvas>
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
    <aside id="right"><div id="minimap"><div class="mm-label">미니맵</div><canvas></canvas></div><div id="props"></div></aside>
    <footer id="bottombar">
      <div class="seg"><button data-mode="2d" class="on">2D</button><button data-mode="plan">평면 <kbd>2</kbd></button><button data-mode="iso">3D <kbd>3</kbd></button><button data-mode="fp">1인칭 <kbd>4</kbd></button></div>
      <div class="seg"><button id="btnView" data-popover="view">보기</button><button id="btnCam" data-popover="cam" hidden>카메라 설정</button><button id="btnSun" data-popover="sun" hidden>햇빛</button></div>
      <div class="seg"><button id="btnLock">도면 잠금</button><button data-action="capture">스크린 캡쳐</button></div>
      <div class="seg"><button id="btnZoomIn" aria-label="도면 확대">＋</button><button id="btnZoomOut" aria-label="도면 축소">－</button><button id="btnFit">화면 맞추기</button></div>
      <div class="seg"><label class="muted">2D 투영 <select id="viewPreset" aria-label="2D 투영 뷰"><option value="">—</option><option value="front">정면</option><option value="back">배면</option><option value="left">좌측</option><option value="right">우측</option><option value="top">평면</option><option value="bottom">저면</option></select></label></div>
      <div class="seg"><button id="btnGizmoMode" aria-label="3D 기즈모 모드" hidden>이동</button></div>
      <div class="seg" id="unitSeg"><button data-units="mm" class="on">mm</button><button data-units="ftin">ft·in</button></div>
      <div class="seg" id="rightToggleSeg"><button id="btnRightPanel" hidden>속성 ▸</button></div>
    </footer>
  </div>`;
}
