import { assertEditor, buildEditorUrl } from './editors.ts';
import type { Editor } from './editors.ts';
import { DEFAULT_ATTRIBUTE, findSource } from './find-source.ts';

export type { Editor, SourceLocation } from './editors.ts';
export { collectChain, findSource } from './find-source.ts';
export type { SourceEntry } from './find-source.ts';

export interface ClickToComponentOptions {
  editor?: Editor;
  attribute?: string;
  open?: (url: string) => void;
}

const ROOT_CLASS = 'ctc-alt-active';
const HOVER_ATTR = 'data-ctc-hover';

const STYLESHEET = `[${HOVER_ATTR}]{outline:1px solid #e0457b!important;outline-offset:-1px}`;

export function startClickToComponent(
  options: ClickToComponentOptions = {},
): () => void {
  const editor: Editor = options.editor ?? 'vscode';
  assertEditor(editor);
  const attribute = options.attribute ?? DEFAULT_ATTRIBUTE;
  const open =
    options.open ??
    ((url: string) => {
      window.location.href = url;
    });

  const style = document.createElement('style');
  style.setAttribute('data-ctc', '');
  style.textContent = STYLESHEET;
  document.head.appendChild(style);

  let altHeld = false;
  let lastTarget: EventTarget | null = null;
  let hovered: Element | null = null;

  function clearHover() {
    hovered?.removeAttribute(HOVER_ATTR);
    hovered = null;
  }

  function updateHover() {
    const next = altHeld ? (findSource(lastTarget, attribute)?.element ?? null) : null;
    if (next === hovered) return;
    clearHover();
    if (next) {
      next.setAttribute(HOVER_ATTR, '');
      hovered = next;
    }
  }

  function setAlt(held: boolean) {
    altHeld = held;
    document.documentElement.classList.toggle(ROOT_CLASS, held);
    updateHover();
  }

  const onClick = (event: MouseEvent) => {
    if (!event.altKey) return;
    const entry = findSource(event.target, attribute);
    if (!entry) return;
    event.preventDefault();
    event.stopPropagation();
    open(buildEditorUrl(editor, entry.location));
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Alt') setAlt(true);
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Alt') setAlt(false);
  };
  const onMouseMove = (event: MouseEvent) => {
    lastTarget = event.target;
    if (event.altKey && !altHeld) setAlt(true);
    else updateHover();
  };
  const onBlur = () => setAlt(false);

  const listeners: Array<[EventTarget, string, EventListener, boolean]> = [
    [document, 'click', onClick as EventListener, true],
    [document, 'keydown', onKeyDown as EventListener, true],
    [document, 'keyup', onKeyUp as EventListener, true],
    [document, 'mousemove', onMouseMove as EventListener, true],
    [window, 'blur', onBlur, false],
  ];
  for (const [target, type, fn, capture] of listeners) {
    target.addEventListener(type, fn, capture);
  }

  return () => {
    for (const [target, type, fn, capture] of listeners) {
      target.removeEventListener(type, fn, capture);
    }
    style.remove();
    document.documentElement.classList.remove(ROOT_CLASS);
    clearHover();
  };
}
