import { cstimer_corners_coord, cstimer_edges_coord, centers_coord } from "./Defs.js?v=b073598e48f7";
import { u, d, f, b, l, r, m, e, s } from "./Defs.js?v=b073598e48f7";
import { corners_coord, edges_coord, u_face, f_face, color_map } from "./Defs.js?v=b073598e48f7";
import { Typ, Face, C, E, T, U, D, F, B, L, R } from "./Defs.js?v=b073598e48f7";
import { rand_int, rand_shuffle, getParity, rand_choice, arrayEqual } from "./Math.js?v=b073598e48f7";
const C_MOD = 3;
const E_MOD = 2;
const T_MOD = 1;
export class CubieCube {
    constructor(value) {
        this.cp = [];
        this.co = [];
        this.ep = [];
        this.eo = [];
        this.tp = [];
        if (value instanceof CubieCube) {
            this.set({
                cp: value.cp, co: value.co, ep: value.ep, eo: value.eo, tp: value.tp
            });
        }
        else if (value) {
            this.cp = value.cp;
            this.co = value.co;
            this.ep = value.ep;
            this.eo = value.eo;
            this.tp = value.tp || [0, 1, 2, 3, 4, 5]; // UD FB LR
        }
        else {
            this.Id();
        }
    }
    // The addition of tp is not necessary, but helps us deal with slice moves in Roux during search and simcube.
    deserialize(s) {
        let obj = JSON.parse(s);
        this.set(obj);
        return this;
    }
    serialize() {
        let { cp, co, ep, eo, tp } = this;
        return JSON.stringify({ cp, co, ep, eo, tp });
    }
    Id() {
        this.set({
            cp: [0, 1, 2, 3, 4, 5, 6, 7],
            co: [0, 0, 0, 0, 0, 0, 0, 0],
            ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
            eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            tp: [0, 1, 2, 3, 4, 5]
        });
        return this;
    }
    clone() {
        return new CubieCube({
            cp: [...this.cp],
            co: [...this.co],
            ep: [...this.ep],
            eo: [...this.eo],
            tp: [...this.tp]
        });
    }
    set(value) {
        this.cp = value.cp || this.cp;
        this.co = value.co || this.co;
        this.ep = value.ep || this.ep;
        this.eo = value.eo || this.eo;
        this.tp = value.tp || this.tp;
    }
    _apply_partial(o, p, oc, pc, mod) {
        let o_new = [...o];
        let p_new = [...p];
        for (let i = 0; i < oc.length; i++) {
            //let [src, dst] = pc[i];
            let src = pc[i][0], dst = pc[i][1];
            p_new[dst] = p[src];
            o_new[dst] = (o[src] + oc[i]) % mod;
        }
        return [o_new, p_new];
    }
    _apply_partial_perm(p, pc, mod) {
        let p_new = [...p];
        for (let i = 0; i < pc.length; i++) {
            //let [src, dst] = pc[i];
            let src = pc[i][0], dst = pc[i][1];
            p_new[dst] = p[src];
        }
        return p_new;
    }
    // all side-effect-less
    apply_one(move) {
        let [co, cp] = this._apply_partial(this.co, this.cp, move.coc, move.cpc, C_MOD);
        let [eo, ep] = this._apply_partial(this.eo, this.ep, move.eoc, move.epc, E_MOD);
        let tp = this._apply_partial_perm(this.tp, move.tpc, T_MOD);
        return new CubieCube({ co, cp, eo, ep, tp });
    }
    static generate_apply_partial_func_perm(pc, mod, p) {
        return `
        let ${p}_new = [...${p}];
        src = 0, dst = 0;
        ${Array(pc.length).fill(0).map((_, i) => {
            let src = pc[i][0], dst = pc[i][1];
            return `
                ${p}_new[${dst}] =  ${p}[${src}];
            `;
        }).join("\n")}
        // return [ ${p}_new]
        `;
    }
    static generate_apply_partial_func(oc, pc, mod, o, p) {
        return `
        let ${o}_new = [...${o}];
        let ${p}_new = [...${p}];
        src = 0, dst = 0;
        ${Array(oc.length).fill(0).map((_, i) => {
            let src = pc[i][0], dst = pc[i][1], ori = oc[i];
            return `
                ${p}_new[${dst}] =  ${p}[${src}];
                ${o}_new[${dst}] = (${o}[${src}] + ${ori}) % ${mod};
            `;
        }).join("\n")}
        // return [${o}_new, ${p}_new]
        `;
    }
    static generate_apply_func(move) {
        // eslint-disable-next-line no-new-func
        return new Function("cube", `
        let {co, cp, eo, ep, tp} = cube;
        ${CubieCube.generate_apply_partial_func(move.coc, move.cpc, C_MOD, "co", "cp")}
        ${CubieCube.generate_apply_partial_func(move.eoc, move.epc, E_MOD, "eo", "ep")}
        ${CubieCube.generate_apply_partial_func_perm(move.tpc, T_MOD, "tp")}
        return ({ co: co_new, cp: cp_new, eo: eo_new,
            ep: ep_new, tp: tp_new })
        `);
    }
    apply(move) {
        if (Array.isArray(move) || move instanceof MoveSeq) {
            let moves = Array.isArray(move) ? move : move.moves;
            let cube = this.clone();
            for (let i = 0; i < moves.length; i++) {
                cube = cube.apply_one(moves[i]);
            }
            return cube;
        }
        else if (typeof move === "string") {
            return this.apply(new MoveSeq(move));
        }
        else {
            return this.apply_one(move);
        }
    }
    static _rotate_coord(fs) {
        let faces = [...fs];
        let last_face = faces[faces.length - 1];
        for (let i = faces.length - 1; i > 0; i--) {
            faces[i] = faces[i - 1];
        }
        faces[0] = last_face;
        return faces;
    }
    static _backward_rotate_coord(fs) {
        let faces = [...fs];
        let first_face = faces[0];
        for (let i = 0; i < faces.length - 1; i++) {
            faces[i] = faces[i + 1];
        }
        faces[faces.length - 1] = first_face;
        return faces;
    }
    // facelet mapping: from position to piece
    _to_facelet_mapping(corners_coord, edges_coord, centers_coord) {
        let facelet_mapping = [];
        for (let i = 0; i < 8; i++) {
            let pos = corners_coord[i];
            let piece = corners_coord[this.cp[i]];
            for (let j = 0; j < this.co[i]; j++) {
                piece = CubieCube._rotate_coord(piece);
            }
            facelet_mapping.push([pos, piece]);
        }
        for (let i = 0; i < 12; i++) {
            let pos = edges_coord[i];
            let piece = edges_coord[this.ep[i]];
            for (let j = 0; j < this.eo[i]; j++) {
                piece = CubieCube._rotate_coord(piece);
            }
            facelet_mapping.push([pos, piece]);
        }
        for (let i = 0; i < 6; i++) {
            let pos = centers_coord[i];
            let piece = centers_coord[this.tp[i]];
            facelet_mapping.push([pos, piece]);
        }
        return facelet_mapping;
    }
    _from_facelet_mapping(fm, custom_corners_coord, custom_edges_coord, custom_centers_coord) {
        let cube = new CubieCube();
        let match_pos_piece = (pos, piece, coord, parity) => {
            let expected = new Map(coord.map((x, i) => [x.toString(), i]));
            let ori = 0;
            while (!expected.has(pos.toString())) {
                pos = CubieCube._backward_rotate_coord(pos);
                ori--;
                if (ori <= -parity)
                    break;
            }
            while (!expected.has(piece.toString())) {
                piece = CubieCube._backward_rotate_coord(piece);
                ori++;
                if (ori >= 10) {
                    console.warn("can't match piece", piece, expected);
                    break;
                }
            }
            ori = (ori + parity) % parity;
            return [ori, expected.get(pos.toString()), expected.get(piece.toString())];
        };
        for (let coord_pair of fm) {
            let pos = coord_pair[0], piece = coord_pair[1];
            let coord = (pos.length === 2) ? custom_edges_coord :
                (pos.length === 3) ? custom_corners_coord :
                    custom_centers_coord;
            let [newOri, newpos, newPerm] = match_pos_piece(pos, piece, coord, pos.length);
            //console.log( pp([pos, piece]), [newOri, newpos,newPerm])
            if (pos.length === 2) {
                cube.eo[newpos] = newOri;
                cube.ep[newpos] = newPerm;
            }
            else if (pos.length === 3) {
                cube.co[newpos] = newOri;
                cube.cp[newpos] = newPerm;
            }
            else {
                cube.tp[newpos] = newPerm;
            }
        }
        return cube;
    }
    to_cstimer_cube() {
        let facelet_mapping = this._to_facelet_mapping(corners_coord, edges_coord, centers_coord);
        let cube = this._from_facelet_mapping(facelet_mapping, cstimer_corners_coord, cstimer_edges_coord, centers_coord);
        return cube;
    }
    is_solveable() {
        if (this.tp[0] !== 0) {
            this.apply(new MoveSeq("M2")); // assuming lse
        }
        let perm_correct = (getParity(this.cp) + getParity(this.ep)) % 2 === 0;
        let ori_correct = (this.co.reduce((x, y) => x + y, 0) % 3 === 0) && (this.eo.reduce((x, y) => x + y, 0) % 2 === 0);
        return perm_correct && ori_correct;
    }
    changeBasis(s) {
        // only take x and y for now
        let facelet_mapping = this._to_facelet_mapping(corners_coord, edges_coord, centers_coord);
        let transformed_mapping = s.moves.reduce((mapping, move) => {
            let face_mapping = Object.fromEntries(move.tpc);
            //console.log("applying face mapping for ", move.name, face_mapping)
            //console.log("before", pp(mapping))
            let result = mapping.map(([face_pos, face_target]) => [face_pos.map(f => face_mapping[f] ?? f),
                face_target.map(f => face_mapping[f] ?? f)]);
            //console.log('after', pp(result))
            return result;
        }, facelet_mapping);
        //console.log(s.toString(), facelet_mapping, transformed_mapping)
        let cube = this._from_facelet_mapping(transformed_mapping, corners_coord, edges_coord, centers_coord);
        return cube;
        //let cube = this._from_facelet_mapping(facelet_mapping, corners_coord, edges_coord, centers_coord)
    }
}
/* Moves */
/* We will generate all the moves based on the base moves and rotations, and return them in an array */
export class Move {
    constructor(arg, name) {
        this.cpc = [];
        this.coc = [];
        this.epc = [];
        this.eoc = [];
        this.tpc = [];
        this.name = "";
        if (Array.isArray(arg)) {
            this.from_moves(arg, name);
        }
        else if (arg instanceof Move) {
            this.cpc = [...arg.cpc];
            this.coc = [...arg.coc];
            this.epc = [...arg.epc];
            this.eoc = [...arg.eoc];
            this.tpc = [...arg.tpc];
            this.name = name;
        }
        else if (arg instanceof CubieCube) {
            this.from_cube(arg, name);
        }
        else if (arg) {
            this.set(arg);
        }
    }
    set(move) {
        this.cpc = move.cpc;
        this.coc = move.coc;
        this.epc = move.epc;
        this.eoc = move.eoc;
        this.tpc = move.tpc;
        this.name = move.name;
    }
    from_cube(cube, name) {
        let get_change = (p, o, acc_p, acc_o) => {
            for (let i = 0; i < p.length; i++) {
                if (i === p[i] && o[i] === 0) {
                }
                else {
                    acc_p.push([p[i], i]);
                    acc_o.push(o[i]);
                }
            }
        };
        get_change(cube.cp, cube.co, this.cpc, this.coc);
        get_change(cube.ep, cube.eo, this.epc, this.eoc);
        get_change(cube.tp, [0, 0, 0, 0, 0, 0], this.tpc, []);
        this.name = name;
        return this;
    }
    from_moves(moves, name) {
        this.from_cube(new CubieCube().apply(moves), name);
        return this;
    }
    clone() {
        return new Move(this, this.name);
    }
    static make_rot_set(move) {
        return [move,
            new Move().from_moves([move, move], move.name + "2"),
            new Move().from_moves([move, move, move], move.name + "'"),
        ];
    }
    inv() {
        let name;
        switch (this.name[this.name.length - 1]) {
            case "'":
                name = this.name.slice(0, this.name.length - 1);
                break;
            case "2":
                name = this.name;
                break;
            default: name = this.name + "'";
        }
        return Move.all[name];
    }
    toString() {
        return this.name;
    }
}
Move.generate_base_moves = () => {
    let make_rot_set = Move.make_rot_set;
    let us = make_rot_set(new Move(u));
    let fs = make_rot_set(new Move(f));
    let rs = make_rot_set(new Move(r));
    let ls = make_rot_set(new Move(l));
    let ds = make_rot_set(new Move(d));
    let bs = make_rot_set(new Move(b));
    let ms = make_rot_set(new Move(m));
    let es = make_rot_set(new Move(e));
    let ss = make_rot_set(new Move(s));
    let rw = new Move([new Move(r), ms[2]], "r");
    let rws = make_rot_set(rw);
    let lw = new Move([new Move(l), new Move(m)], "l");
    let lws = make_rot_set(lw);
    let uw = new Move([new Move(u), new Move(e)], "u");
    let uws = make_rot_set(uw);
    let fw = new Move([new Move(f), new Move(s)], "f");
    let fws = make_rot_set(fw);
    let x = new Move([new Move(r), ls[2], ms[2]], "x");
    let xs = make_rot_set(x);
    let y = new Move([new Move(u), new Move(e), ds[2]], "y");
    let ys = make_rot_set(y);
    let z = new Move([x, y, x, x, x], "z");
    let zs = make_rot_set(z);
    let id = new Move(new CubieCube(), "id");
    let moves = [
        id,
        us, fs, rs, ls, ds, bs, ms, es, ss,
        xs, ys, zs,
        rws, lws, uws, fws
    ].flat();
    let moves_dict = Object.create({});
    moves.forEach(m => moves_dict[m.name] = m);
    return moves_dict;
};
Move.all = Move.generate_base_moves();
export class MoveSeq {
    constructor(moves) {
        this.moves = [];
        if (typeof moves === "string") {
            this.parse(moves);
        }
        else {
            this.moves = moves;
        }
    }
    toQuarter() {
        let nm = [];
        for (let i = 0; i < this.moves.length; i++) {
            let m = this.moves[i];
            if (m.name[1] === "2") {
                let k = MoveSeq.quarterMap[m.name] || m.name[0];
                nm.push(Move.all[k]);
                nm.push(Move.all[k]);
            }
            else {
                nm.push(m);
            }
        }
        return new MoveSeq(nm);
    }
    static _combine(move1, move2) {
        const getCnt = (name) => {
            if (name.length === 1)
                return 1;
            return name[1] === "2" ? 2 : 3;
        };
        const getStr = (cnt) => {
            return (cnt === 1) ? "" : (cnt === 2 ? "2" : "'");
        };
        if (move1.name[0] === move2.name[0]) {
            let cnt = (getCnt(move1.name) + getCnt(move2.name)) % 4;
            if (cnt === 0)
                return new MoveSeq([]);
            else
                return new MoveSeq([Move.all[move1.name[0] + getStr(cnt)]]);
        }
        else {
            return new MoveSeq([move1, move2]);
        }
    }
    remove_setup() {
        let rotset = new Set(["x", "x'", "x2", "y", "y'", "y2", "z", "z'", "z2"]);
        while (this.moves.length > 0 && rotset.has(this.moves[0].name)) {
            this.moves.shift();
        }
        return this;
    }
    parse_line(str) {
        let tokens = [];
        let token = "";
        let comment_idx = str.search(/\/\//);
        if (comment_idx > -1)
            str = str.slice(0, comment_idx);
        for (let i = 0; i < str.length; i++) {
            let ch = str[i];
            if (ch === '2' || ch === '\'') {
                if (token.length === 1) {
                    token += str[i];
                    tokens.push(token);
                    token = "";
                }
            }
            else if (ch === ' ') {
                if (token.length > 0) {
                    tokens.push(token);
                    token = "";
                }
            }
            else {
                const ord = ch.charCodeAt(0);
                if ((65 <= ord && ord < 65 + 26) || (97 <= ord && ord < 97 + 26)) {
                    if (token.length > 0) {
                        tokens.push(token);
                        token = "";
                    }
                    token += str[i];
                }
            }
        }
        let moves = [];
        if (token.length > 0)
            tokens.push(token);
        for (let token of tokens) {
            let move = Move.all[token];
            if (move) {
                moves.push(move);
            }
        }
        return moves;
    }
    parse(str) {
        this.moves = str.split("\n").map(x => this.parse_line(x)).flat();
        return this;
    }
    collapse() {
        let newMoves = [];
        let moves = this.moves;
        while (moves.length > 0) {
            const nextMove = moves.shift();
            if (newMoves.length === 0) {
                newMoves.push(nextMove);
            }
            else {
                const move = newMoves.pop();
                const combined = MoveSeq._combine(move, nextMove);
                for (let m of combined.moves)
                    newMoves.push(m);
            }
        }
        return new MoveSeq(newMoves);
    }
    inv() {
        let moves = this.moves.slice(0).reverse().map(x => x.inv()).flat();
        return new MoveSeq(moves);
    }
    slice(n) {
        let moves = this.moves.slice(0, n);
        return new MoveSeq(moves);
    }
    length() {
        return this.moves.length;
    }
    static add_auf(moves, auf_moves) {
        auf_moves = auf_moves || [Move.all["id"], Move.all["U"], Move.all["U'"], Move.all["U2"]];
        let auf_move = rand_choice(auf_moves);
        if (auf_move instanceof MoveSeq) {
            moves.concat(auf_move.moves);
        }
        else {
            moves.push(auf_move);
        }
    }
    toString(useMetric) {
        return this.moves.map(m => m.toString()).join(" ") + " " + (useMetric ? "(" + this.moves.length + ")" : "");
    }
}
MoveSeq.quarterMap = ({
    "U2": "U'",
    "R2": "R'",
    "r2": "r'",
    "M2": "M'",
    "L2": "L",
});
/* Faces */
let FaceletCube = function () {
    let mult_move = (face, move) => {
        let face_new = [...face];
        let mod_for_typ = (typ) => {
            switch (typ) {
                case C: return 3;
                case E: return 2;
                case T: return 1;
            }
        };
        let work = (p, o, typ) => {
            let mod = mod_for_typ(typ);
            let [p1, p2] = p;
            for (let i = 0; i < face.length; i++) {
                let [p_curr, o_curr, typ_curr] = face[i];
                if (typ_curr === typ && p_curr === p1) {
                    face_new[i] = [p2, (o_curr + o) % mod, typ];
                }
            }
        };
        for (let i = 0; i < move.cpc.length; i++) {
            work(move.cpc[i], move.coc[i], C);
        }
        for (let i = 0; i < move.epc.length; i++) {
            work(move.epc[i], move.eoc[i], E);
        }
        for (let i = 0; i < move.tpc.length; i++) {
            work(move.tpc[i], 0, T);
        }
        return face_new;
    };
    let color_of_c = (p, o1, o2) => corners_coord[p][(3 - o1 + o2) % 3];
    let color_of_e = (p, o1, o2) => edges_coord[p][(2 - o1 + o2) % 2];
    let color_of_t = (p) => [U, D, F, B, L, R][p];
    let color_of_sticker = (cube, sticker) => {
        let [p, o, typ] = sticker;
        if (typ === C) {
            return color_of_c(cube.cp[p], cube.co[p], o);
        }
        else if (typ === E) {
            return color_of_e(cube.ep[p], cube.eo[p], o);
        }
        else if (typ === T) {
            return color_of_t(cube.tp[p]);
        }
        else {
            throw Error("unidentified type " + typ);
        }
    };
    let from_cubie_partial = (cube, facelet) => {
        return facelet.map(s => color_of_sticker(cube, s));
    };
    let from_cubie_partial_masked = (cube, facelet, mask) => {
        return facelet.map(([p, o, typ]) => {
            if (typ === C) {
                if (mask.cp[cube.cp[p]] === 1)
                    return color_of_c(cube.cp[p], cube.co[p], o);
                else
                    return Face.X;
            }
            else if (typ === E) {
                if (mask.ep[cube.ep[p]] === 1)
                    return color_of_e(cube.ep[p], cube.eo[p], o);
                else
                    return Face.X;
            }
            else if (typ === T) {
                if (mask.tp && mask.tp[cube.tp[p]] === 0)
                    return Face.X;
                else
                    return color_of_t(cube.tp[p]);
            }
            else {
                throw Error("unidentified type " + typ);
            }
        });
    };
    let moves = Move.all;
    let generate_base_facelets = () => {
        let d_face = mult_move(f_face, moves["x'"]);
        let l_face = mult_move(f_face, moves["y"]);
        let r_face = mult_move(f_face, moves["y'"]);
        let b_face = mult_move(f_face, moves["y2"]);
        return {
            d_face, l_face, r_face, b_face
        };
    };
    let { d_face, l_face, r_face, b_face } = generate_base_facelets();
    let from_cubie = (cube, mask) => {
        //console.log("converting from cube", cube)
        let faces = [u_face, d_face, f_face, b_face, l_face, r_face];
        if (mask)
            return faces.map((facelet) => from_cubie_partial_masked(cube, facelet, mask));
        else
            return faces.map((facelet) => from_cubie_partial(cube, facelet));
    };
    let as_actrm = (fcube, faces, uu_only) => {
        // U_face index 0
        // algorithm: for U face and 0..2 of FBLR face, filter by lr|fb + u sticker
        // additionally, if uu_only == 1, filter 0..2 of FBLR face by lr|fb only.
        const U_IDX = 0;
        const F_IDX = 2;
        const nmcll_faces = (faces === 'lr') ? [Face.L, Face.R] : [Face.F, Face.B];
        const u_or_nmcll_faces = [Face.U, ...nmcll_faces];
        return fcube.map((stickers, idx) => {
            if (idx === U_IDX) {
                return stickers.map(s => u_or_nmcll_faces.includes(s) ? s : Face.X);
            }
            if (idx >= F_IDX) {
                return stickers.map((s, fidx) => ((uu_only ? nmcll_faces : u_or_nmcll_faces).includes(s) || fidx > 2)
                    ? s
                    : Face.X);
            }
            return [...stickers];
        });
    };
    let as_kata = (fcube) => {
        // find out where are the recog stickers and grey out the rest
        console.log(fcube);
        let { F, B, L, R, U } = Face;
        const shape_maps = [
            // prioritize all recog stickers on U (Pi, H)
            [[U, 0], [U, 2], [U, 6], [U, 8]],
            // next, find recog stickers in T shape
            [[U, 0], [U, 2], [L, 2], [R, 0]],
            [[U, 2], [U, 8], [B, 2], [F, 0]],
            [[U, 6], [U, 8], [L, 0], [R, 2]],
            [[U, 0], [U, 6], [B, 0], [F, 2]],
            // default: recog stickers for L
            [[U, 2], [U, 6], [F, 2], [B, 2]],
            [[U, 0], [U, 8], [L, 2], [R, 2]],
            // default: recog stickers for O (solved)
            [[F, 0], [F, 2], [R, 0], [R, 2]],
        ];
        let found = false;
        for (let map of shape_maps) {
            let match_count = 0;
            for (let [f, i] of map) {
                match_count += (fcube[f][i] !== Face.U) ? 1 : 0;
            }
            if (match_count === map.length) {
                // found recog shape, now make all non-U pieces X
                for (let f of [Face.L, Face.R, Face.F, Face.B, Face.U]) {
                    for (let i = 0; i < ((f === Face.U) ? 9 : 3); i++) {
                        if (fcube[f][i] !== Face.U) {
                            let is_recog = Array(4).fill(0).map((_, j) => (map[j][0] === f && map[j][1] === i)).includes(true);
                            if (!is_recog) {
                                fcube[f][i] = Face.X;
                            }
                        }
                    }
                }
                found = true;
                break;
            }
        }
        //console.log(fcube)
        if (!found) {
            alert("recog shape not found");
        }
        return fcube;
    };
    let to_unfolded_cube_str = (faceletCube) => {
        let face_count = [0, 0, 0, 0, 0, 0];
        let str_face_map = {
            "U": U, "D": D, "F": F, "B": B, "L": L, "R": R
        };
        let face_str_map = "UDFBLR";
        let color_cube = "";
        for (let i = 0; i < color_map.length; i++) {
            let face_char = color_map[i];
            if (str_face_map.hasOwnProperty(face_char)) {
                let face = str_face_map[face_char];
                let count = face_count[face];
                let color = faceletCube[face][count];
                color_cube += face_str_map[color];
                face_count[face] += 1;
            }
            else {
                color_cube += color_map[i];
            }
        }
        return color_cube;
    };
    return {
        from_cubie,
        to_unfolded_cube_str,
        color_of_sticker,
        color_of_e,
        as_actrm,
        as_kata,
        faces: {
            u_face, d_face, l_face, r_face, f_face, b_face
        }
    };
}();
function mask_copy(m) {
    return {
        co: m.co && [...m.co],
        eo: m.eo && [...m.eo],
        tp: m.tp && [...m.tp],
        cp: [...m.cp],
        ep: [...m.ep]
    };
}
const lse_mask = {
    cp: [1, 1, 1, 1, 1, 1, 1, 1],
    ep: [0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1],
};
const lse_4c_mask = {
    cp: [1, 1, 1, 1, 1, 1, 1, 1],
    ep: [0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1],
    eo: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
};
const solved_mask = {
    cp: [1, 1, 1, 1, 1, 1, 1, 1],
    ep: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
};
const empty_mask = {
    cp: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
};
const dl_solved_mask = {
    cp: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]
};
const bl_solved_mask = {
    cp: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]
};
const fs_back_mask = {
    cp: [0, 0, 0, 0, 0, 1, 0, 0],
    ep: [0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0],
    tp: [0, 0, 0, 0, 1, 1]
};
const fs_front_mask = {
    cp: [0, 0, 0, 0, 1, 0, 0, 0],
    ep: [0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    tp: [0, 0, 0, 0, 1, 1]
};
const fb_mask = {
    cp: [0, 0, 0, 0, 1, 1, 0, 0],
    ep: [0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0],
    tp: [0, 0, 0, 0, 1, 1]
};
const f2b_mask = {
    cp: [0, 0, 0, 0, 1, 1, 1, 1],
    ep: [0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1],
    tp: [0, 0, 0, 0, 1, 1]
};
const zhouheng_mask = {
    cp: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 0],
    tp: [0, 0, 0, 0, 1, 1]
};
const fbdr_mask = {
    cp: [0, 0, 0, 0, 1, 1, 0, 0],
    ep: [0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 0],
    tp: [0, 0, 0, 0, 1, 1]
};
const ss_front_mask = {
    cp: [0, 0, 0, 0, 1, 1, 0, 1],
    ep: [0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1],
    tp: [0, 0, 0, 0, 1, 1]
};
const ss_back_mask = {
    cp: [0, 0, 0, 0, 1, 1, 1, 0],
    ep: [0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 0],
    tp: [0, 0, 0, 0, 1, 1]
};
const ssdp_front_mask = {
    cp: [0, 0, 0, 0, 1, 1, 0, 1],
    ep: [0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 0],
    tp: [0, 0, 0, 0, 1, 1]
};
const ssdp_back_mask = {
    cp: [0, 0, 0, 0, 1, 1, 1, 0],
    ep: [0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 0],
    tp: [0, 0, 0, 0, 1, 1]
};
const ssdp_both_mask = {
    cp: [0, 0, 0, 0, 1, 1, 1, 1],
    ep: [0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 0],
    tp: [0, 0, 0, 0, 1, 1]
};
const sb_mask = {
    cp: [0, 0, 0, 0, 1, 1, 1, 1],
    ep: [0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1],
    tp: [0, 0, 0, 0, 1, 1]
};
const cmll_mask = {
    cp: [1, 1, 1, 1, 1, 1, 1, 1],
    ep: [0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1],
    tp: [0, 0, 0, 0, 1, 1]
};
let CubeUtil = (() => {
    let is_cube_solved = (cube) => {
        let id = new CubieCube();
        return arrayEqual(cube.co, id.co) &&
            arrayEqual(cube.eo, id.eo) &&
            arrayEqual(cube.cp, id.cp) &&
            arrayEqual(cube.ep, id.ep);
    };
    let is_solved = (cube, mask) => {
        let { co: co_, cp, eo: eo_, ep, tp: tp_ } = mask;
        let co = co_ || cp;
        let eo = eo_ || ep;
        let tp = tp_ || Array(6).fill(1);
        let c_true = co.every((_, i) => (cp[i] === 0 || cube.cp[i] === i)
            && (co[i] === 0 || cube.co[i] === 0));
        if (!c_true)
            return false;
        let e_true = eo.every((_, i) => (ep[i] === 0 || cube.ep[i] === i)
            && (eo[i] === 0 || cube.eo[i] === 0));
        if (!e_true)
            return false;
        let t_true = tp.every((_, i) => (tp[i] === 0 || cube.tp[i] === i));
        return t_true;
    };
    function ext(stickers, f) {
        return stickers.map(x => {
            let [a, b, c] = x;
            return [a, b, c, f];
        });
    }
    let { u_face, d_face, l_face, r_face, f_face, b_face } = FaceletCube.faces;
    let stickers = [...ext(u_face, U), ...ext(d_face, D),
        ...ext(l_face, L), ...ext(r_face, R), ...ext(f_face, F), ...ext(b_face, B)];
    let find_pairs = function () {
        // enumerate each sticker
        let edge_stickers = stickers.filter(s => s[2] === Typ.E);
        let corner_stickers = stickers.filter(s => s[2] === Typ.C);
        let ep_stickers = Array(12).fill(0).map(_ => Array(0));
        edge_stickers.map(s => ep_stickers[s[0]].push(s));
        let cp_stickers = Array(8).fill(0).map(_ => Array(0));
        corner_stickers.map(s => cp_stickers[s[0]].push(s));
        const epcp_pairs = [];
        for (let e = 0; e < 12; e++) {
            for (let c = 0; c < 8; c++) {
                let efs = ep_stickers[e];
                let cfs = cp_stickers[c];
                let match = 0;
                efs.forEach((e) => {
                    cfs.forEach((c) => { if (e[3] === c[3])
                        match++; });
                });
                if (match === 2) {
                    epcp_pairs.push([e, c]);
                }
            }
        }
        let get_color = (cube, s) => {
            return FaceletCube.color_of_sticker(cube, [s[0], s[1], s[2]]);
        };
        let func = (cube) => {
            // now we process the cube
            let connected_pairs = [];
            //console.log("All neighboring pairs ", epcp_pairs)
            for (let [ep, cp] of epcp_pairs) {
                let efs = ep_stickers[ep];
                let cfs = cp_stickers[cp];
                let cnt = 0;
                efs.forEach((e) => {
                    const c = cfs.filter((c) => e[3] === c[3])[0];
                    if (get_color(cube, e) === get_color(cube, c))
                        cnt++;
                });
                if (cnt === 2) {
                    connected_pairs.push([ep, cp]);
                }
            }
            return connected_pairs;
        };
        return func;
    }();
    let is_mask_solved2 = (cube, { co, eo, cp, ep }, premove) => {
        //let moves = [ [], Move.all["U"], Move.all["U'"], Move.all["U2"] ]
        co = co || cp;
        eo = eo || ep;
        for (let move of premove) {
            let cube1 = cube.apply(move);
            let solved = true;
            for (let i = 0; i < 8 && solved; i++) {
                if ((co[i] && cube1.co[i] !== 0)
                    || (cp[i] && cube1.cp[i] !== i)) {
                    solved = false;
                }
            }
            for (let i = 0; i < 12 && solved; i++) {
                if ((eo[i] && cube1.eo[i] !== 0)
                    || (ep[i] && cube1.ep[i] !== i)) {
                    solved = false;
                }
            }
            if (solved)
                return true;
        }
        return false;
    };
    const u_premove = [[], Move.all["U"], Move.all["U'"], Move.all["U2"]];
    const m2_premove = [[], Move.all["M2"]];
    let is_cmll_solved = (cube) => {
        return is_mask_solved2(cube, lse_mask, u_premove);
    };
    const oris = ["", "y", "y'", "y2", "x2", "x2y", "x2y'", "x2y2",
        "x", "xy", "xy'", "xy2", "x'", "x'y", "x'y'", "x'y2",
        "z", "zy", "zy'", "zy2", "z'", "z'y", "z'y'", "z'y2"];
    let rebase_to_edge = (cube, ep) => {
        for (let ori of oris) {
            const cube_rebased = cube.apply(ori);
            if ((cube_rebased.ep[ep] === ep)) {
                return [cube_rebased, ori];
            }
        }
        return [cube, ""];
    };
    let get_random_with_mask = ({ co, eo, cp, ep }) => {
        co = co || cp;
        eo = eo || ep;
        // get_random -- figure out which masks are 0, and assign random to these
        let random_ori = (ori_mask, typ) => {
            let ori = Array(ori_mask.length).fill(0);
            let mod = (typ === C) ? 3 : 2;
            let sum;
            do {
                sum = 0;
                for (let i in ori_mask) {
                    if (ori_mask[i] === 0) {
                        ori[i] = rand_int(mod);
                        sum += ori[i];
                    }
                }
            } while (sum % mod > 0);
            return ori;
        };
        let random_perm = (perm_mask) => {
            let perm = Array(perm_mask.length).fill(0);
            let undecided = [];
            for (let i = 0; i < perm_mask.length; i++) {
                if (perm_mask[i] === 0) {
                    undecided.push(i);
                }
                else {
                    perm[i] = i;
                }
            }
            rand_shuffle(undecided);
            for (let i = 0, cnt = 0; i < perm_mask.length; i++) {
                if (perm_mask[i] === 0) {
                    perm[i] = undecided[cnt];
                    cnt += 1;
                }
            }
            return perm;
        };
        let cp_rand, ep_rand, par;
        do {
            [cp_rand, ep_rand] = [random_perm(cp), random_perm(ep)];
            par = (getParity(cp_rand) + getParity(ep_rand)) & 1;
        } while (par > 0);
        return new CubieCube({
            co: random_ori(co, C),
            cp: cp_rand,
            eo: random_ori(eo, E),
            ep: ep_rand,
        });
    };
    let get_random_lse = () => {
        let cube = get_random_with_mask(lse_mask);
        return cube.apply(rand_choice(m2_premove));
    };
    return {
        is_cmll_solved,
        is_solved,
        get_random_lse,
        get_random_with_mask,
        is_cube_solved,
        find_pairs,
        stickers,
        rebase_to_edge
    };
})();
export class Storage {
    save() {
        window.localStorage.setItem(this.name, this.serialize());
    }
    load() {
        const item = window.localStorage.getItem(this.name);
        if (item)
            this.deserialize(item);
        else
            this._setDefault();
    }
}
export class ColorScheme extends Storage {
    constructor(suppressLoad) {
        super();
        this.name = "colorscheme";
        this.colors = {};
        if (!suppressLoad) {
            this.load();
        }
    }
    toUserInput() {
        return "GBROYWX".split('').map(x => this.colors[x]);
    }
    set(colors) {
        let newScheme = new ColorScheme(true);
        if (Array.isArray(colors)) {
            colors.forEach((color, i) => newScheme.colors["GBROYWX"[i]] = color);
        }
        else {
            newScheme.colors = { ...this.colors, ...colors };
        }
        newScheme.save();
        return newScheme;
    }
    setWithDefault() {
        let newScheme = new ColorScheme(true);
        newScheme._setDefault();
        newScheme.save();
        return newScheme;
    }
    _setDefault() { this.colors = ColorScheme.default_colors; }
    ;
    serialize() {
        return JSON.stringify(this.colors);
    }
    deserialize(s) {
        this.colors = JSON.parse(s);
    }
    getColorsForOri(s) {
        let faces = (ColorScheme.valid_schemes_map.get(s) || ColorScheme.valid_schemes_map.get("WG")) + "X";
        let arr = [];
        for (let i = 0; i < faces.length; i++) {
            arr.push(this.colors[faces[i]]);
        }
        return arr;
    }
}
// UDFBLR
// specify the colors for uf
// how to do this?
ColorScheme.default_colors = {
    "G": "#00b500",
    "B": "#0000ff",
    "R": "#ff0000",
    "O": "#ff8800",
    "Y": "#ffff00",
    "W": "#ffffff",
    "X": "#bfbfbf"
};
// UDFBLR from UF
// INFERR UFR from UF?
ColorScheme.valid_schemes = [
    "WYGBOR",
    "WYBGRO",
    "WYROGB",
    "WYORBG",
    "YWGBRO",
    "YWBGOR",
    "YWROBG",
    "YWORGB",
    "GBWYRO",
    "GBYWOR",
    "GBROYW",
    "GBORWY",
    "BGWYOR",
    "BGYWRO",
    "BGROWY",
    "BGORYW",
    "ORWYGB",
    "ORYWBG",
    "ORGBYW",
    "ORBGWY",
    "ROWYBG",
    "ROYWGB",
    "ROGBWY",
    "ROBGYW",
];
ColorScheme.valid_schemes_map = function () {
    return new Map(ColorScheme.valid_schemes.map(x => [x[0] + x[2], x]));
}();
let Mask = {
    lse_mask, fs_back_mask, fs_front_mask, fbdr_mask, fb_mask, f2b_mask, sb_mask, cmll_mask, ss_front_mask, ss_back_mask,
    ssdp_front_mask, ssdp_back_mask, ssdp_both_mask, empty_mask, dl_solved_mask, bl_solved_mask, solved_mask, zhouheng_mask, lse_4c_mask,
    copy: mask_copy
};
export { FaceletCube, CubeUtil, Mask };
