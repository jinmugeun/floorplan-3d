"""Idol/TripoSplat 가우시안 스플랫 → 닫힌 메시 + 스플랫 색 질감 굽기 (3dtodomyen 실험 노드, 2026-11-05).

기본 SplatToMesh가 상자형 기구에서 구멍투성이가 되는 원인: Idol 가우시안은 가장 얇은 축 σ가 고정 최솟값
(해상도 192에서 0.21칸)이라, 격자 칸 중심에서만 밀도를 재면 축에 나란한 평판이 통째로 빠지거나 남는다.
→ 메시 추출용 밀도에서만 σ를 `thickness`칸 이상으로 키우고(색은 같은 가중치), 껍질을 닫은 뒤 바깥에서
flood fill 해 '속'을 채우고 겉면 하나만 뽑는다. 질감은 UV 텍셀 위치에서 스플랫 색 볼륨을 읽어 굽는다.
기존 comfy_extras 헬퍼(_surface_nets, _clean_components, _taubin_smooth, _bake_position_map, _seam_fill 등)를 그대로 쓴다.
"""
import logging
import numpy as np
import scipy.ndimage as ndi
import torch

import comfy.model_management
from comfy_extras.nodes_gaussian_splat import (_C0, _real_len, _otsu_level, _surface_nets, _clean_components,
                                               _taubin_smooth, _inverse_covariance)
from comfy_extras.nodes_mesh_postprocess import (_bake_position_map, _back_project_positions, _seam_fill,
                                                 _normalize_uvs_to_unit)
from comfy_extras.nodes_save_3d import get_mesh_batch_item, pack_variable_mesh_batch

FLIP = np.array([1.0, -1.0, -1.0], dtype=np.float32)   # 스플랫 +Y = glTF -Y (SplatToMesh와 같은 X축 180°)


def _gaussians(splat, i, min_opacity, device):
    end = _real_len(splat, i)
    xyz = splat.positions[i, :end].to(device=device, dtype=torch.float32)
    scale = splat.scales[i, :end].to(device=device, dtype=torch.float32)
    quat = splat.rotations[i, :end].to(device=device, dtype=torch.float32)
    op = splat.opacities[i, :end].reshape(-1).to(device=device, dtype=torch.float32)
    rgb = (splat.sh[i, :end, 0, :].to(device=device, dtype=torch.float32) * _C0 + 0.5).clamp(0, 1)
    keep = op >= min_opacity
    return xyz[keep], scale[keep], quat[keep], op[keep], rgb[keep]


