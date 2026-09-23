// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { optionBarHtml, applyOptionInput, dimBarHtml, dimBarSignature, syncDimBar, autoFocusDim, OPTION_LABELS, OPTION_TITLES, OPTION_RANGE, rangeOf, DIM_LABELS, LEN_OPTS, unitLabel } from '../src/ui/optionBar.js';
import { DUCT_RANGE } from '../src/state/ductSchema.js';
import { fmtLen } from '../src/util/units.js';

describe('옵션 바 HTML', () => {
  test('옵션이 없으면 빈 문자열이다(행이 접힌다)', () => {
    expect(optionBarHtml(null)).toBe('');
    expect(optionBarHtml({ name: 'x', opts: {} })).toBe('');
    expect(optionBarHtml({ name: 'x', opts: {}, hint: '안내' })).toBe(''); // 안내 문구는 배너가 맡는다
  });

  test('짧은 라벨 + 긴 이름 title + 현재 단위', () => {
    const html = optionBarHtml({ name: 'wall', opts: { thickness: 200, snap: true } }, { units: 'mm' });
    expect(html).toContain('W (mm)');
    expect(html).toContain('title="벽 두께"');
    expect(html).toContain('name="thickness"');
    expect(html).toContain('type="checkbox"');
    expect(OPTION_LABELS.thickness).toBe('W');
    expect(OPTION_TITLES.w).toBe('단면 너비');
    expect(LEN_OPTS.has('z')).toBe(true);
    expect(unitLabel('ftin')).toBe('ft·in');
  });

  test('구조물 옵션(D · 바닥에서)도 짧은 라벨과 길이 단위를 갖는다(§13.2)', () => {
    expect(OPTION_LABELS.d).toBe('D');
    expect(OPTION_LABELS.sill).toBe('바닥에서');
    expect(OPTION_TITLES.d).toBe('기둥 깊이');
    expect(OPTION_TITLES.sill).toBe('바닥에서 개구부 밑선까지');
    expect(LEN_OPTS.has('d')).toBe(true);
    expect(LEN_OPTS.has('sill')).toBe(true);
    const col = optionBarHtml({ name: 'column-square', opts: { w: 400, d: 400, h: 2300 } }, { units: 'mm' });
    expect(col).toContain('D (mm)');
    expect(col).toContain('name="d"');
    const op = optionBarHtml({ name: 'opening', opts: { w: 900, h: 2100, sill: 0 } }, { units: 'ftin' });
    expect(op).toContain('바닥에서 (ft·in)');
    expect(op).toContain('name="sill"');
    expect(op).toContain('data-len="1"');
  });

  test('ft·in 모드의 길이 옵션은 텍스트 입력이다', () => {
    const html = optionBarHtml({ name: 'duct', opts: { w: 750, h: 400, z: 2900 } }, { units: 'ftin' });
    expect(html).toContain('W (ft·in)');
    expect(html).toContain('data-len="1"');
    expect(html).not.toContain('type="number"');
  });

  test('select 옵션(기준선·종류·방향)은 목록으로 나온다', () => {
    const ref = optionBarHtml({ name: 'wall', opts: { reference: 'inner' } });
    expect(ref).toContain('<option value="inner" selected>내벽선</option>');
    const kind = optionBarHtml({ name: 'duct', opts: { kind: 'supply' } });
    expect(kind).toContain('>급기<');
    const dir = optionBarHtml({ name: 'guide', opts: { direction: 'h' } });
    expect(dir).toContain('>가로<');
  });
});

