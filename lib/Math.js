let rand_int = (r) => {
    return Math.floor(Math.random() * r);
};
let rand_incl = (l, r) => {
    return rand_int(r - l + 1) + l;
};
let rand_choice = function (arr) {
    return arr[rand_int(arr.length)];
};
let rand_shuffle = function (arr) {
    for (let i = 0, l = arr.length; i < l - 1; i++) {
        let j = rand_incl(i, l - 1);
        let tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
};
function cartesianProduct(...allEntries) {
    return allEntries.reduce((results, entries) => results
        .map(result => entries.map(entry => result.concat([entry])))
        .reduce((subResults, result) => subResults.concat(result), []), [[]]);
}
let getParity = (perm) => {
    let visited = Array(perm.length).fill(false);
    let follow = (i, cnt) => {
        if (visited[i]) {
            return 0;
        }
        else {
            visited[i] = 1;
            if (visited[perm[i]]) {
                return cnt;
            }
            else
                return follow(perm[i], cnt + 1);
        }
    };
    let res = 0;
    for (let x of perm) {
        res += follow(x, 0);
    }
    return res;
};
let arrayEqual = function (arr1, arr2) {
    if (arr1.length !== arr2.length)
        return false;
    for (let i = 0; i < arr1.length; i++) {
        if (arr1[i] !== arr2[i])
            return false;
    }
    return true;
};
let encodeArr = function (base, rarr) {
    let int = 0;
    for (let i = rarr.length - 1; i >= 0; i--)
        int = rarr[i] + int * base;
    return int;
};
export { rand_int, rand_choice, rand_shuffle, getParity, arrayEqual, encodeArr, cartesianProduct };
