# babel-plugin-mockable-imports

A Babel plugin that transforms JavaScript modules to enable mocking of their dependencies in tests.

See the Usage section below for information on getting started, and the FAQ at
the end of the README for a comparison to alternative solutions.

## Features

- Provides a simple interface for mocking imports in tests
- Can be used with any test runner, any bundler, and whether tests are being run
  under Node or in the browser
- Transforms code in a straightforward way that is easy to debug if necessary
- Minimizes the amount of extra code added to modules, to reduce the impact
  on test execution time
- Detects incorrect usage (eg. mocking a module or import that is not used)
  and causes a test failure if this happens
- Can be used with both JavaScript and TypeScript

## Usage

### Installation

Install the plugin:

```
npm install babel-plugin-mockable-imports
```

Then [configure Babel](https://babeljs.io/docs/en/config-files) to use it.
Note that you only want to apply this plugin **for local development builds**
and ideally only when running tests. One way to do this that works in multiple
environments is to use the [`env`
option](https://babeljs.io/docs/en/options#env) in your `.babelrc` file.

For example, the following config in .babelrc will always load the plugin:

```json
{
  "plugins": ["mockable-imports"]
}
```

To load it only if the `NODE_ENV` environment variable is set to `development`
use:

```json
{
  "env": {
    "development": {
      "plugins": ["mockable-imports"]
    }
  }
}
```

By default the plugin will try to avoid processing test modules. See the
section on limiting mocking to [specific
files](#limiting-mocking-to-specific-files) for details.


### Basic usage in tests

Each module in your codebase that this plugin is applied to will now export an
`$imports` object with `$mock` and `$restore` methods. In your tests, import
the `$imports` object from the module under test, call `$mock` to replace
imports with stubs and `$restore` to cleanup after the test.

For example, given this `password.js` file that we want to test:

```js
import {randomBytes} from 'crypto-functions';

export function generatePassword() {
  return randomBytes(10)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}
```

We can write a test as follows, mocking the `randomBytes` import:

```js
import {generatePassword, $imports} from './password';

describe('generatePassword', () => {
  afterEach(() => {
    // Undo any mocks after each test run. This can be called even if no
    // mocking was done by a test.
    $imports.$restore();
  });

  it('generates expected password string', () => {
    const fakeRandomBytes = length => Array(length).fill(42);

    // Install mocks. The argument is a map of module paths (as used in the
    // module being tested) to replacement exports.
    $imports.$mock({
      'crypto-functions': {
        // Keys here are the names of the exports. Values are mocks.
        randomBytes: fakeRandomBytes,
      },
    });
    assert.equal(generatePassword(), '2a2a2a2a2a2a2a2a2a2a');
  });
});
```

See the [example project](examples/javascript) for a complete runnable project
using Mocha as a test runner.

### Mocking default exports

If a module being mocked has a default export (eg. `export default MyReactComponent`),
it can be mocked by setting the `default` key.

For example, given `./Header.js`:

```js
export default function Header() {
  ...
}
```

The `Header` function can be mocked in tests for a different module using:

```js
$imports.$mock({
  './Header': {default: FakeHeader},
  './Footer': {default: FakeFooter},
});
```

As a convenience, if the value for any of the keys in the object passed to
`$mock` is a function, it is assumed to be a default export for the module.
This means that assuming `FakeHeader` and `FakeFooter` are functions,
the following is equivalent to the above:

```js
$imports.$mock({
  './Header': FakeHeader,
  './Footer': FakeFooter,
});
```

### Mocking all imports that match a pattern

In some tests you may want to mock many dependencies in the same way, or ensure
that all imports meeting certain criteria in a module are mocked consistently.

You can pass a function to `$imports.$mock` which will be called with the
source, symbol name and original value of each import. The result of the
function will be used as the mock for that import if it is not `null`.

For example, to mock all functions imported by a module, you can use:

```js
$imports.$mock((source, symbol, value) => {
  if (typeof value === 'function') {
    // Mock functions using Sinon.
    return sinon.stub();
  } else {
    // Skip mocking objects, constants etc.
    return null;
  }
});
```

To ensure that a test mocks every imported function, you can use:

```js
// Throw an error if any unmocked function is called.
$imports.$mock((source, symbol, value) => {
  if (typeof value === 'function') {
    return () => throw new Error('Function not mocked');
  }
  return null;
});

// Setup mocks for expected imports.
$imports.$mock({
  './util': { doSomething: fakeDoSomething },
});
```

### Limiting mocking to specific files

Babel allows the set of plugins applied to files to be configured on a per
directory basis. See the [Babel configuration
docs](https://babeljs.io/docs/en/options#overrides). You can also define
[overrides](https://babeljs.io/docs/en/options#overrides) for more fine-grained
rules.

As a convenience, the plugin by default skips any files in directories named
`test` or `__tests__` or their subdirectories. This can be configured using the
`excludeDirs` option.


### Restoring specific mocks

Calling `$imports.$restore()` will undo/restore all active mocks for a module. It is
also possible to restore only specific mocks by passing an object which specifies
the modules and symbols to un-mock. The object is in the same format as the
argument to `$imports.$mock`, except the values are booleans indicating whether
to restore the mock.

```js
// Restore all mocks for imports from the './some-widget' module. Other mocks are
// left alone.
$imports.$restore({
  './some-widget': true
});

// Restore mocks for the "foo" symbol imported from the './utils' module. Other
// mocks are left alone.
$imports.$restore({
  './utils': {
    foo: true,
  }
});
```

### Options

The plugin supports the following options:

`excludeDirs`

An array of directory names (eg. "tests") whose modules are excluded from
this transformation by default.

`excludeImportsFromModules`

An array of module names which should be ignored when processing imports.
Any imports from these modules will not be mockable. Module names can be
specified as strings (to match exactly) or regular expressions.

By default this list includes imports from a few packages (eg. proxyquire,
@rollup/plugin-babel) which are known not to work well with this plugin.

## Usage with TypeScript

It is possible to use this plugin with TypeScript. In order to do that you need
to transform your TypeScript code using Babel when running tests, and also
use a helper function to get access to the `$imports` object for a module.
Since this object is not present in the original source, the TypeScript compiler
is not aware of its existence.

See the [typescript example project](examples/typescript) for a runnable example.

## How it works

When the plugin processes a module, it gathers the set of imported symbols and
uses them to initialize an `$imports` object, which is also exported from the
module. This object has a property corresponding to each import, in addition
to the `$mock` and `$restore` methods to temporarily modify those properties.

All references to imports are replaced with lookups of the corresponding
property of the `$imports` object. For example, this code:

```js
const someValue = dependencyA() + dependencyB();
```

Becomes:

```js
const someValue = $imports.dependencyA() + $imports.dependencyB();
```

When you call `$imports.$mock` in a test, the values of these properties are
temporarily changed to refer to the mocks instead. `$imports.$restore` resets
the properties to their original values.

## Common problems and errors

### Mocking code that runs when a module is imported

A downside of the approach used by this plugin is that you can't use it to change the result of code that is executed when the module is first imported. For example if a module has:

```js
import helper from './utils/helper';

export const aConstant = helper(someData);

export function usesHelper() {
  return helper(someOtherData);
}
```

It is possible to mock `helper` in `usesHelper` but not the initialization of `aConstant`. There are solutions to this, but they will involve changes to the code being tested:

1. Change the design of your code so that it exports a function which must be called, instead of executing side effects during the initial import. Making imports free of side effects can have other benefits, eg. for [tree-shaking](https://webpack.js.org/guides/tree-shaking/).
2. Add an indirection so that the code you want to test calls/uses the mock on-demand rather than during the initial evaluation.

### "Module not does import..." error when calling `$imports.$mock`

You may get this error when calling `$imports.$mock` if the module name or symbol
does not match one that has been registered as an import of the module.

Common reasons this can happen are:

- A misspelling in the file path or symbol name passed to `$mock`. Check that the
  path and symbol name match what is used in the module being tested.
- Your code is transformed before being processed by this plugin in a way that
  modifies the imports. This may happen, for example, if you are compiling code
  from another language into JavaScript before applying this plugin.

  The available symbols to mock can be found by inspecting `$imports.$meta`.
  This is an object that maps the name of the symbol in the file to the location
  that it comes from.

  _Note: $meta is not considered a public API of this plugin and its shape may
  change in minor or patch releases_.

### `$imports` export conflicts

The plugin adds an export named `$imports` to every module it processes. This may cause conflicts if you try to combine exports from multiple modules using `export * from <module>`. [See issue](https://github.com/robertknight/babel-plugin-mockable-imports/issues/2). It can also cause problems if you have code which tries to loop over the exports of a module and does not gracefully handle unexpected exports.

We may in future add an alternative method of exposing the `$imports` object so that tests can get at it.

### Dynamic imports

There is currently no support for dynamic imports using `import()`.

## Troubleshooting

If you encounter any problems using this plugin, please [file an
issue](https://github.com/robertknight/babel-plugin-mockable-imports/issues).

## FAQ

### How does this plugin differ from alternative approaches?

This plugin was created to work around [subtle problems and
inefficiencies](https://robertknight.me.uk/posts/browserify-dependency-mocking/)
that arose when using [proxyquire](https://github.com/thlorenz/proxyquire). In
particular proxyquire:

 - Evaluates the module under test and all its dependencies with an empty
   module cache each time it is invoked. In some respects this is a useful
   feature, but there is non-trivial overhead to doing this and
   it can also cause difficult-to-debug failures when a third-party module
   that maintains global state is evaluated multiple times, or objects from
   different copies of the module come into contact with one another.
 - Is tied to Node and Browserify
 - Works only with `require` calls, rather than handling `import` declarations
   "natively". This can cause issues such as Babel's transformation of `import`
   breaking proxyquireify's ability to recognize `proxyquire` calls.

Additionally because this plugin adds metadata to modules about their imports,
it can provide helpful warnings at runtime if a mock is provided which doesn't
match the imported symbols, eg. due to an unnecessary mock or a typo in the
module path or symbol name.

There is another Babel plugin,
[babel-plugin-rewire](https://github.com/speedskater/babel-plugin-rewire) which
aims to solve the same problem, but it generates a large amount of extra code
in each module which [can cause
problems](https://gitlab.com/gitlab-org/gitlab-ce/issues/52179) in large
production apps.

A technique which doesn't involve any plugins at all is to monkey-patch the
exports of a module that you want to mock during a test. The problem with this
is that _all_ modules which depend on that module will see the mocks, not just
the module you are testing. This can also cause surprising failures.

The [Jest test runner](https://jestjs.io/docs/en/mock-functions#mocking-modules)
has built-in support for mocking modules. If you are using that test runner,
you probably want to use its built-in facilities. This plugin works with any
project that uses Babel to transpile code, even if Babel is only used in
development.
