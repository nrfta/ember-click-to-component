import { defineConfig } from 'vite';
import { extensions, classicEmberSupport, ember } from '@embroider/vite';
import { babel } from '@rollup/plugin-babel';

export default defineConfig(({ mode }) => {
  // babel.config.mjs reads EMBER_ENV to decide whether to register the
  // click-to-component template transform. Vite does not set it (and
  // NODE_ENV is "production" for every `vite build`, even --mode development),
  // so derive it from Vite's mode unless the caller set it explicitly.
  process.env.EMBER_ENV ??=
    mode === 'production' ? 'production' : 'development';

  return {
    plugins: [
      classicEmberSupport(),
      ember(),
      // extra plugins here
      babel({
        babelHelpers: 'runtime',
        extensions,
      }),
    ],
  };
});