def _volumes(xyz, scale, quat, op, rgb, res, thickness, max_kernel, color_sharpen, device):
    """밀도 Σw + 색 Σw^p·rgb / Σw^p. σ는 thickness·voxel 이상으로 키움. 창 = 각자 3σ(최대 max_kernel칸)."""
    lo, hi = xyz.amin(0), xyz.amax(0)
    voxel = float(((hi - lo).max() / res).clamp_min(1e-8))
    pad = (max_kernel + 2) * voxel
    lo = lo - pad
    dims = (torch.ceil((hi + pad - lo) / voxel).long() + 1).tolist()
    dx, dy, dz = dims
    scale = scale.clamp_min(thickness * voxel)
    sinv = _inverse_covariance(scale, quat)
    kfull = torch.ceil(3.0 * scale.amax(-1) / voxel).long()
    logging.info(f"splat volumes: {xyz.shape[0]} gaussians, voxel {voxel:.5f}, 창 잘림 {(kfull > max_kernel).float().mean().item() * 100:.1f}%")
    kreq = kfull.clamp(1, int(max_kernel))
    vol = torch.zeros(dx * dy * dz, device=device)
    col = torch.zeros(dx * dy * dz, 3, device=device)
    wsum = torch.zeros(dx * dy * dz, device=device)
    for k in range(1, int(max_kernel) + 1):
        sel = (kreq == k).nonzero(as_tuple=True)[0]
        if sel.numel() == 0:
            continue
        r = torch.arange(-k, k + 1, device=device, dtype=torch.float32)
        off = torch.stack(torch.meshgrid(r, r, r, indexing="ij"), -1).reshape(-1, 3)
        chunk = max(1, int(4_000_000 // off.shape[0]))           # 큰 창은 작은 묶음으로(메모리 일정)
        for st in range(0, sel.numel(), chunk):
            gi = sel[st:st + chunk]
            cc = xyz[gi]
            idx = ((cc - lo) / voxel).round()[:, None, :] + off[None]
            d = (lo + idx * voxel) - cc[:, None, :]
            quad = torch.einsum("bmi,bij,bmj->bm", d, sinv[gi], d)
            w = torch.where(quad < 9.0, op[gi, None] * torch.exp(-0.5 * quad), torch.zeros_like(quad))
            ii = idx.long()
            flat = (ii[..., 0].clamp(0, dx - 1) * (dy * dz) + ii[..., 1].clamp(0, dy - 1) * dz + ii[..., 2].clamp(0, dz - 1)).reshape(-1)
            vol.index_add_(0, flat, w.reshape(-1))
            wp = w.pow(color_sharpen)
            col.index_add_(0, flat, (wp[..., None] * rgb[gi, None, :]).reshape(-1, 3))
            wsum.index_add_(0, flat, wp.reshape(-1))
    return vol.reshape(dims), col.reshape(dx, dy, dz, 3), wsum.reshape(dims), lo, voxel


def _sample_color(col, wsum, pts, lo, voxel, device):
    """스플랫 좌표 점 (N,3)에서 색 = trilinear(Σw^p·rgb) / trilinear(Σw^p)."""
    dx, dy, dz = wsum.shape
    g = (pts - lo) / voxel
    size = torch.tensor([dx, dy, dz], device=device, dtype=torch.float32)
    g = 2.0 * g / (size - 1) - 1.0
    grid = torch.stack([g[:, 2], g[:, 1], g[:, 0]], -1)[None, None, None]
    f = lambda v: torch.nn.functional.grid_sample(v.permute(3, 0, 1, 2)[None], grid, mode="bilinear", padding_mode="border", align_corners=True)[0, :, 0, 0, :]
    num, den = f(col), f(wsum[..., None])
    return (num / den.clamp_min(1e-6)).T.clamp(0, 1), den[0]


def _sample_scalar(vol, pts, lo, voxel, device):
    dx, dy, dz = vol.shape
    g = (pts - lo) / voxel
    size = torch.tensor([dx, dy, dz], device=device, dtype=torch.float32)
    g = 2.0 * g / (size - 1) - 1.0
    grid = torch.stack([g[:, 2], g[:, 1], g[:, 0]], -1)[None, None, None]
    return torch.nn.functional.grid_sample(vol[None, None], grid, mode="bilinear", padding_mode="zeros", align_corners=True)[0, 0, 0, 0, :]


def _bilateral_denoise(verts, faces, outer, normal_iters, vertex_iters, sigma_r, device):
    """양방향 법선 필터링(Zheng et al. 2011) + 꼭짓점 갱신(Sun et al. 2007).
    이웃 면(꼭짓점 공유) 법선을 넓이·거리·법선 차이로 가중 평균 → 평판의 작은 굴곡은 펴고 큰 각(모서리)은 유지.
    꼭짓점은 걸러진 법선의 면 평면으로 옮김(라플라시안처럼 줄어들지 않음 → 가는 부품 유지)."""
    if outer <= 0 or len(faces) == 0:
        return verts
    x = torch.as_tensor(np.ascontiguousarray(verts), device=device, dtype=torch.float32)
    f = torch.as_tensor(np.ascontiguousarray(faces), device=device, dtype=torch.long)
    nf, nv = f.shape[0], x.shape[0]
    # 면-면 인접(꼭짓점 공유): 희소 M(면×꼭짓점) · Mᵀ
    rows = torch.arange(nf, device=device).repeat_interleave(3)
    M = torch.sparse_coo_tensor(torch.stack([rows, f.reshape(-1)]), torch.ones(nf * 3, device=device), (nf, nv)).coalesce()
    A = torch.sparse.mm(M, M.transpose(0, 1)).coalesce()
    pi, pj = A.indices()
    corner_v, corner_f = f.reshape(-1), rows
    cnt = torch.zeros(nv, device=device).index_add_(0, corner_v, torch.ones_like(corner_v, dtype=torch.float32)).clamp_min(1)

    def geom(x):
        a, b, c = x[f[:, 0]], x[f[:, 1]], x[f[:, 2]]
        cr = torch.cross(b - a, c - a, dim=1)
        area = cr.norm(dim=1).clamp_min(1e-20)
        return cr / area[:, None], (a + b + c) / 3.0, area * 0.5

    for _ in range(int(outer)):
        n, cen, area = geom(x)
        ds = ((cen[pi] - cen[pj]) ** 2).sum(1)
        sigma_s2 = ds[pi != pj].sqrt().mean() ** 2
        ws = area[pj] * torch.exp(-ds / (2 * sigma_s2))
        for _ in range(int(normal_iters)):
            dr = ((n[pi] - n[pj]) ** 2).sum(1)
            w = ws * torch.exp(-dr / (2 * sigma_r * sigma_r))
            acc = torch.zeros_like(n).index_add_(0, pi, w[:, None] * n[pj])
            n = acc / acc.norm(dim=1, keepdim=True).clamp_min(1e-20)
        for _ in range(int(vertex_iters)):
            _, cen, _ = geom(x)
            nc = n[corner_f]
            d = (nc * (cen[corner_f] - x[corner_v])).sum(1, keepdim=True) * nc
            x = x + torch.zeros_like(x).index_add_(0, corner_v, d) / cnt[:, None]
    return x.cpu().numpy()


def _planarize(verts, faces, angle_deg, min_frac, grow_dist=0.0, max_dirs=16):
    """평판 맞추기(상자형 기구용): 방향이 비슷하고(angle_deg 안) 모서리로 이어진 큰 영역(전체 넓이의 min_frac 이상)마다
    평면을 맞추고, 꼭짓점을 걸친 평면들의 최소제곱 해로 옮김(평판 1개 = 평면 위, 2개 = 교선, 3개 = 꼭짓점).
    작거나 휜 부분(손잡이·둥근 다리·난간)은 평판으로 안 잡혀 그대로. grow_dist(좌표 단위) > 0이면 평판 안 움푹한 곳까지 넓혀 폄."""
    if len(faces) == 0:
        return verts, 0, 0
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    v = np.asarray(verts, np.float64); f = np.asarray(faces, np.int64); F, V = len(f), len(v)
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    cr = np.cross(b - a, c - a); ar = np.linalg.norm(cr, axis=1)
    n = cr / np.maximum(ar, 1e-20)[:, None]; ar = ar * 0.5; cen = (a + b + c) / 3.0; total = ar.sum()
    # 모서리 공유 면 쌍
    e = np.sort(np.stack([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]], 1).reshape(-1, 2), 1)
    key = e[:, 0] * V + e[:, 1]; order = np.argsort(key, kind="stable"); ks = key[order]; fi = np.repeat(np.arange(F), 3)[order]
    same = ks[1:] == ks[:-1]; pa, pb = fi[:-1][same], fi[1:][same]
    # 주 방향 찾기(넓이 가장 많이 모이는 방향부터)
    cosT = np.cos(np.radians(angle_deg)); label = np.full(F, -1); rng = np.random.default_rng(0)
    for k in range(max_dirs):
        idx = np.flatnonzero(label < 0)
        if len(idx) == 0:
            break
        sub = idx if len(idx) <= 40000 else rng.choice(idx, 40000, replace=False)
        cand = n[rng.choice(idx, min(400, len(idx)), replace=False)]
        d = cand[(((cand @ n[sub].T) > cosT) @ ar[sub]).argmax()]
        for _ in range(5):
            m = (n[idx] @ d) > cosT
            if not m.any():
                break
            d = (n[idx][m] * ar[idx][m, None]).sum(0); d /= max(np.linalg.norm(d), 1e-20)
        m_all = (label < 0) & ((n @ d) > cosT)
        if ar[m_all].sum() < min_frac * total:
            break
        label[m_all] = k
    # 방향별 연결 성분 → 큰 것만 평면
    keep = (label >= 0)[pa] & (label[pa] == label[pb])
    g = coo_matrix((np.ones(keep.sum()), (pa[keep], pb[keep])), shape=(F, F))
    ncomp, comp = connected_components(g, directed=False)
    comp = np.where(label >= 0, comp, -1)
    carea = np.bincount(comp[comp >= 0], weights=ar[comp >= 0], minlength=ncomp)
    big = np.flatnonzero(carea >= min_frac * total)
    plane_n = np.zeros((ncomp, 3)); plane_d = np.zeros(ncomp); ok = np.zeros(ncomp, bool)
    for ci in big:
        m = comp == ci
        nn = (n[m] * ar[m, None]).sum(0); nn /= max(np.linalg.norm(nn), 1e-20)
        o = cen[m] @ nn; w = ar[m]; srt = np.argsort(o); cw = np.cumsum(w[srt])
        plane_n[ci], plane_d[ci], ok[ci] = nn, o[srt][np.searchsorted(cw, cw[-1] * 0.5)], True   # 넓이 가중 중앙값
    owner = np.where((comp >= 0) & ok[np.maximum(comp, 0)], comp, -1)
    # 평판 넓히기: 평판 안의 움푹·볼록(경사가 angle_deg를 넘어 평판에서 빠진 곳)이 그대로 남아 금속 반사에서 얼룩으로 보임 →
    # 평판에 붙은 면 중 세 꼭짓점이 평면에서 grow_dist 안이고 방향이 60° 안이면 같은 평판으로(고리 단위로 반복). 벽(90°)·난간 윗면(멀리)은 안 붙음
    grown = 0
    if grow_dist > 0 and ok.any():
        cosG = np.cos(np.radians(60.0))
        for _ in range(500):
            oa, ob = owner[pa], owner[pb]
            m1, m2 = (oa >= 0) & (ob < 0), (ob >= 0) & (oa < 0)
            cf, cc = np.concatenate([pb[m1], pa[m2]]), np.concatenate([oa[m1], ob[m2]])
            if len(cf) == 0:
                break
            cf, first = np.unique(cf, return_index=True); cc = cc[first]
            dist = np.abs(np.einsum("fkj,fj->fk", v[f[cf]], plane_n[cc]) - plane_d[cc][:, None]).max(1)
            good = (dist < grow_dist) & ((n[cf] * plane_n[cc]).sum(1) > cosG)
            if not good.any():
                break
            owner[cf[good]] = cc[good]; grown += int(good.sum())
    fsel = owner >= 0; comp = np.maximum(owner, 0)
    # 꼭짓점별 최소제곱: Σ N Nᵀ x = Σ d N 을 고유분해로(x = x0 + Σ (u·r)/λ u, r = Σ d N − Σ N Nᵀ x0)
    #   평판은 꼭짓점마다 한 번만 셈(면 수 가중이면 모서리 꼭짓점이 한쪽 평판으로 쏠림). 거의 나란한 평판(20° 안 — 넓히기로 맞닿은
    #   높이가 조금 다른 두 평판)은 교선이 멀리 튀므로 고윳값을 잘라 한 제약(평균 평면)으로: 작은 고유 방향은 원래 자리 유지
    fc = np.flatnonzero(fsel)
    pair = np.unique(f[fc].reshape(-1).astype(np.int64) * ncomp + np.repeat(comp[fc], 3))
    vi, ci = pair // ncomp, pair % ncomp; pn, pd = plane_n[ci], plane_d[ci]
    Mv = np.zeros((V, 3, 3)); bv = np.zeros((V, 3))
    np.add.at(Mv, vi, pn[:, :, None] * pn[:, None, :]); np.add.at(bv, vi, pd[:, None] * pn)
    hit = np.trace(Mv, axis1=1, axis2=2) > 0
    x = v.copy()
    w, U = np.linalg.eigh(Mv[hit])
    r = bv[hit] - np.einsum("hij,hj->hi", Mv[hit], v[hit])
    coef = np.einsum("hji,hj->hi", U, r) / np.maximum(w, 1e-30)
    coef[w <= np.tan(np.radians(10.0)) ** 2 * w[:, -1:]] = 0.0
    x[hit] = v[hit] + np.einsum("hij,hj->hi", U, coef)
    return x.astype(np.float32), int(ok.sum()), grown


class SplatToSolidMesh:
    DESCRIPTION = "스플랫 → 닫힌 메시(얇은 가우시안 두께 보정 + 바깥 flood fill로 속 채움 → 겉면 하나)."
    CATEGORY = "3d/splat"
    RETURN_TYPES = ("MESH",)
    FUNCTION = "run"
    KEEP_COLORS = False

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "splat": ("SPLAT",),
            "resolution": ("INT", {"default": 192, "min": 64, "max": 640, "step": 16}),
            "thickness": ("FLOAT", {"default": 0.6, "min": 0.0, "max": 3.0, "step": 0.05, "tooltip": "σ 최솟값(칸). Idol은 0.21칸이라 평판이 빠짐"}),
            "max_kernel": ("INT", {"default": 24, "min": 2, "max": 40}),
            "occupancy": (["alpha", "sum"], {"default": "alpha", "tooltip": "alpha: 1-exp(-Σw) 고정 문턱(평판 큰 가우시안 1개 ≈ 모서리 작은 가우시안 여러 개) / sum: Σw에 Otsu"}),
            "level": ("FLOAT", {"default": 0.35, "min": 0.01, "max": 2.0, "step": 0.01, "tooltip": "alpha: 불투명도 문턱 / sum: Otsu 문턱 × 이 값"}),
            "close_radius": ("INT", {"default": 2, "min": 0, "max": 8, "tooltip": "껍질 틈 닫기(칸)"}),
            "blur": ("FLOAT", {"default": 1.2, "min": 0.0, "max": 3.0, "step": 0.1, "tooltip": "속 채운 덩어리 흐림(칸) — 계단 없애기"}),
            "smooth": ("INT", {"default": 8, "min": 0, "max": 60}),
            "min_component": ("INT", {"default": 2000, "min": 0, "max": 200000}),
            "denoise": ("INT", {"default": 3, "min": 0, "max": 20, "tooltip": "양방향 법선 필터링 바깥 반복(0 = 끔) — 평판 잔주름 펴기, 모서리 유지"}),
            "denoise_normal_iters": ("INT", {"default": 6, "min": 1, "max": 50}),
            "denoise_vertex_iters": ("INT", {"default": 12, "min": 1, "max": 100}),
            "planarize": ("BOOLEAN", {"default": True, "tooltip": "큰 평판을 평면으로 맞춤(넓은 출렁임 제거, 모서리 날카롭게)"}),
            "plane_angle": ("FLOAT", {"default": 15.0, "min": 2.0, "max": 40.0, "step": 1.0}),
            "plane_min_area": ("FLOAT", {"default": 0.005, "min": 0.0005, "max": 0.2, "step": 0.0005, "tooltip": "평판으로 칠 최소 넓이(전체 겉넓이 비율)"}),
            "plane_grow": ("FLOAT", {"default": 2.0, "min": 0.0, "max": 6.0, "step": 0.25, "tooltip": "평판 넓히기(칸) — 평판 안 움푹한 곳 펴기, 0 = 끔"}),
            "denoise_sigma_r": ("FLOAT", {"default": 0.35, "min": 0.05, "max": 2.0, "step": 0.05, "tooltip": "법선 차이 폭 — 작을수록 모서리를 더 지킴"}),
            "min_opacity": ("FLOAT", {"default": 0.05, "min": 0.0, "max": 1.0, "step": 0.01}),
        }}

    def run(self, splat, resolution, thickness, max_kernel, occupancy, level, close_radius, blur, smooth, min_component, min_opacity, denoise=3, denoise_normal_iters=6, denoise_vertex_iters=12, denoise_sigma_r=0.35, planarize=True, plane_angle=15.0, plane_min_area=0.005, plane_grow=2.0):
        device = comfy.model_management.get_torch_device()
        vs, fs, cs = [], [], []
        for i in range(splat.positions.shape[0]):
            xyz, scale, quat, op, rgb = _gaussians(splat, i, min_opacity, device)
            vol, col, wsum, lo, voxel = _volumes(xyz, scale, quat, op, rgb, resolution, thickness, max_kernel, 2.0, device)
            if occupancy == "alpha":
                lv = level
                shell = (1.0 - torch.exp(-vol) >= lv).cpu().numpy()
            else:
                occ = vol[vol > vol.max() * 1e-3]
                lv = _otsu_level(occ.cpu().numpy()) * level
                shell = (vol >= lv).cpu().numpy()
            if close_radius > 0:
                ball = ndi.generate_binary_structure(3, 1)
                shell = ndi.binary_closing(shell, structure=ball, iterations=int(close_radius), border_value=0)
            lab, _ = ndi.label(~shell)
            border = np.unique(np.concatenate([lab[0].ravel(), lab[-1].ravel(), lab[:, 0].ravel(), lab[:, -1].ravel(), lab[:, :, 0].ravel(), lab[:, :, -1].ravel()]))
            solid = ~np.isin(lab, border[border > 0])
            field = ndi.gaussian_filter(solid.astype(np.float32), blur) if blur > 0 else solid.astype(np.float32)
            logging.info(f"SplatToSolidMesh: voxel {voxel:.5f}, grid {vol.shape}, level {lv:.4f}, shell {shell.mean():.4f}, solid {solid.mean():.4f}")
            verts, faces = _surface_nets(torch.from_numpy(field), 0.5, voxel, lo.cpu().numpy(), device)
            verts, faces = np.asarray(verts), np.asarray(faces)
            if min_component > 0 and len(faces):
                verts, faces = _clean_components(verts, faces, min_component, device)
                verts = verts.cpu().numpy() if torch.is_tensor(verts) else np.asarray(verts)
                faces = faces.cpu().numpy() if torch.is_tensor(faces) else np.asarray(faces)
            verts = _taubin_smooth(verts, faces, smooth)
            verts = _bilateral_denoise(verts, faces, denoise, denoise_normal_iters, denoise_vertex_iters, denoise_sigma_r, device)
            if planarize:
                verts, nplanes, grown = _planarize(verts, faces, plane_angle, plane_min_area, plane_grow * voxel)
                logging.info(f"SplatToSolidMesh: 평판 {nplanes}개 맞춤 · 넓힌 면 {grown}")
            c, _ = _sample_color(col, wsum, torch.from_numpy(np.ascontiguousarray(verts)).to(device), lo, voxel, device)
            c = c.cpu().numpy()
            c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4).astype(np.float32)   # 정점색은 linear
            vs.append(torch.from_numpy(np.ascontiguousarray(verts * FLIP, dtype=np.float32)))
            fs.append(torch.from_numpy(np.ascontiguousarray(faces, dtype=np.int64)))
            cs.append(torch.from_numpy(c))
        # 정점색은 내보내지 않음: 감축·UV 뒤에도 남아 질감에 곱해지고, 겉면은 껍질 바깥 경계라 색 볼륨 밖이면 검정
        return (pack_variable_mesh_batch(vs, fs, colors=cs if self.KEEP_COLORS else None),)


