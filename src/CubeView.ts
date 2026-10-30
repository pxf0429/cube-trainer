import { CubieCube, FaceletCube } from "./lib/CubeLib";
import { CUBE_COLORS, DEFAULT_CUBE_COLORS, cubePalette } from "./lib/CubeColors";
import { E } from "./lib/Defs";

const names = ["U", "D", "F", "B", "L", "R"];
const faceClasses = ["up", "down", "front", "back", "left", "right"];
const faceNames = ["顶面 U", "底面 D", "正面 F", "背面 B", "左面 L", "右面 R"];
const facelets = [FaceletCube.faces.u_face, FaceletCube.faces.d_face, FaceletCube.faces.f_face,
    FaceletCube.faces.b_face, FaceletCube.faces.l_face, FaceletCube.faces.r_face];

export function faceMarkup(cube: CubieCube, face: number, focusLR = false, palette = cubePalette(DEFAULT_CUBE_COLORS)): string {
    const stickers = FaceletCube.from_cubie(cube)[face];
    return stickers.map((color, i) => {
        const [position, , type] = facelets[face][i];
        const piece = type === E ? cube.ep[position] : -1;
        // Track the two LSE target pieces, including both stickers, rather than
        // every sticker sharing a bridge color (corners, centers and solved edges).
        const target = focusLR && (piece === 1 || piece === 3);
        const label = target ? (piece === 1 ? 'L' : 'R') : '';
        return '<span class="sticker ' + (focusLR ? (target ? 'lr-target' : 'muted-sticker') : '') +
        (target ? '" data-lr="' + label : '') +
        '" style="--sticker:' + (CUBE_COLORS[palette[color]]?.hex || "#747b73") + '" aria-label="' +
        (CUBE_COLORS[palette[color]]?.name || "未知颜色") + ' · ' + names[color] + (i === 4 ? ' 中心' : '') +
        (target ? '，目标 ' + label + ' 棱' : '') + '"></span>';
    }).join("");
}

export function hiddenFaces(pitch: number, yaw: number): number[] {
    const x = pitch * Math.PI / 180, y = yaw * Math.PI / 180;
    // Opposite normals are paired. The face pointing away from the camera
    // is translated outward; its reverse side provides the mirrored view.
    return [-Math.sin(x) >= 0 ? 1 : 0, Math.cos(y) >= 0 ? 3 : 2, -Math.sin(y) >= 0 ? 4 : 5];
}

export function mappedFacesMarkup(cube: CubieCube, focusLR: boolean, pitch: number, yaw: number, colors = DEFAULT_CUBE_COLORS): string {
    const palette = cubePalette(colors);
    return hiddenFaces(pitch, yaw).map(face => '<div class="mapped-face mapped-' + faceClasses[face] + '" data-mapped-face="' + face +
        '" role="img" aria-label="' + faceNames[face] + '映射">' + faceMarkup(cube, face, focusLR, palette) + '</div>').join("");
}

export function cubeMarkup(cube: CubieCube, net: boolean, focusLR: boolean, pitch: number, yaw: number, colors = DEFAULT_CUBE_COLORS): string {
    const palette = cubePalette(colors);
    if (net) {
        return '<div class="cube-net" aria-label="魔方六面展开图">' + [0, 4, 2, 5, 3, 1].map(face =>
            '<div class="net-face net-' + faceClasses[face] + '"><div class="face-label">' + faceNames[face] +
            '</div><div class="face-grid">' + faceMarkup(cube, face, focusLR, palette) + '</div></div>'
        ).join("") + '</div>';
    }
    return '<div class="cube-scene" data-cube-drag aria-label="可拖动旋转视角的魔方">' +
        '<div class="cube-shadow"></div><div class="cube-rig" style="transform:rotateX(' + pitch + 'deg) rotateY(' + yaw + 'deg)">' +
        faceClasses.map((name, face) => '<div class="cube-face cube-' + name + '">' + faceMarkup(cube, face, focusLR, palette) + '</div>').join("") +
        '<div class="cube-mappings" data-faces="' + hiddenFaces(pitch, yaw).join(",") + '">' + mappedFacesMarkup(cube, focusLR, pitch, yaw, colors) + '</div></div></div>';
}
