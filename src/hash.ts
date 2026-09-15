/**
 * A stable number in [0, 1) from a string: FNV-1a with a murmur finaliser.
 * Used wherever the layout needs "random but the same every time" — a node's
 * lag, its phase, where it first appears — so a web builds the same way twice.
 */
export function unitHash(s: string, salt = 0): number {
  let h = (0x811c9dc5 ^ salt) >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}
