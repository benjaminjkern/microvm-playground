export const addVec = (a, b) => {
    if (a.length !== b.length) throw "Mismatched vectors!";
    return a.map((ax, i) => ax + b[i]);
};

export const subVec = (a, b) => {
    if (a.length !== b.length) throw "Mismatched vectors!";
    return a.map((ax, i) => ax - b[i]);
};

export const multConstVec = (a, v) => {
    return v.map((x) => x * a);
};

export const vecDistSquared = (a, b) =>
    a.reduce((p, ax, i) => p + (ax - b[i]) ** 2, 0);

export const vecDist = (a, b) => {
    return Math.sqrt(vecDistSquared(a, b));
};

export const lengthVec = (a) => {
    return Math.sqrt(a.reduce((p, x) => p + x ** 2, 0));
};

export const unitVec = (a) => {
    const length = lengthVec(a);
    if (length > 0) return a.map((x) => x / length);
    return a.map(() => 0);
};

export const unitVecFromAngle = (theta) => {
    return [Math.cos(theta), Math.sin(theta)];
};

export const vecDot = (a, b) => a.reduce((p, ax, i) => p + ax * b[i], 0);
