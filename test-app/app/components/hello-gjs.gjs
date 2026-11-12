// Template-tag fixture for the click-to-component integration test.
// tests/integration/click-to-component-test.ts pins the line of the <div>.

const name = 'gjs';

<template>
  <div class="hello-gjs" data-test-hello-gjs>Hello from {{name}}</div>
</template>
