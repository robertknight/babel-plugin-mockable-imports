"use strict";

const { transform } = require("@babel/core");
const { assert } = require("chai");

function importsDecl(init) {
  return `
import { ImportMap } from "babel-plugin-mockable-imports/lib/helpers";
const $imports = new ImportMap(${init});
`.trim();
}

function trailer() {
  return "export { $imports };";
}

const fixtures = [
  {
    description: "named ES6 imports",
    code: `
import { ident } from 'a-module';
ident();
`,
    output: `
import { ident } from 'a-module';
${importsDecl(`{
  ident: ["a-module", "ident", ident]
}`)}
$imports.ident();
${trailer()}
`
  },
  {
    description: "default ES6 imports",
    code: `
import ident from 'a-module';
ident();
`,
    output: `
import ident from 'a-module';
${importsDecl(`{
  ident: ["a-module", "default", ident]
}`)}
$imports.ident();
${trailer()}
`
  },
  {
    description: "ES6 namespace imports",
    code: `
import * as aModule from 'a-module';
aModule.ident();
`,
    output: `
import * as aModule from 'a-module';
${importsDecl(`{
  aModule: ["a-module", "*", aModule]
}`)}
$imports.aModule.ident();
${trailer()}
`
  },
  {
    description: "side-effect only imports",
    code: `
import 'a-module';
`,
    output: `
import 'a-module';
`
  },
  {
    description: "modules with no imports",
    code: "var x = 42;",
    output: "var x = 42;"
  },
  {
    description: "React component imports",
    code: `
import Widget from './Widget';

function MyComponent() {
  return <Widget arg="value"/>;
}`,
    output: `
import Widget from './Widget';
${importsDecl(`{
  Widget: ["./Widget", "default", Widget]
}`)}

function MyComponent() {
  return <$imports.Widget arg="value" />;
}

${trailer()}
`
  },
  {
    description: "files that already declare `$imports`",
    code: `
import { $imports } from 'a-module';
`,
    output: `
import { $imports } from 'a-module';
`
  },
  {
    description: "re-exports of imported symbols",
    code: `
import { foo } from 'a-module';
export { foo }`,
    output: `
import { foo } from 'a-module';
${importsDecl(`{
  foo: ["a-module", "foo", foo]
}`)}
export { foo };
${trailer()}
`
  },
  {
    description: "JSX member exports",
    code: `
import * as widgets from './widgets';

function MyComponent() {
  return <widgets.Widget/>
}`,
    output: `
import * as widgets from './widgets';
${importsDecl(`{
  widgets: ["./widgets", "*", widgets]
}`)}

function MyComponent() {
  return <$imports.widgets.Widget />;
}

${trailer()}
`
  },
  {
    description: "CommonJS default or namespace imports",
    code: `
var foo = require('./foo');
foo();
`,
    output: `
var foo = require('./foo');

${importsDecl(`{
  foo: ["./foo", "*", foo]
}`)}
$imports.foo();
${trailer()}
`
  },
  {
    description: "CommonJS object pattern imports",
    code: `
var { foo } = require('./foo');
foo();
`,
    output: `
var {
  foo
} = require('./foo');

${importsDecl(`{
  foo: ["./foo", "foo", foo]
}`)}
$imports.foo();
${trailer()}
`
  },
  {
    description: "CommonJS object pattern imports with rename",
    code: `
var { bar: foo } = require('./foo');
foo();
`,
    output: `
var {
  bar: foo
} = require('./foo');

${importsDecl(`{
  foo: ["./foo", "bar", foo]
}`)}
$imports.foo();
${trailer()}
`
  },
  {
    description: "non top-level CommonJS imports",
    code: `
function test() {
  var foo = require('./foo');
}`,
    output: `
function test() {
  var foo = require('./foo');
}
`
  }
];

const pluginPath = require.resolve("../index");
const syntaxPlugins = ["@babel/plugin-syntax-jsx"];

const options = {
  plugins: [...syntaxPlugins, pluginPath]
};

function normalize(code) {
  return code.replace(/\n\n/gm, "\n").trim();
}

describe("plugin", () => {
  fixtures.forEach(({ description, code, output }) => {
    it(`generates expected code for ${description}`, () => {
      const { code: actualOutput } = transform(code, options);
      assert.equal(actualOutput.trim(), output.trim());
    });
  });

  it("ignores excluded modules in default exclude list", () => {
    const code = `
var proxyquire = require('proxyquire');
import proxyquire2 from 'proxyquire';
proxyquire(require);
proxyquire2(require);
`;
    const { code: output } = transform(code, options);
    assert.equal(normalize(code), normalize(output));
  });

  it("ignores excluded modules in user-provided exclude list", () => {
    const code = `
var ignoreMe = require('ignore-me');
ignoreMe();
`;
    const { code: output } = transform(code, {
      plugins: [
        ...syntaxPlugins,
        [
          pluginPath,
          {
            excludeImportsFromModules: ["ignore-me"]
          }
        ]
      ]
    });

    assert.equal(normalize(code), normalize(output));
  });

  describe("dir-based exclusion", () => {
    function doesTransformFile(filename, pluginOpts = {}) {
      const code = `
import * as foo from './foo';
var foo2 = require('foo');
foo();
foo2();`;
      const { code: output } = transform(code, {
        plugins: [[pluginPath, pluginOpts]],
        filename
      });
      return normalize(code) !== normalize(output);
    }

    it("does transform modules outside of test dirs", () => {
      assert.isTrue(doesTransformFile("/Users/john/project/index.js"));
    });

    it("does not transform modules in test dirs by default", () => {
      assert.isFalse(doesTransformFile("/Users/john/project/test/index.js"));
    });

    it("does not transform modules that match user-provided exclude list", () => {
      assert.isFalse(
        doesTransformFile("/Users/john/project/prueba/index.js", {
          excludeDirs: ["prueba"]
        })
      );
    });
  });
});
