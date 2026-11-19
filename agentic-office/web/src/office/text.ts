/** Ajuste de linea y recorte de texto. Puro: recibe la funcion de medida. */

export type Measure = (text: string) => number;

const ELLIPSIS = '…';

/** Recorta el texto con elipsis para que quepa en maxWidth. */
export function truncate(text: string, maxWidth: number, measure: Measure): string {
  if (measure(text) <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(text.slice(0, mid).trimEnd() + ELLIPSIS) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? ELLIPSIS : text.slice(0, lo).trimEnd() + ELLIPSIS;
}

/**
 * Ajusta el texto a lineas de ancho maximo. Si excede maxLines, la ultima termina en elipsis.
 * Las palabras mas largas que una linea se cortan.
 */
export function wrapText(text: string, maxWidth: number, maxLines: number, measure: Measure): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';
  let overflow = false;

  const pushLine = (line: string): void => {
    if (lines.length < maxLines) lines.push(line);
    else overflow = true;
  };

  for (const rawWord of words) {
    let word = rawWord;
    // Palabra que no cabe sola: se parte en trozos.
    while (measure(word) > maxWidth && word.length > 1) {
      if (current) {
        pushLine(current);
        current = '';
      }
      let cut = word.length - 1;
      while (cut > 1 && measure(word.slice(0, cut)) > maxWidth) cut--;
      pushLine(word.slice(0, cut));
      word = word.slice(cut);
    }
    const candidate = current ? current + ' ' + word : word;
    if (measure(candidate) <= maxWidth) current = candidate;
    else {
      if (current) pushLine(current);
      current = word;
    }
    if (overflow) break;
  }
  if (current && !overflow) pushLine(current);

  if (overflow && lines.length > 0) {
    let last = lines[lines.length - 1]!.trimEnd();
    while (last.length > 0 && measure(last + ELLIPSIS) > maxWidth) last = last.slice(0, -1).trimEnd();
    lines[lines.length - 1] = last + ELLIPSIS;
  }
  return lines;
}

/**
 * Formas cada vez mas cortas de un nombre o rotulo, para cuando el espacio no alcanza:
 * "Agente Extra Numero 3" -> "Agente 3" -> "Agente N." ...; "Mateo Rivas" -> "Mateo R." -> "Mateo".
 * Conservar la ultima palabra (a menudo un numero o apellido) mantiene distinguibles a los agentes.
 */
export function labelVariants(text: string): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const out: string[] = [words.join(' ')];
  const add = (v: string) => {
    if (v && !out.includes(v)) out.push(v);
  };
  if (words.length > 2) add(`${words[0]} ${words[words.length - 1]}`);
  if (words.length > 1) {
    const last = words[words.length - 1]!;
    // Si la ultima palabra es corta (un numero, "HH."), se conserva entera.
    add(last.length <= 3 ? `${words[0]} ${last}` : `${words[0]} ${last[0]}.`);
    add(words[0]!);
  }
  return out;
}

/**
 * Elige la variante mas larga que cabe entera; si ninguna cabe, recorta la mas corta.
 * Devuelve tambien si hubo que recortar (para decidir si probar una fuente menor).
 */
export function fitLabel(text: string, maxWidth: number, measure: Measure): { label: string; truncated: boolean } {
  const variants = labelVariants(text);
  for (const v of variants) if (measure(v) <= maxWidth) return { label: v, truncated: false };
  return { label: truncate(variants[variants.length - 1] ?? text, maxWidth, measure), truncated: true };
}
