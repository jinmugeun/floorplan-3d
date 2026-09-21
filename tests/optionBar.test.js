import { describe, test, expect } from 'vitest';
import { optionBarHtml, applyOptionInput, OPTION_LABELS, OPTION_TITLES, LEN_OPTS, unitLabel } from '../src/ui/optionBar.js';

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

  test('도구도 이름도 없으면 아무 일도 하지 않는다', () => {
    expect(applyOptionInput(null, el(), 'mm')).toBe(false);
    expect(applyOptionInput({ opts: {} }, el({ name: '' }), 'mm')).toBe(false);
  });
});
