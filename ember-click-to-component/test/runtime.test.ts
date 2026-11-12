// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectChain, findSource } from '../src/find-source';
import { startClickToComponent } from '../src/index';

const ATTR = 'data-ctc-source';

let stop: (() => void) | undefined;

function altClick(target: Element): MouseEvent {
  const event = new MouseEvent('click', {
    altKey: true,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

function start(options: Parameters<typeof startClickToComponent>[0] = {}) {
  const open = vi.fn();
  stop = startClickToComponent({ open, ...options });
  return open;
}

beforeEach(() => {
  document.body.innerHTML = `
    <div id="outer" ${ATTR}="/p/a.gjs:12:5">
      <span id="inner">hello</span>
      <button id="same" ${ATTR}="/p/a.gjs:12:5">same</button>
    </div>
    <div id="plain"><p id="plain-child">x</p></div>
  `;
});

afterEach(() => {
  stop?.();
  stop = undefined;
  document.body.innerHTML = '';
});

describe('Alt+Click', () => {
  it('opens the annotated element and swallows the click', () => {
    const open = start();
    const outer = document.getElementById('outer')!;
    const appListener = vi.fn();
    outer.addEventListener('click', appListener);
    const event = altClick(outer);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('vscode://file/p/a.gjs:12:5');
    expect(event.defaultPrevented).toBe(true);
    expect(appListener).not.toHaveBeenCalled();
  });

  it('supports cursor and vscode-insiders', () => {
    let open = start({ editor: 'cursor' });
    altClick(document.getElementById('outer')!);
    expect(open).toHaveBeenCalledWith('cursor://file/p/a.gjs:12:5');
    stop!();
    open = start({ editor: 'vscode-insiders' });
    altClick(document.getElementById('outer')!);
    expect(open).toHaveBeenCalledWith('vscode-insiders://file/p/a.gjs:12:5');
  });

  it('ignores a click without Alt', () => {
    const open = start();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.getElementById('outer')!.dispatchEvent(event);
    expect(open).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('does nothing without an annotated ancestor', () => {
    const open = start();
    const event = altClick(document.getElementById('plain-child')!);
    expect(open).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('opens the ancestor location for a child click', () => {
    const open = start();
    altClick(document.getElementById('inner')!);
    expect(open).toHaveBeenCalledWith('vscode://file/p/a.gjs:12:5');
  });

  it('uses a custom attribute', () => {
    document.body.innerHTML = `<i id="c" data-custom="/q/b.gjs:1:2">x</i>`;
    const open = start({ attribute: 'data-custom' });
    altClick(document.getElementById('c')!);
    expect(open).toHaveBeenCalledWith('vscode://file/q/b.gjs:1:2');
  });

  it('throws on an unknown editor', () => {
    expect(() => startClickToComponent({ editor: 'emacs' as any })).toThrow();
  });
});

describe('findSource', () => {
  it('does not throw for null, document or text nodes', () => {
    expect(findSource(null)).toBeNull();
    expect(findSource(document)).toBeNull();
    const text = document.getElementById('inner')!.firstChild!;
    expect(text.nodeType).toBe(3);
    expect(findSource(text)).toEqual({
      element: document.getElementById('outer'),
      location: { path: '/p/a.gjs', line: 12, column: 5 },
    });
  });
});

describe('collectChain', () => {
  it('merges consecutive identical locations', () => {
    document.body.innerHTML = `
      <div id="a" ${ATTR}="/p/a.gjs:1:1">
        <div id="b" ${ATTR}="/p/a.gjs:1:1">
          <div id="c" ${ATTR}="/p/b.gjs:2:2"><span id="t">x</span></div>
        </div>
      </div>`;
    const chain = collectChain(document.getElementById('t'));
    expect(chain.map((e) => e.location.path)).toEqual(['/p/b.gjs', '/p/a.gjs']);
    expect(chain).toHaveLength(2);
  });

  it('returns [] for null', () => {
    expect(collectChain(null)).toEqual([]);
  });
});

describe('Alt highlight', () => {
  const keydown = () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true }));
  const keyup = () =>
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt' }));
  const move = (el: Element) =>
    el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, altKey: true }));

  it('toggles ctc-alt-active on keydown/keyup', () => {
    start();
    keydown();
    expect(document.documentElement.classList.contains('ctc-alt-active')).toBe(true);
    keyup();
    expect(document.documentElement.classList.contains('ctc-alt-active')).toBe(false);
  });

  it('window blur clears the class and hover marker', () => {
    start();
    keydown();
    move(document.getElementById('inner')!);
    expect(document.querySelector('[data-ctc-hover]')).not.toBeNull();
    window.dispatchEvent(new Event('blur'));
    expect(document.documentElement.classList.contains('ctc-alt-active')).toBe(false);
    expect(document.querySelector('[data-ctc-hover]')).toBeNull();
  });

  it('marks only the single element that would open', () => {
    start();
    keydown();
    move(document.getElementById('inner')!);
    const marked = document.querySelectorAll('[data-ctc-hover]');
    expect(marked).toHaveLength(1);
    expect(marked[0]).toBe(document.getElementById('outer'));
  });
});

describe('teardown', () => {
  it('removes listeners, style, class and hover marker', () => {
    const open = start();
    expect(document.querySelectorAll('style[data-ctc]')).toHaveLength(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true }));
    document
      .getElementById('inner')!
      .dispatchEvent(new MouseEvent('mousemove', { bubbles: true, altKey: true }));
    stop!();
    stop = undefined;
    expect(document.querySelector('style[data-ctc]')).toBeNull();
    expect(document.documentElement.classList.contains('ctc-alt-active')).toBe(false);
    expect(document.querySelector('[data-ctc-hover]')).toBeNull();
    const event = altClick(document.getElementById('outer')!);
    expect(open).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