describe('옵션 바 입력 읽기', () => {
  const el = (patch = {}) => ({ name: 'thickness', type: 'number', value: '150', checked: false, dataset: {}, ...patch });

  test('숫자·체크박스·텍스트를 opts에 반영한다', () => {
    const tool = { opts: { thickness: 200, snap: false, system: '' } };
    expect(applyOptionInput(tool, el(), 'mm')).toBe(true);
    expect(tool.opts.thickness).toBe(150);
    applyOptionInput(tool, el({ name: 'snap', type: 'checkbox', checked: true }), 'mm');
    expect(tool.opts.snap).toBe(true);
    applyOptionInput(tool, el({ name: 'system', type: 'text', value: 'F-3' }), 'mm');
    expect(tool.opts.system).toBe('F-3');
  });

  test('ft·in 텍스트는 mm로 되돌려 저장하고 읽을 수 없으면 현재 값으로 되돌린다', () => {
    const tool = { opts: { thickness: 200 } };
    const good = el({ type: 'text', value: `1' 0.5"`, dataset: { len: '1' } });
    expect(applyOptionInput(tool, good, 'ftin')).toBe(true);
    expect(tool.opts.thickness).toBe(318);            // 12.5인치 = 317.5 → 반올림
    const bad = el({ type: 'text', value: '엉터리', dataset: { len: '1' } });
    expect(applyOptionInput(tool, bad, 'ftin')).toBe(false);
    expect(tool.opts.thickness).toBe(318);
    expect(bad.value).toBe(`1' 0.5"`);                // 입력란을 현재 값으로 되돌린다(fmtLen의 ft·in 표기)
  });

  test('같은 값이면 false를 돌려주고 opts를 건드리지 않는다(§16.1)', () => {
    const tool = { opts: { thickness: 200, snap: true } };
    expect(applyOptionInput(tool, el({ value: '200' }), 'mm')).toBe(false);
    expect(applyOptionInput(tool, el({ name: 'snap', type: 'checkbox', checked: true }), 'mm')).toBe(false);
    // opts에 없는 이름은 만들지 않는다(치수 칸 name="dim:len"이 옵션으로 새지 않게 — Task 8).
    expect(applyOptionInput(tool, el({ name: 'dim:len', value: '3000' }), 'mm')).toBe(false);
    expect(tool.opts['dim:len']).toBeUndefined();
  });

  test('도구도 이름도 없으면 아무 일도 하지 않는다', () => {
    expect(applyOptionInput(null, el(), 'mm')).toBe(false);
    expect(applyOptionInput({ opts: {} }, el({ name: '' }), 'mm')).toBe(false);
  });

  // 리뷰 I-3: ft·in 표기는 파싱과 왕복하지 않는다(7.9" → 200.66 → 201) → 옵션 바 길이 칸도
  // 무편집 [Enter]만으로 값이 밀렸다. 속성 패널과 같은 readLen이 data-mm으로 판정한다.
  test('ft·in 칸을 고치지 않고 확정하면 값이 밀리지 않는다(리뷰 I-3)', () => {
    const tool = { opts: { thickness: 200 } };
    const kept = el({ type: 'text', value: fmtLen(200, 'ftin'), dataset: { len: '1', mm: '200' } });
    expect(applyOptionInput(tool, kept, 'ftin')).toBe(false);
    expect(tool.opts.thickness).toBe(200);            // 예전에는 201로 밀렸다
    // 실제로 고친 값은 그대로 반영된다.
    expect(applyOptionInput(tool, el({ type: 'text', value: '10"', dataset: { len: '1', mm: '200' } }), 'ftin')).toBe(true);
    expect(tool.opts.thickness).toBe(254);
    // 그리기 쪽이 그 기준값을 싣는다.
    expect(optionBarHtml({ name: 'wall', opts: { thickness: 200 } }, { units: 'ftin' })).toContain('data-mm="200"');
  });
});

