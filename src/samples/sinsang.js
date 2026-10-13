// 경산 신상중 급식실 샘플(2026-10-13 · 사용자 요청 "경산신상중학교 배치를 모든 사람이 볼 수 있게 템플릿으로"). sinsang.json은 급식기구 배치도 DXF(sinsang-A ·
// 196석 안)를 우리 가져오기(점수판과 같은 길: 역할표 · 기구 배치 켬 · 이름 구획선 끔 · 배경 트레이스 없음)로 들여온 결과 그대로다 — 벽 62 · 방 13(실명 11) ·
// 문 16 · 창 16 · 통로 9 · 기둥 14 · 기구 167(제품 115 · 일반 상자 52). 원 도면의 선·배경·가져오기 기록(meta.dxfImport)은 싣지 않는다(95 KB · gzip 10 KB).
// 다시 뽑으려면 app/.superpowers/sdd/scratch/sinsang-sample.mjs(코퍼스 DXF 필요). 가져온 기구는 제품을 바꾸기 전까지 견적 0원이다(dxfProduct · 계획 13).
import spec from './sinsang.json';
import { migrate } from '../state/schema.js';

// 매번 새 객체를 돌려준다(템플릿으로 시작한 프로젝트가 원본 spec을 고치면 안 된다). migrate가 파생값(면적 등)을 앱 규칙으로 다시 계산한다.
export function buildSinsangProject() { return migrate(structuredClone(spec)); }
