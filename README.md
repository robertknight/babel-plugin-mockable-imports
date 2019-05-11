# babel-plugin-mockable-imports

[![Build Status](https://travis-ci.org/robertknight/babel-plugin-mockable-imports.svg?branch=master)](https://travis-ci.org/robertknight/babel-plugin-mockable-imports)

A Babel plugin that modifies modules to enable mocking of their dependencies. The plugin was written with the following goals:

- Provide a simple interface for mocking ES and CommonJS (`require`) module imports
- Work when running tests in Node with any test runner or in the browser when
  using any bundler (Browserify, Webpack etc.) or no bunder at all
- Minimize the amount of extra code added to modules, since extra code
  impacts test execution time
- Catch common mistakes and warn about them

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

If the module you want to test uses CommonJS / Node style imports instead
(`var someModule = require("some-module")`, see the [section on
CommonJS](#commonjs-support).

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

### Limiting mocking to specific files

Babel allows the set of plugins applied to files to be configured on a per
directory basis. See the [Babel configuration
docs](https://babeljs.io/docs/en/options#overrides). You can also define
[overrides](https://babeljs.io/docs/en/options#overrides) for more fine-grained
rules.

As a convenience, the plugin by default skips any files in directories named
`test` or `__tests__` or their subdirectories. This can be configured using the
`excludeDirs` option.

### Options

The plugin supports the following options:

`excludeDirs`

An array of directory names (eg. "tests") whose modules are excluded from
this transformation by default.

`excludeImportsFromModules`

An array of module names which should be ignored when processing imports.
Any imports from these modules will not be mockable.
Default: `["proxyquire"]`.

### CommonJS support

The plugin has basic support for CommonJS. It will recognize the
following patterns as imports:

```js
var foo = require('./foo');
var { foo } = require('./foo');
var { foo: bar } = require('./foo');
```

Where `var` may also be `const` or `let`. If the `require` is wrapped or
contained within an expression it will not be processed.

When processing a CommonJS module the plugin still emits ES6 `import` and
`export` declarations, so transforming of ES6 `import`/`export` statements
to CommonJS must be enabled in Babel.

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

## Known issues and limitations

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

### `$imports` export conflicts

The plugin adds an export named `$imports` to every module it processes. This may cause conflicts if you try to combine exports from multiple modules using `export * from <module>`. [See issue](https://github.com/robertknight/babel-plugin-mockable-imports/issues/2). It can also cause problems if you have code which tries to loop over the exports of a module and does not gracefully handle unexpected exports.

We may in future add an alternative method of exposing the `$imports` object so that tests can get at it.
  
### Dynamic imports

There is currently no support for dynamic imports, either using `import()` to obtain a promise for a module, or calling `require` anywhere other than at the top level of a module.

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
