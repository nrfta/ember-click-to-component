import { parseSource } from './editors.ts';
import type { SourceLocation } from './editors.ts';

export const DEFAULT_ATTRIBUTE = 'data-ctc-source';

export interface SourceEntry {
  element: Element;
  location: SourceLocation;
}

function toElement(from: EventTarget | null): Element | null {
  if (!from) return null;
  const node = from as Node;
  if (typeof node.nodeType !== 'number') return null;
  if (node.nodeType === 1) return node as Element;
  return node.parentElement;
}

function readEntry(element: Element, attribute: string): SourceEntry | null {
  const value = element.getAttribute(attribute);
  if (value === null) return null;
  const location = parseSource(value);
  return location ? { element, location } : null;
}

export function findSource(
  from: EventTarget | null,
  attribute: string = DEFAULT_ATTRIBUTE,
): SourceEntry | null {
  let element = toElement(from);
  while (element) {
    const entry = readEntry(element, attribute);
    if (entry) return entry;
    element = element.parentElement;
  }
  return null;
}

export function collectChain(
  from: EventTarget | null,
  attribute: string = DEFAULT_ATTRIBUTE,
): SourceEntry[] {
  const chain: SourceEntry[] = [];
  let element = toElement(from);
  while (element) {
    const entry = readEntry(element, attribute);
    if (entry) {
      const prev = chain[chain.length - 1];
      const same =
        prev &&
        prev.location.path === entry.location.path &&
        prev.location.line === entry.location.line &&
        prev.location.column === entry.location.column;
      if (!same) chain.push(entry);
    }
    if (element.tagName === 'BODY') break;
    element = element.parentElement;
  }
  return chain;
}
