// 내부 저장은 항상 mm. 표시와 입력만 프로젝트의 units를 따른다.
export const M2_PER_PYEONG = 3.3058;
const MM_PER_INCH = 25.4;
const round1 = n => Math.round(n * 10) / 10;

export function fmtLen(mm, units = 'mm', { unit = false } = {}) {
  const n = Number(mm), v = Number.isFinite(n) ? n : 0;
  if (units !== 'ftin') return unit ? `${Math.round(v)} mm` : `${Math.round(v)}`;
  const sign = v < 0 ? '-' : '';
  const totalIn = Math.abs(v) / MM_PER_INCH;
  let ft = Math.floor(totalIn / 12), inch = round1(totalIn - ft * 12);
  if (inch >= 12) { ft += 1; inch = 0; } // 11.97" 가 12" 로 반올림되는 경우
  const inTxt = `${Number.isInteger(inch) ? inch : inch.toFixed(1)}"`;
  return ft ? `${sign}${ft}' ${inTxt}` : `${sign}${inTxt}`;
}

export function parseLen(text, units = 'mm') {
  const s = String(text ?? '').trim();
  if (!s) return null;
  if (units !== 'ftin') {
    const v = Number(s.replace(/,/g, '').replace(/\s*mm$/i, ''));
    return Number.isFinite(v) ? v : null;
  }
  // 12' 6" / 12' / 6" / 6(= 인치)
  const m = s.match(/^(-)?\s*(?:(\d+(?:\.\d+)?)\s*(?:'|ft))?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in)?)?$/);
  if (!m || (m[2] === undefined && m[3] === undefined)) return null;
  const mm = (Number(m[2] ?? 0) * 12 + Number(m[3] ?? 0)) * MM_PER_INCH;
  return m[1] ? -mm : mm;
}

export function fmtArea(m2, { pyeong = false, unit = true } = {}) {
  const n = Number(m2), v = Number.isFinite(n) ? n : 0;
  if (pyeong) return `${(v / M2_PER_PYEONG).toFixed(1)}${unit ? ' 평' : ''}`;
  return `${v.toFixed(1)}${unit ? ' m²' : ''}`;
}