class BakeSplatTexture:
    DESCRIPTION = "UV 펼친 메시에 스플랫 색을 굽기(텍셀 위치 → 선택적으로 조밀 메시에 재투영 → 스플랫 색 볼륨). ApplyTextureToMesh의 base_color로."
    CATEGORY = "3d/splat"
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "run"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "mesh": ("MESH",),
            "splat": ("SPLAT",),
            "texture_size": ("INT", {"default": 2048, "min": 256, "max": 8192, "step": 256}),
            "resolution": ("INT", {"default": 384, "min": 64, "max": 768, "step": 16}),
            "thickness": ("FLOAT", {"default": 0.6, "min": 0.0, "max": 3.0, "step": 0.05}),
            "color_sharpen": ("FLOAT", {"default": 2.0, "min": 1.0, "max": 8.0, "step": 0.5}),
            "min_opacity": ("FLOAT", {"default": 0.05, "min": 0.0, "max": 1.0, "step": 0.01}),
            "search_depth": ("FLOAT", {"default": 4.0, "min": 0.0, "max": 16.0, "step": 0.5, "tooltip": "법선을 따라 바깥 2칸 → 안쪽 이 깊이(굽기 볼륨 칸)까지 앞에서부터 불투명도 합성 — 렌더처럼 밖에서 보이는 색만"}),
            "search_out": ("FLOAT", {"default": 6.0, "min": 0.0, "max": 16.0, "step": 0.5, "tooltip": "합성 출발점: 겉면에서 바깥으로 이만큼(굽기 볼륨 칸). 겉면이 실제 껍질보다 안쪽(가는 부품)이면 속의 어두운 가우시안부터 합성되는 것 방지"}),
            "alpha_gain": ("FLOAT", {"default": 2.0, "min": 0.1, "max": 10.0, "step": 0.1, "tooltip": "칸당 불투명도 = 1 - exp(-Σw · 이 값 · 0.5)"}),
        }, "optional": {"reference_mesh": ("MESH",)}}

    def run(self, mesh, splat, texture_size, resolution, thickness, color_sharpen, min_opacity, search_depth, search_out, alpha_gain, reference_mesh=None):
        device = comfy.model_management.get_torch_device()
        v, f, _, uv, nrm = get_mesh_batch_item(mesh, 0)
        if uv is None:
            raise ValueError("BakeSplatTexture: UV가 없음 — UnwrapMesh를 앞에 연결")
        v_np, f_np = v.cpu().numpy().astype(np.float32), f.cpu().numpy().astype(np.int64)
        uv_np = _normalize_uvs_to_unit(uv.cpu().numpy().astype(np.float32), True)
        pos, mask = _bake_position_map(v_np, f_np, uv_np, texture_size)
        if reference_mesh is not None:
            rv, rf, *_ = get_mesh_batch_item(reference_mesh, 0)
            pos = _back_project_positions(pos, mask, rv, rf)
            pos = pos.cpu().numpy() if torch.is_tensor(pos) else pos
        xyz, scale, quat, op, rgb = _gaussians(splat, 0, min_opacity, device)
        vol, col, wsum, lo, voxel = _volumes(xyz, scale, quat, op, rgb, resolution, thickness, 24, color_sharpen, device)
        pts = torch.from_numpy(np.ascontiguousarray(pos[mask] * FLIP, dtype=np.float32)).to(device)
        # 텍셀 법선(스플랫 좌표). UnwrapMesh가 법선을 버리므로 없으면 면 법선(넓이 가중)으로 계산 — 감은 방향 = 바깥
        if nrm is None:
            fn = np.cross(v_np[f_np[:, 1]] - v_np[f_np[:, 0]], v_np[f_np[:, 2]] - v_np[f_np[:, 0]])
            vn = np.zeros_like(v_np)
            for k in range(3):
                np.add.at(vn, f_np[:, k], fn)
            nrm = torch.from_numpy(vn / np.clip(np.linalg.norm(vn, axis=1, keepdims=True), 1e-12, None))
        if search_depth > 0:
            nmap, _ = _bake_position_map(nrm.cpu().numpy().astype(np.float32), f_np, uv_np, texture_size)
            nn = torch.from_numpy(np.ascontiguousarray(nmap[mask] * FLIP, dtype=np.float32)).to(device)
            nn = nn / nn.norm(dim=1, keepdim=True).clamp_min(1e-8)
            depths = np.arange(-search_out, search_depth + 1e-6, 0.5) * voxel   # 음수 = 바깥
        else:
            nn, depths = None, [0.0]
        img = np.zeros((texture_size, texture_size, 3), np.float32)
        idx = np.flatnonzero(mask.ravel())
        stats = []
        logging.info(f"BakeSplatTexture: normals {'있음' if nn is not None else '없음'}, ref {'있음' if reference_mesh is not None else '없음'}, texel {pts.shape[0]}, bbox pts {pts.amin(0).tolist()} ~ {pts.amax(0).tolist()}, vol lo {lo.tolist()} voxel {voxel:.5f} dims {list(vol.shape)}")
        for st in range(0, pts.shape[0], 1 << 19):
            p0 = pts[st:st + (1 << 19)]
            acc = torch.zeros((p0.shape[0], 3), device=device)
            T = torch.ones(p0.shape[0], device=device)
            for dd in depths:   # 바깥 → 안쪽, 앞에서부터 합성(T = 남은 투과율)
                q = p0 if nn is None else p0 - nn[st:st + (1 << 19)] * float(dd)
                c, _ = _sample_color(col, wsum, q, lo, voxel, device)
                a = 1.0 - torch.exp(-_sample_scalar(vol, q, lo, voxel, device) * alpha_gain * 0.5)
                acc += (T * a)[:, None] * c
                T = T * (1.0 - a)
            out = acc / (1.0 - T).clamp_min(1e-4)[:, None]
            c0, _ = _sample_color(col, wsum, p0, lo, voxel, device)          # 아무것도 못 만나면 겉면 색
            out = torch.where((T > 0.999)[:, None], c0, out)
            stats.append(((T > 0.999).float().sum().item(), (T < 0.1).float().sum().item(), p0.shape[0], _sample_scalar(vol, p0, lo, voxel, device).mean().item()))
            img.reshape(-1, 3)[idx[st:st + (1 << 19)]] = out.clamp(0, 1).cpu().numpy()
        ns = np.array(stats).sum(0) if stats else np.zeros(4)
        logging.info(f"BakeSplatTexture: 못 만남 {ns[0] / max(ns[2], 1) * 100:.1f}% · 불투명 도달 {ns[1] / max(ns[2], 1) * 100:.1f}% · 겉면 밀도 평균 {ns[3] / max(len(stats), 1):.3f}")
        img = _seam_fill(img, mask)
        return (torch.from_numpy(np.ascontiguousarray(img)).clamp(0, 1)[None],)


NODE_CLASS_MAPPINGS = {"SplatToSolidMesh": SplatToSolidMesh, "BakeSplatTexture": BakeSplatTexture}
NODE_DISPLAY_NAME_MAPPINGS = {"SplatToSolidMesh": "Splat → Solid Mesh (3dtodomyen)", "BakeSplatTexture": "Bake Splat Texture (3dtodomyen)"}
