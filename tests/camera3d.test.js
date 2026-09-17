import { test, expect } from 'vitest';
import { headingDeg, toWorldXY } from '../src/view3d/camera.js';

// three 좌표: x 동, y 위, z 남. 방위 0 = 북(-z), 90 = 동(+x), 시계방향.
const at = (x, y, z) => ({ x, y, z });

test('headingDeg reads the four cardinal directions', () => {
  const eye = at(0, 5, 0);
  expect(headingDeg(eye, at(0, 0, -10))).toBeCloseTo(0, 6);   // 북
  expect(headingDeg(eye, at(10, 0, 0))).toBeCloseTo(90, 6);   // 동
  expect(headingDeg(eye, at(0, 0, 10))).toBeCloseTo(180, 6);  // 남
  expect(headingDeg(eye, at(-10, 0, 0))).toBeCloseTo(270, 6); // 서
});

test('headingDeg wraps into 0~360 and ignores height', () => {
  expect(headingDeg(at(0, 0, 0), at(-1, 99, -1))).toBeCloseTo(315, 6);
  expect(headingDeg(at(0, 0, 0), at(1, -99, -1))).toBeCloseTo(45, 6);
  expect(headingDeg(at(0, 0, 0), at(0, 0, 0))).toBe(0); // 같은 점은 북으로 본다
});

test('headingDeg handles fractional positions', () => {
  // 월드 (4000.5, 3000.25) mm 에서 (8000.5, 3000.25) mm 를 본다 = 정동
  const eye = at(4.0005, 1.6, 3.00025), target = at(8.0005, 0, 3.00025);
  expect(headingDeg(eye, target)).toBeCloseTo(90, 6);
  expect(headingDeg(at(0, 0, 0), at(0.0005, 0, -0.0005))).toBeCloseTo(45, 6);
});

test('toWorldXY converts three metres back to plan millimetres', () => {
  const [px, py] = toWorldXY(at(4.00075, 1.6, 3.00025)); // 소수 좌표
  expect(px).toBeCloseTo(4000.75, 6);
  expect(py).toBeCloseTo(3000.25, 6); // y 는 three 의 z(남쪽)에서 온다
  expect(toWorldXY(at(0, 0, 0))).toEqual([0, 0]);
  const [x, y] = toWorldXY(at(-1.2345, 9, 0.0005));
  expect(x).toBeCloseTo(-1234.5, 6);
  expect(y).toBeCloseTo(0.5, 6);
});
