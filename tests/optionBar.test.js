// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { optionBarHtml, applyOptionInput, dimBarHtml, dimBarSignature, syncDimBar, OPTION_LABELS, OPTION_TITLES, OPTION_RANGE, DIM_LABELS, LEN_OPTS, unitLabel } from '../src/ui/optionBar.js';
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