describe('옵션 바의 치수 칸(§16.7)', () => {
  const wallTool = (len = 3000, typed = '') => ({
    name: 'wall', opts: { thickness: 200 },
    dims: () => ({ fields: [{ key: 'len', text: typed || String(len), mm: len, active: true }] }),
  });

  test('도구가 치수 칸을 내놓으면 라벨·단위·step이 붙는다', () => {
    const html = dimBarHtml(wallTool(), { units: 'mm' });
    expect(html).toContain('name="dim:len"');
    expect(html).toContain(`${DIM_LABELS.len} (mm)`);
    expect(html).toContain('step="10"');
    expect(html).toContain('class="dim on"');
    expect(DIM_LABELS.len).toBe('길이');
    expect(dimBarHtml({ name: 'select', opts: {} }, { units: 'mm' })).toBe('');   // 그리지 않는 도구
  });

  test('ft·in 모드에서는 텍스트 칸에 1/8" 간격이 실린다', () => {
    const html = dimBarHtml(wallTool(3048), { units: 'ftin' });
    expect(html).toContain('data-len="1"');
    expect(html).toContain('data-step="0.125"');
    expect(html).not.toContain('type="number"');
    expect(html).toContain('길이 (ft·in)');
  });

  test('syncDimBar는 서명이 같으면 값만 맞추고 포커스 칸은 건드리지 않는다', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div id="optionBar"><span id="optionDims"></span></div>';
    document.body.appendChild(root);
    const host = root.querySelector('#optionDims');
    expect(syncDimBar(root, wallTool(3000), { units: 'mm' })).toBe(true);
    const el = host.querySelector('[name="dim:len"]');
    expect(el.value).toBe('3000');
    const sig = host.dataset.sig;
    syncDimBar(root, wallTool(3500), { units: 'mm' });
    expect(host.dataset.sig).toBe(sig);                       // 다시 만들지 않는다
    expect(host.querySelector('[name="dim:len"]')).toBe(el);  // 같은 노드다(타이핑이 끊기지 않게)
    expect(el.value).toBe('3500');
    el.focus();
    syncDimBar(root, wallTool(4000), { units: 'mm' });
    expect(el.value).toBe('3500');                            // 포커스 칸은 그대로다
    // 칸 목록이 바뀌면 다시 만든다.
    const roomish = { name: 'room', opts: {}, dims: () => ({ fields: [{ key: 'w', text: '1', mm: 1, active: true }, { key: 'h', text: '2', mm: 2, active: false }] }) };
    expect(dimBarSignature(roomish)).toBe('w,h');
    syncDimBar(root, roomish, { units: 'mm' });
    expect(host.dataset.sig).toBe('w,h');
    expect(host.querySelectorAll('input')).toHaveLength(2);
    root.remove();
  });

  // 리뷰 M-11: ft·in 치수 칸의 data-mm은 그릴 때의 모델 값으로 굳어 마우스를 움직이는 동안
  // 영구히 낡았다. 이 속성의 유일한 의미는 "readLen이 *고치지 않았다*를 판정하는 기준"이다.
  test('syncDimBar는 ft·in 칸의 data-mm도 값과 함께 갱신한다', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div id="optionBar"><span id="optionDims"></span></div>';
    document.body.appendChild(root);
    const host = root.querySelector('#optionDims');
    syncDimBar(root, wallTool(3000), { units: 'ftin' });
    const el = host.querySelector('[name="dim:len"]');
    expect(el.dataset.mm).toBe('3000');
    syncDimBar(root, wallTool(3500), { units: 'ftin' });
    expect(el.dataset.mm).toBe('3500');                       // 예전에는 3000으로 남았다
    expect(el.value).toBe('3500');                            // 값은 도구가 준 text 그대로다
    root.remove();
  });

  test('옵션 숫자 칸에 단위별 step과 min/max가 붙고 값이 범위로 잘린다(M-1)', () => {
    expect(OPTION_RANGE.thickness).toEqual([2, 1000]);
    const html = optionBarHtml({ name: 'wall', opts: { thickness: 200 } }, { units: 'mm' });
    expect(html).toContain('step="10"');
    expect(html).toContain('max="1000"');
    // min 2는 step 10의 배수가 아니다 → data-min으로 내려간다(fieldUtils.minAttr의 규칙).
    expect(html).toContain('data-min="2"');
    const tool = { opts: { thickness: 200 } };
    const el = { name: 'thickness', type: 'number', value: '99999', checked: false, dataset: {} };
    expect(applyOptionInput(tool, el, 'mm')).toBe(true);
    expect(tool.opts.thickness).toBe(1000);                   // 범위로 자른다
  });
});

// 리뷰 I-1·I-2·I-7: 칸은 모델과 같은 말을 한다 — 잘린 값은 칸에도 되돌아오고, 빈 칸은 값을 바꾸지
// 않고, 범위는 도구를 함께 본다(덕트 단면은 상태 계층의 DUCT_RANGE 한 벌뿐이다).
describe('옵션 바의 범위·되돌림 계약', () => {
  const el = (patch = {}) => ({ name: 'thickness', type: 'number', value: '150', checked: false, dataset: {}, ...patch });

  test('범위로 잘린 값은 칸에도 되돌아오고 안내를 부른다(리뷰 I-1·I-2)', () => {
    const tool = { name: 'wall', opts: { thickness: 200 } };
    const cuts = [];
    const e = el({ value: '99999' });
    expect(applyOptionInput(tool, e, 'mm', { onClamp: (v, i) => cuts.push([v, i.max]) })).toBe(true);
    expect(tool.opts.thickness).toBe(1000);
    expect(e.value).toBe('1000');            // 칸의 글자가 모델과 어긋난 채 남지 않는다(옵션 바는 다시 그려지지 않는다)
    expect(cuts).toEqual([[1000, 1000]]);    // 조용히 잘리지 않는다(속성 패널과 같은 계약)
  });

  test('빈 칸·숫자가 아닌 입력은 값을 바꾸지 않고 칸을 모델 값으로 되돌린다(리뷰 I-2·M-3)', () => {
    const tool = { name: 'wall', opts: { thickness: 200 } };
    const empty = el({ value: '   ' });
    expect(applyOptionInput(tool, empty, 'mm')).toBe(false);
    expect(tool.opts.thickness).toBe(200);   // 예전에는 Number('') === 0이 min으로 잘려 2 mm 벽이 됐다
    expect(empty.value).toBe('200');
    const nan = el({ value: 'abc' });
    expect(applyOptionInput(tool, nan, 'mm')).toBe(false);
    expect(tool.opts.thickness).toBe(200);   // NaN이 opts에 들어가지 않는다
    expect(nan.value).toBe('200');
  });

  test('덕트 단면 범위는 상태 계층의 DUCT_RANGE를 그대로 쓴다(리뷰 I-7)', () => {
    expect(rangeOf({ name: 'duct' }, 'h')).toEqual(DUCT_RANGE.h);
    expect(rangeOf({ name: 'column-square' }, 'h')).toEqual(OPTION_RANGE.h);   // 기둥 높이는 층고(8000)까지 간다
    expect(rangeOf(null, 'nope')).toEqual([]);
    expect(optionBarHtml({ name: 'duct', opts: { h: 300 } }, { units: 'mm' })).toContain('max="3000"');
    expect(optionBarHtml({ name: 'column-square', opts: { h: 2300 } }, { units: 'mm' })).toContain('max="8000"');
    const tool = { name: 'duct', opts: { w: 500, h: 300, z: 2900 } };
    const cuts = [];
    const e = el({ name: 'h', value: '5000' });
    expect(applyOptionInput(tool, e, 'mm', { onClamp: v => cuts.push(v) })).toBe(true);
    expect(tool.opts.h).toBe(3000);          // normalizeDuct가 조용히 줄이기 전에 칸에서 잘린다
    expect(e.value).toBe('3000');
    expect(cuts).toEqual([3000]);
  });

  test('ft·in 칸도 잘린 값을 그 표기로 되돌린다(리뷰 I-1)', () => {
    const tool = { name: 'wall', opts: { thickness: 200 } };
    const cuts = [];
    const e = el({ type: 'text', value: '100"', dataset: { len: '1', min: '2', max: '1000', mm: '200' } });
    expect(applyOptionInput(tool, e, 'ftin', { onClamp: v => cuts.push(v) })).toBe(true);
    expect(tool.opts.thickness).toBe(1000);
    expect(e.value).toBe(fmtLen(1000, 'ftin'));
    expect(e.dataset.mm).toBe('1000');       // 다음 "고치지 않았다" 판정의 기준값도 함께 간다
    expect(cuts).toEqual([1000]);
  });

  test('ft·in 치수 칸에는 모델 값이 data-mm으로 실린다(리뷰 I-4)', () => {
    const guide = { name: 'guide', opts: {}, dims: () => ({ fields: [{ key: 'pos', text: `4'`, mm: 1219, active: true }] }) };
    const html = dimBarHtml(guide, { units: 'ftin' });
    expect(html).toContain('data-mm="1219"');
    expect(html).toContain('좌표 (ft·in)');
  });
});


