export const containsOnlyDigits = (value) => {
  return /^-?\d+$/.test(value);
};

export const isNil = (x) => x === null || x === undefined;
