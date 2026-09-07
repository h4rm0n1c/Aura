const POST_REFERENCE = /^>>([1-9][0-9]{0,8})/;
const FENCE = /^\s*```[A-Za-z0-9_+-]{0,32}\s*$/;
const FENCE_END = /^\s*```\s*$/;

/**
 * Extract distinct thread-local >>N references from Aura Markdown source.
 *
 * References inside fenced code blocks, inline code spans, escaped text, and
 * Markdown links are deliberately ignored so persisted relationships match the
 * web renderer's notion of an actual post reference.
 */
export function extractPostReferenceSequences(source: string): readonly number[] {
  const references = new Set<number>();
  const lines = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  let inFence = false;

  for (const line of lines) {
    if (inFence) {
      if (FENCE_END.test(line)) inFence = false;
      continue;
    }
    if (FENCE.test(line)) {
      inFence = true;
      continue;
    }
    scanInlineReferences(line, references);
  }

  return Object.freeze([...references].sort((a, b) => a - b));
}

function scanInlineReferences(source: string, references: Set<number>): void {
  let index = 0;
  while (index < source.length) {
    if (source[index] === "\\" && index + 1 < source.length) {
      index += 2;
      continue;
    }

    if (source[index] === "`") {
      const end = source.indexOf("`", index + 1);
      if (end !== -1) {
        index = end + 1;
        continue;
      }
    }

    if (source[index] === "[") {
      const labelEnd = source.indexOf("]", index + 1);
      if (labelEnd !== -1 && source[labelEnd + 1] === "(") {
        const urlEnd = source.indexOf(")", labelEnd + 2);
        if (urlEnd !== -1) {
          index = urlEnd + 1;
          continue;
        }
      }
    }

    if (source.startsWith(">>", index)) {
      const match = source.slice(index).match(POST_REFERENCE);
      if (match !== null) {
        references.add(Number(match[1]));
        index += match[0].length;
        continue;
      }
    }

    index += 1;
  }
}