// §17.8(1): 그리는 동안 치수 칸이 포커스를 갖는다(오늘의집 규칙) — 칸이 **처음 생긴 프레임에만**
// 한 번 준다. 그리는 내내 매 프레임 훔치면 캔버스의 숫자·[Esc] 경로가 죽는다.
describe('그리는 동안 치수 칸 자동 포커스', () => {
  const mount = () => { const d = document.createElement('div'); document.body.appendChild(d); d.innerHTML = '<span id="optionDims"></span>'; return d; };
  const toolWith = fields => ({ name: 'wall', opts: {}, dims: () => (fields ? { fields } : null) });
  const len = (text = '3000') => [{ key: 'len', text, mm: 3000, active: true }];

  test('칸이 0개에서 1개 이상이 된 프레임에만 포커스를 준다', () => {
    const root = mount();
    const empty = toolWith(null), drawing = toolWith(len());
    syncDimBar(root, empty, { units: 'mm' });
    expect(autoFocusDim(root, empty)).toBe(false);            // 칸이 없다
    syncDimBar(root, drawing, { units: 'mm' });
    expect(autoFocusDim(root, drawing)).toBe(true);
    const el = root.querySelector('[name="dim:len"]');
    expect(document.activeElement).toBe(el);
    el.blur();
    expect(autoFocusDim(root, drawing)).toBe(false);           // 같은 그리기 동안에는 다시 훔치지 않는다
    expect(document.activeElement).not.toBe(el);
    expect(autoFocusDim(document.createElement('div'), drawing)).toBe(false);   // #optionDims가 없으면 아무 일도 없다
  });

  test('입력 칸에 포커스가 있으면 훔치지 않고, 그렇지 않으면 활성 칸을 고른다', () => {
    const w = { name: 'room', opts: {}, dims: () => ({ fields: [{ key: 'w', text: '1000', mm: 1000, active: false }, { key: 'h', text: '2000', mm: 2000, active: true }] }) };
    const root = mount();
    const other = document.createElement('input');
    document.body.appendChild(other);
    other.focus();
    syncDimBar(root, w, { units: 'mm' });
    expect(autoFocusDim(root, w)).toBe(false);                 // 사람이 다른 칸에 글자를 치는 중이다
    expect(document.activeElement).toBe(other);
    other.blur();
    const root2 = mount();                                     // 래치는 root마다 따로 센다
    syncDimBar(root2, w, { units: 'mm' });
    expect(autoFocusDim(root2, w)).toBe(true);
    expect(document.activeElement.name).toBe('dim:h');          // 활성 칸(typed.field)이 곧 포커스다
  });
});
