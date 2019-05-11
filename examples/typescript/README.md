# TypeScript example

This example shows how to use babel-plugin-mockable-imports in a project that
uses TypeScript, together with Mocha for running tests.

## Running the example

```
npm install
npm test
```

## How it works

There are two steps to using TypeScript with this plugin:

1. Use Babel to transform code when running tests, instead of just the TypeScript
   compiler.
2. Use a helper to get access to the `$imports` object for a module being
   tested in order to mock dependencies. You can't import this directly from
   a module because the TypeScript compiler is unaware of its existence.

This is implemented as follows:

 - The `test/init.js` file sets up processing of the TypeScript source files
   before the tests are run.

   It loads @babel/register and configures it to process TypeScript (.ts)
   files, applying the mockable-imports Babel plugin together with any other
   configured plugins.

 - Babel configuration in `.babelrc` enables Babel to understand TypeScript
   source files using the @babel/preset-typescript preset

 - A small helper module `test/mock.ts` provides a `getImports` helper to get
   access to the `$imports` object for a module in order to mock dependencies.

   Tests first import all of the exports of a module via `import * as module from '<module>'`
   and then initialize the `$imports` object using `$imports = getImports(module)`.
