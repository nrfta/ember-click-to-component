import { module, test } from 'qunit';
import { setupRenderingTest } from 'test-app/tests/helpers';
import { render, type RenderingTestContext } from '@ember/test-helpers';
import { precompileTemplate } from '@ember/template-compilation';

const SOURCE = /components\/hello(-gjs)?\.(hbs|gjs):\d+:\d+$/;

module('Integration | click-to-component template transform', function (hooks) {
  setupRenderingTest(hooks);

  test('annotates plain elements of .hbs and .gjs components with their source', async function (this: RenderingTestContext, assert) {
    // Loose mode: the resolver looks up app/components/hello{,-gjs}.
    await render(precompileTemplate('<Hello /><HelloGjs />'));

    const hbsDiv = this.element.querySelector('[data-test-hello]');
    const gjsDiv = this.element.querySelector('[data-test-hello-gjs]');
    const hbsSource = hbsDiv?.getAttribute('data-ctc-source') ?? '';
    const gjsSource = gjsDiv?.getAttribute('data-ctc-source') ?? '';

    assert.true(SOURCE.test(hbsSource), `hbs source: "${hbsSource}"`);
    assert.true(SOURCE.test(gjsSource), `gjs source: "${gjsSource}"`);

    // hello.hbs: the <div> is written on line 2, column 1.
    assert.true(
      hbsSource.endsWith('/components/hello.hbs:2:1'),
      `hbs line:col: "${hbsSource}"`,
    );
    // hello-gjs.gjs: the <div> is written on line 7, column 3 of the file
    // (not line 2 of the <template> block).
    assert.true(
      gjsSource.endsWith('/components/hello-gjs.gjs:7:3'),
      `gjs line:col: "${gjsSource}"`,
    );
  });
});
