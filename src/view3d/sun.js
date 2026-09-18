// 월·시각에서 태양 고도를 구하고(위도 37.5° 서울 고정), 방위각은 사용자가 정한다.
// 실제 천문 계산이 아니라 편집기용 근사값이다: 적위는 3월을 0, 6월을 +23.45°로 두는 사인파.
const LAT = 37.5;
const rad = d => (d * Math.PI) / 180;
const MIN_ALT = 5; // 한밤중에도 장면이 새카맣게 되지 않도록 최소 고도

export function sunAltitudeDeg({ month = 6, hour = 12 } = {}) {
  const dec = 23.45 * Math.sin(rad((360 * (Number(month) - 3)) / 12));
  const ha = (Number(hour) - 12) * 15;
  const s = Math.sin(rad(LAT)) * Math.sin(rad(dec)) + Math.cos(rad(LAT)) * Math.cos(rad(dec)) * Math.cos(rad(ha));
  return (Math.asin(Math.max(-1, Math.min(1, s))) * 180) / Math.PI;
}

// three 좌표(x 동, y 위, z 남). 방위각 0 = 북(-z), 90 = 동(+x), 180 = 남(+z).
export function sunPosition(sun = {}, distance = 40) {
  const alt = rad(Math.max(MIN_ALT, sunAltitudeDeg(sun)));
  const b = rad(Number(sun.azimuth ?? 180));
  const horizontal = distance * Math.cos(alt);
  return [horizontal * Math.sin(b), distance * Math.sin(alt), -horizontal * Math.cos(b)];
}

// 해가 진 뒤에는 방향광을 줄인다(고도 0° 이하 = 0.25, 10° 이상 = 1). MIN_ALT로 위치만 띄워 두고 밝기로 밤을 표현한다.
export function nightFactor(sun = {}) {
  const alt = sunAltitudeDeg(sun);
  if (alt <= 0) return 0.25;
  if (alt >= 10) return 1;
  return 0.25 + 0.75 * (alt / 10);
}
