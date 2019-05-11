# JavaScript example

This example shows how to use babel-plugin-mockable-imports in a project that
uses Mocha for running tests.

## Running the example

```
npm install
npm test
```

## How it works

The `test/init.js` file sets up processing of the JavaScript source files
before the tests are run. It loads @babel/register to enable processing of JS
files using Babel, with the mockable-imports plugin enabled.

Tests import the `$imports` object from the module under test and use it to
mock dependencies.
