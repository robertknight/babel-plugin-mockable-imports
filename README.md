# babel-plugin-mockable-imports

A Babel plugin that modifies modules to enable mocking of their dependencies. The plugin was written with the following goals:

- Provide a simple interface for mocking ES module imports
- Should work in both Node and the Browser
- The amount of extra code added should be small, to minimize the impact on
  test execution time

## Usage

### Installation

Install the plugin:

```
npm install babel-plugin-mockable-imports
```

Then [configure Babel](https://babeljs.io/docs/en/config-files) to use it.
Typically this is done in a `.babelrc` file:

```json
{
  "plugins": [
    "mockable-imports"
  ]
}
```

You only want to enable this plugin when running your tests.

<!-- TODO: Note how to enable this plugin in tests only. !-->

### Basic usage in tests

Each module in your codebase that this plugin is applied to will now export an
`$imports` object with `$mock` and `$restore` methods. In your tests, import
the `$imports` object from the module under test, call `$mock` to replace
imports with stubs and `$restore` to cleanup after the test.

For example, given this `password.js` file that we want to test:

```js
import { randomBytes } from 'crypto-functions';

export function generatePassword() {
  return randomBytes(10).map(byte =>
    byte.toString(16).padStart(2, '0')
  ).join('')
}
```

We can write a test as follows, mocking the `randomBytes` import:

```js
import { generatePassword, $imports } from './password'

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
  './Header': { default: FakeHeader },
  './Footer': { default: FakeFooter },
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

### Selective mocking

Babel allows the set of plugins applied to files to be configured on a per directory basis. See [Babel configuration docs](https://babeljs.io/docs/en/options#overrides). You can also define [overrides](https://babeljs.io/docs/en/options#overrides) for more fine-grained rules.

## How it works

When the plugin processes a module, it gathers the set of imported symbols and uses them to initialize an `$imports` object. This `$imports` object has a corresponding property for each import, as `$mock` and `$restore` methods to temporarily modify those properties.


The plugin then finds all the original references to the imported properties and replaces them with lookups against the `$imports` object. For example:

```js
const someValue = dependencyA() + dependencyB()
```

Becomes:

```js
const someValue = $imports.dependencyA() + $imports.dependencyB()
```


## FAQ

### How is this plugin different to alternative techniques?

Add notes on comparisons with:

**proxyquire**
**babel-plugin-rewire**
**stubbing ES6 imports**
