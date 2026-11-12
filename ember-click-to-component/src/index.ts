import { assertEditor, buildEditorUrl } from './editors.ts';
import type { Editor } from './editors.ts';
import { DEFAULT_ATTRIBUTE, collectChain, findSource } from './find-source.ts';
import { MENU_CLASS, showMenu } from './menu.ts';

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

const STYLESHEET = [
  `[${HOVER_ATTR}]{outline:1px solid #e0457b!important;outline-offset:-1px}`,
  `.${MENU_CLASS}{position:fixed;z-index:2147483647;min-width:200px;padding:4px;background:#fff;color:#222;border:1px solid #ccc;border-radius:6px;max-height:calc(100vh - 16px);overflow:auto;box-shadow:0 4px 16px rgba(0,0,0,.2);font:12px/1.4 system-ui,sans-serif}`,
  `.${MENU_CLASS} [role=menuitem]{padding:4px 8px;border-radius:4px;cursor:pointer;white-space:nowrap}`,
  `.${MENU_CLASS} .ctc-active{background:#e0457b;color:#fff}`,
  `.${MENU_CLASS} .ctc-tag{opacity:.7;margin-left:6px}`,
].join('');

// The running instance's teardown, so a second start replaces the first.
let currentTeardown: (() => void) | null = null;

export function startClickToComponent(
  options: ClickToComponentOptions = {},
): () => void {
  const editor: Editor = options.editor ?? 'vscode';
  assertEditor(editor);
  currentTeardown?.();
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
    const next = altHeld
      ? (findSource(lastTarget, attribute)?.element ?? null)
      : null;
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
  let closeMenu: (() => void) | null = null;
  const onContextMenu = (event: MouseEvent) => {
    if (!event.altKey) return;
    const entries = collectChain(event.target, attribute);
    if (entries.length === 0) return;
    event.preventDefault();
    closeMenu = showMenu(
      entries,
      { x: event.clientX, y: event.clientY },
      (entry) => open(buildEditorUrl(editor, entry.location)),
    );
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
    [document, 'contextmenu', onContextMenu as EventListener, true],
    [document, 'keydown', onKeyDown as EventListener, true],
    [document, 'keyup', onKeyUp as EventListener, true],
    [document, 'mousemove', onMouseMove as EventListener, true],
    [window, 'blur', onBlur, false],
  ];
  for (const [target, type, fn, capture] of listeners) {
    target.addEventListener(type, fn, capture);
  }

  let stopped = false;
  const teardown = () => {
    if (stopped) return;
    stopped = true;
    if (currentTeardown === teardown) currentTeardown = null;
    for (const [target, type, fn, capture] of listeners) {
      target.removeEventListener(type, fn, capture);
    }
    closeMenu?.();
    style.remove();
    document.documentElement.classList.remove(ROOT_CLASS);
    clearHover();
  };
  currentTeardown = teardown;
  return teardown;
}
