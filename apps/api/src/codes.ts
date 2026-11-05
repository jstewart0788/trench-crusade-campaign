import { randomInt } from "node:crypto";

// Codes are typed into the TTS mod by hand, so the alphabet drops 0/O and 1/I.
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function generateCode(random: (max: number) => number = randomInt): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET.charAt(random(CODE_ALPHABET.length));
  return code;
}

/** Uppercases and strips spaces and dashes so "ab-cd ef" reads as ABCDEF; undefined when it is not a code. */
export function parseCode(input: string): string | undefined {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return CODE_RE.test(code) ? code : undefined;
}
