import type { SourceEntry } from './find-source.ts';

export const MENU_CLASS = 'ctc-menu';
const ACTIVE_CLASS = 'ctc-active';

let closeCurrent: (() => void) | null = null;

function label(element: Element): string {
  const id = element.id ? `#${element.id}` : '';
  const first = element.classList[0];
  const cls = first ? `.${first}` : '';
  return `<${element.tagName.toLowerCase()}${id}${cls}>`;
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function showMenu(
  entries: SourceEntry[],
  position: { x: number; y: number },
  onOpen: (entry: SourceEntry) => void,
): () => void {
  closeCurrent?.();

  const root = document.createElement('div');
  root.className = MENU_CLASS;
  root.setAttribute('role', 'menu');
  root.style.left = `${position.x}px`;
  root.style.top = `${position.y}px`;

  let active = 0;
  const items = entries.map((entry) => {
    const row = document.createElement('div');
    row.setAttribute('role', 'menuitem');
    const { path, line, column } = entry.location;
    const loc = document.createElement('span');
    loc.textContent = `${basename(path)}:${line}:${column}`;
    const tag = document.createElement('span');
    tag.className = 'ctc-tag';
    tag.textContent = label(entry.element);
    row.append(loc, ' ', tag);
    row.addEventListener('click', () => choose(entry));
    root.appendChild(row);
    return row;
  });

  function setActive(index: number) {
    active = (index + items.length) % items.length;
    items.forEach((row, i) => row.classList.toggle(ACTIVE_CLASS, i === active));
  }

  function choose(entry: SourceEntry) {
    close();
    onOpen(entry);
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') setActive(active + 1);
    else if (event.key === 'ArrowUp') setActive(active - 1);
    else if (event.key === 'Enter') choose(entries[active]!);
    else if (event.key === 'Escape') close();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  const onOutsideClick = (event: MouseEvent) => {
    if (!root.contains(event.target as Node)) close();
  };

  function close() {
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('click', onOutsideClick, true);
    root.remove();
    if (closeCurrent === close) closeCurrent = null;
  }

  setActive(0);
  document.body.appendChild(root);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('click', onOutsideClick, true);
  closeCurrent = close;
  return close;
}
