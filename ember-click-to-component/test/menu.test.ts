// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startClickToComponent } from '../src/index';
import { showMenu } from '../src/menu';

const ATTR = 'data-ctc-source';

let stop: (() => void) | undefined;

function contextMenu(target: Element, altKey = true): MouseEvent {
  const event = new MouseEvent('contextmenu', {
    altKey,
    bubbles: true,
    cancelable: true,
    clientX: 10,
    clientY: 20,
  });
  target.dispatchEvent(event);
  return event;
}

function key(name: string) {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: name, bubbles: true }),
  );
}

function menus() {
  return document.querySelectorAll('.ctc-menu');
}

function rows() {
  return Array.from(document.querySelectorAll('.ctc-menu [role="menuitem"]'));
}

function start() {
  const open = vi.fn();
  stop = startClickToComponent({ open });
  return open;
}

beforeEach(() => {
  document.body.innerHTML = `
    <div id="outer" ${ATTR}="/p/outer.gjs:3:1">
      <div id="card" class="card" ${ATTR}="/p/card.gjs:12:5">
        <span id="inner" ${ATTR}="/p/inner.gjs:7:9">hello</span>
      </div>
    </div>
    <div id="plain"><p id="plain-child">x</p></div>
  `;
});

afterEach(() => {
  stop?.();
  stop = undefined;
  document.body.innerHTML = '';
});

