// 시드 에셋 ↔ 카탈로그 ↔ NOTICE 정합(2026-10-13 · 계획 15 Task C). 시드 7종은 Poly Haven CC0(사전 검토 p15-preflight §4 · 할 일 14)이고
// tools/assets/seed.mjs → pack.mjs가 public/models/<id>.glb·manifest.json·NOTICE.md를 쓴다. 이 테스트는 네트워크 없이 저장소에 든 결과만 본다:
// 카탈로그 asset이 manifest와 1:1 · 파일이 포장 그대로(bytes·sha256 — CRLF 변환 같은 손상을 잡는다) · 예산(fit ≥ 0.85 · 생성은 0.75) · NOTICE가 manifest에서 나온 그대로.
// 생성 모델(2026-10-15 · 계획 15b · README §7.7): manifest = 시드 + GENERATED, source = { kind: 'generated', url: 입력 사진 URL, license, author }.
import { describe, test, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { PRODUCTS, productById } from '../src/products/catalog.js';
import { checkManifestEntry, noticeMarkdown } from '../tools/assets/lib.mjs';

const at = rel => new URL(`../${rel}`, import.meta.url);
const man = JSON.parse(readFileSync(at('public/models/manifest.json'), 'utf8'));
const sources = JSON.parse(readFileSync(at('tools/assets/sources.json'), 'utf8'));
const ids = Object.keys(man.products);
const SEEDS = ['chair-dining', 'chair-office', 'desk-student', 'dining-6', 'light-pendant', 'side-table', 'sofa-3'];
const GENERATED = ['range-gas-3', 'sink-single'];                              // S2B 사진 → ComfyUI TRELLIS.2(2026-10-15 · 계획 15b)
const ALL = [...SEEDS, ...GENERATED].sort();

describe('시드 에셋(계획 15 Task C)', () => {
  // 정면은 SchoolDesk_01만 −Z다(2026-10-13 · 계획 15 Task D 검수 시트): 책 상자의 트인 쪽(학생이 앉는 쪽)이 원본에서 −Z였다 — 원근으로 앞(+Z)·뒤에서
  // 찍어 보니 +Z 쪽은 막힌 판, −Z 쪽에서 상자 안이 보였다. 앱의 앞은 사용자 쪽 +Z다(교실 템플릿: 책상 rot 0 · 교탁이 −Y에서 마주 본다).
  test('sources.json은 사전 검토의 7쌍(Poly Haven · 1k · Y-up)이고 정면은 +Z(학생 책상만 −Z) · manifest가 같은 7종을 담는다', () => {
    expect(Object.keys(sources).sort()).toEqual(SEEDS);
    expect(Object.fromEntries(Object.entries(sources).map(([id, s]) => [id, s.asset]))).toEqual({
      'chair-dining': 'painted_wooden_chair_01', 'chair-office': 'GreenChair_01', 'sofa-3': 'sofa_02', 'dining-6': 'painted_wooden_table',
      'side-table': 'painted_wooden_nightstand', 'desk-student': 'SchoolDesk_01', 'light-pendant': 'modern_ceiling_lamp_01',
    });
    for (const [id, s] of Object.entries(sources)) expect(s, id).toMatchObject({ kind: 'polyhaven', front: id === 'desk-student' ? '-z' : '+z', up: 'y', resolution: '1k' });
    expect([...ids].sort()).toEqual(ALL);
  });

  test('카탈로그 asset ↔ manifest 1:1 — asset 값은 제품 id(파일 models/<id>.glb)', () => {
    const withAsset = PRODUCTS.filter(p => p.asset);
    expect(withAsset.map(p => p.id).sort()).toEqual([...ids].sort());
    for (const p of withAsset) expect(p.asset, p.id).toBe(p.id);
  });

  test('파일은 포장 그대로다(존재 · bytes · sha256 · GLB 머리) · 예산 안(fit ≥ 0.85 · 생성은 0.75) · 크기는 지금 카탈로그 size', () => {
    for (const id of ids) {
      const e = man.products[id], file = at(`public/models/${id}.glb`);
      expect(existsSync(file), id).toBe(true);
      const buf = readFileSync(file);
      expect(buf.byteLength, id).toBe(e.bytes);
      expect(createHash('sha256').update(buf).digest('hex'), id).toBe(e.sha256);
      expect([buf.toString('latin1', 0, 4), buf.readUInt32LE(4)], id).toEqual(['glTF', 2]);
      expect(checkManifestEntry(e), id).toEqual({ ok: true, problems: [] });
      expect(e.extensions, id).toContain('EXT_meshopt_compression');
      // 카탈로그 size가 바뀌면 다시 포장해야 한다(균일 맞춤의 기준 축이 달라진다).
      expect(e.size, id).toEqual(productById(id).size);
      if (GENERATED.includes(id)) expect(e.source, id).toEqual({ kind: 'generated', url: expect.stringMatching(/^https:\/\/www\.s2b\.kr\//), license: '자체 생성물', author: expect.stringMatching(/TRELLIS/) });
      else expect(e.source, id).toEqual({ kind: 'polyhaven', url: `https://polyhaven.com/a/${sources[id].asset}`, license: 'CC0-1.0', author: expect.stringMatching(/\S/) });
    }
  });

  test('NOTICE.md는 manifest에서 나온 그대로이고 출처 URL·작가·CC0-1.0·사이트 라이선스 URL을 모두 적는다', () => {
    // autocrlf 체크아웃(Windows)은 텍스트 줄 끝을 CRLF로 바꾼다 — 내용만 비교한다.
    const notice = readFileSync(at('NOTICE.md'), 'utf8').replace(/\r\n/g, '\n');
    expect(notice).toBe(noticeMarkdown(man, id => productById(id)?.name));
    for (const id of ids) {
      const { url, author } = man.products[id].source;
      expect(notice, id).toContain(url);
      expect(notice, id).toContain(author);
    }
    expect(notice).toContain('CC0-1.0');
    expect(notice).toContain('https://polyhaven.com/license');
    expect(notice).toContain('생성 모델');                                      // generated 항목이 있으면 생성 경로 문장이 붙는다(lib.noticeMarkdown)
  });

  test('천장 부착 펜던트(light-pendant)는 부착·zDefault·size가 그대로이고 모델 높이가 꽉 찬다(윗면 = 천장)', () => {
    // 천장 제품은 배치 때 z = 층고 − h(placeTool · roomTemplates · DXF 가져오기)라 아이템 윗면이 천장이다. 모델의 높이 축 fit이 1이면
    // 모델 꼭대기(천장 받침)가 아이템 윗면 = 천장에 붙는다(런타임 fitClone이 축별로 맞추므로 모델 바닥 = 아이템 바닥).
    expect(productById('light-pendant')).toMatchObject({ attach: 'ceiling', zDefault: 0, size: [300, 300, 600], asset: 'light-pendant' });
    expect(man.products['light-pendant'].fit[1]).toBe(1);
  });
});
