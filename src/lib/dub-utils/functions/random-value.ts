/* eslint-disable @typescript-eslint/no-explicit-any -- Dub-ported utility code; preserves upstream shape. See CLAUDE.md "dub-ported modules" allowlist (also covers console.* in this directory tree). */
export const randomValue = (values: any[]) => {
  return values[Math.floor(Math.random() * values.length)];
};
