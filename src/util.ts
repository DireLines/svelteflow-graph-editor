import { preorderTraverse } from "./nodes-and-edges";
export const isNil = (x: any) => x === null || x === undefined;

const containsOnlyDigits = (value: string) => {
  return /^-?\d+$/.test(value);
};

export const getHighestNumericId = (nodes: any[]): number => {
  let maxId = 0;
  for (const n of preorderTraverse(nodes)) {
    if (containsOnlyDigits(n.id)) {
      const parsed = parseInt(n.id);
      if (parsed > maxId) {
        maxId = parsed;
      }
    }
  }
  return maxId;
};

export const slugify = (s: string) => {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w]+/g, "-");
};