describe('Alt+Right-click menu', () => {
  it('renders one row per ancestor with location and label, and prevents default', () => {
    start();
    const event = contextMenu(document.getElementById('inner')!);
    expect(event.defaultPrevented).toBe(true);
    expect(menus()).toHaveLength(1);
    const texts = rows().map((r) => r.textContent);
    expect(texts).toHaveLength(3);
    expect(texts[0]).toContain('inner.gjs:7:9');
    expect(texts[0]).toContain('<span#inner>');
    expect(texts[1]).toContain('card.gjs:12:5');
    expect(texts[1]).toContain('<div#card.card>');
    expect(texts[2]).toContain('outer.gjs:3:1');
  });

  it('labels an element with only a class as <tag.class>', () => {
    const onOpen = vi.fn();
    const el = document.createElement('div');
    el.className = 'card extra';
    const close = showMenu(
      [{ element: el, location: { path: '/p/a.gjs', line: 1, column: 2 } }],
      { x: 0, y: 0 },
      onOpen,
    );
    expect(rows()[0]!.textContent).toContain('a.gjs:1:2');
    expect(rows()[0]!.textContent).toContain('<div.card>');
    close();
  });

  it('does nothing without Alt', () => {
    start();
    const event = contextMenu(document.getElementById('inner')!, false);
    expect(event.defaultPrevented).toBe(false);
    expect(menus()).toHaveLength(0);
  });

  it('does nothing when no ancestor is annotated', () => {
    start();
    const event = contextMenu(document.getElementById('plain-child')!);
    expect(event.defaultPrevented).toBe(false);
    expect(menus()).toHaveLength(0);
  });

  it('moves the active row with ArrowDown/ArrowUp, wrapping, and Enter opens it', () => {
    const open = start();
    contextMenu(document.getElementById('inner')!);
    const active = () =>
      rows().findIndex((r) => r.classList.contains('ctc-active'));
    expect(active()).toBe(0);
    key('ArrowDown');
    expect(active()).toBe(1);
    key('ArrowDown');
    key('ArrowDown');
    expect(active()).toBe(0);
    key('ArrowUp');
    expect(active()).toBe(2);
    key('Enter');
    expect(open).toHaveBeenCalledWith('vscode://file/p/outer.gjs:3:1');
    expect(menus()).toHaveLength(0);
  });

  it('Escape closes without opening', () => {
    const open = start();
    contextMenu(document.getElementById('inner')!);
    key('Escape');
    expect(menus()).toHaveLength(0);
    expect(open).not.toHaveBeenCalled();
  });

  it('clicking a row opens it and closes the menu', () => {
    const open = start();
    contextMenu(document.getElementById('inner')!);
    rows()[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(open).toHaveBeenCalledWith('vscode://file/p/card.gjs:12:5');
    expect(menus()).toHaveLength(0);
  });

  it('clicking outside closes the menu without opening', () => {
    const open = start();
    contextMenu(document.getElementById('inner')!);
    document
      .getElementById('plain')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(menus()).toHaveLength(0);
    expect(open).not.toHaveBeenCalled();
  });

  it('a second Alt+Right-click replaces the first menu', () => {
    start();
    contextMenu(document.getElementById('inner')!);
    contextMenu(document.getElementById('card')!);
    expect(menus()).toHaveLength(1);
    expect(rows()).toHaveLength(2);
  });

  it('menu root is not annotated', () => {
    start();
    contextMenu(document.getElementById('inner')!);
    expect(document.querySelector('.ctc-menu')!.hasAttribute(ATTR)).toBe(false);
  });

  it('teardown removes an open menu', () => {
    start();
    contextMenu(document.getElementById('inner')!);
    stop!();
    stop = undefined;
    expect(menus()).toHaveLength(0);
  });

  it('after close, keydown no longer calls onOpen', () => {
    const onOpen = vi.fn();
    const el = document.getElementById('card')!;
    const close = showMenu(
      [{ element: el, location: { path: '/p/a.gjs', line: 1, column: 1 } }],
      { x: 0, y: 0 },
      onOpen,
    );
    close();
    key('Enter');
    key('ArrowDown');
    expect(onOpen).not.toHaveBeenCalled();
    expect(menus()).toHaveLength(0);
  });

  it('shows only the file name of a Windows path', () => {
    const el = document.createElement('div');
    const close = showMenu(
      [
        {
          element: el,
          location: { path: 'C:\\proj\\a.gjs', line: 1, column: 2 },
        },
      ],
      { x: 0, y: 0 },
      vi.fn(),
    );
    expect(rows()[0]!.textContent).toMatch(/^a\.gjs:1:2 /);
    close();
  });

  describe('viewport', () => {
    const original = { width: window.innerWidth, height: window.innerHeight };

    afterEach(() => {
      vi.restoreAllMocks();
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: original.width,
      });
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: original.height,
      });
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    });

    it('clamps a menu opened near the bottom-right inside the viewport', () => {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 500,
      });
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: 400,
      });
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 200,
        bottom: 100,
        width: 200,
        height: 100,
        toJSON: () => ({}),
      } as DOMRect);
      const close = showMenu(
        [
          {
            element: document.getElementById('card')!,
            location: { path: '/p/a.gjs', line: 1, column: 1 },
          },
        ],
        { x: 480, y: 390 },
        vi.fn(),
      );
      const menu = document.querySelector<HTMLElement>('.ctc-menu')!;
      // 500 - 200 - 8 and 400 - 100 - 8
      expect(menu.style.left).toBe('292px');
      expect(menu.style.top).toBe('292px');
      close();
    });

    it('keeps an 8px margin when the menu is larger than the viewport', () => {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 100,
      });
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: 100,
      });
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 300,
        bottom: 300,
        width: 300,
        height: 300,
        toJSON: () => ({}),
      } as DOMRect);
      const close = showMenu(
        [
          {
            element: document.getElementById('card')!,
            location: { path: '/p/a.gjs', line: 1, column: 1 },
          },
        ],
        { x: 50, y: 50 },
        vi.fn(),
      );
      const menu = document.querySelector<HTMLElement>('.ctc-menu')!;
      expect(menu.style.left).toBe('8px');
      expect(menu.style.top).toBe('8px');
      close();
    });

    it('scrolls the active row into view on arrow navigation', () => {
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      start();
      contextMenu(document.getElementById('inner')!);
      scrollIntoView.mockClear();
      key('ArrowDown');
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.contexts[0]).toBe(rows()[1]);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
      key('ArrowUp');
      expect(scrollIntoView.mock.contexts[1]).toBe(rows()[0]);
    });
  });
});
