/*
  The PDFs use the built-in Helvetica, which covers Western European letters
  only. Symbols it lacks would print as other letters, so the common ones are
  spelled out ("≤" in MITI's company sizes, "≥", typographic arrows).
*/
const REPLACEMENTS: [string, string][] = [
  ['≤', '<='],
  ['≥', '>='],
  ['→', '->'],
  ['←', '<-'],
  ['−', '-'],
  ['×', 'x'],
]

export function printable(text: string) {
  return REPLACEMENTS.reduce((result, [from, to]) => result.replaceAll(from, to), text)
}
