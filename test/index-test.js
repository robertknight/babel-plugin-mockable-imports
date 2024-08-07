import { fileURLToPath } from "url";
import * as path from "path";

import { transform } from "@babel/core";
import { assert } from "chai";

function importHelper() {
  return `
import { ImportMap } from "babel-plugin-mockable-imports/lib/helpers";
const $imports = new ImportMap();
`.trim();
}

function importAdd(alias, source, symbol = alias, value = alias) {
  return `$imports.$add("${alias}", "${source}", "${symbol}", ${value});`;
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
${importHelper()}
${importAdd("ident", "a-module")}
$imports.ident();
${trailer()}
`,
  },
  {
    description: "default ES6 imports",
    code: `
import ident from 'a-module';
ident();
`,
    output: `
import ident from 'a-module';
${importHelper()}
${importAdd("ident", "a-module", "default")}
$imports.ident();
${trailer()}
`,
  },
  {
    description: "ES6 namespace imports",
    code: `
import * as aModule from 'a-module';
aModule.ident();
`,
    output: `
import * as aModule from 'a-module';
${importHelper()}
${importAdd("aModule", "a-module", "*")}
$imports.aModule.ident();
${trailer()}
`,
  },
  {
    description: "side-effect only imports",
    code: `
import 'a-module';
`,
    output: `
import 'a-module';
`,
  },
  {
    description: "modules with no imports",
    code: "var x = 42;",
    output: "var x = 42;",
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
${importHelper()}
${importAdd("Widget", "./Widget", "default")}
function MyComponent() {
  return <$imports.Widget arg="value" />;
}
${trailer()}
`,
  },
  {
    description: "files that already declare `$imports`",
    code: `
import { $imports } from 'a-module';
`,
    output: `
import { $imports } from 'a-module';
`,
  },
  {
    description: "re-exports of imported symbols",
    code: `
import { foo } from 'a-module';
export { foo }`,
    output: `
import { foo } from 'a-module';
${importHelper()}
${importAdd("foo", "a-module")}
export { foo };
${trailer()}
`,
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
${importHelper()}
${importAdd("widgets", "./widgets", "*")}
function MyComponent() {
  return <$imports.widgets.Widget />;
}
${trailer()}
`,
  },
  {
    description:
      "non-CommonJS import variable declaration (member expression init)",
    code: 'var foo = doSomething("bar")[0];',
    output: 'var foo = doSomething("bar")[0];',
  },
  {
    description:
      "non-CommonJS import variable declaration (call expression init)",
    code: 'var foo = doSomething("bar");',
    output: 'var foo = doSomething("bar");',
  },
  {
    description:
      "Reference to import where local alias has been renamed by another Babel plugin",
    code: `
import { render } from "preact";

var x = {
  render: function () {
    render();
  }
};
`,
    plugins: ["@babel/plugin-transform-function-name"],

    // Note that the imported `render` function is renamed to `_render` by the
    // @babel/plugin-transform-function-name plugin _after_ the `$imports.$add`
    // call is generated. The generated `$imports.<symbol>` reference needs to
    // refer to the original alias name (`render`) not the current name (`_render`)
    // at the point where the function is called.
    output: `
import { render as _render } from "preact";
${importHelper()}
$imports.$add("render", "preact", "render", _render);
var x = {
  render: function render() {
    $imports.render();
  }
};
${trailer()}
`,
  },
];

const pluginPath =
  path.dirname(fileURLToPath(import.meta.url)) + "/../index.js";
const syntaxPlugins = ["@babel/plugin-syntax-jsx"];

const options = {
  plugins: [...syntaxPlugins, pluginPath],
};

function normalize(code) {
  return code.replace(/\n\n/gm, "\n").trim();
}

function transformAsync(code, options) {
  return new Promise((resolve, reject) => {
    transform(code, options, (err, result) =>
      err ? reject(err) : resolve(result),
    );
  });
}

describe("plugin", () => {
  fixtures.forEach(({ description, code, output, plugins = [] }) => {
    it(`generates expected code for ${description}`, async () => {
      const options_ = { ...options };
      options_.plugins = [...options_.plugins, ...plugins];
      const { code: actualOutput } = await transformAsync(code, options_);
      assert.equal(actualOutput.trim(), output.trim());
    });
  });

  it("ignores imports from modules in default exclude list", async () => {
    const code = `
var proxyquire = require('proxyquire');
import proxyquire2 from 'proxyquire';
proxyquire(require);
proxyquire2(require);

var someHelper = require('\0rollupPluginBabelHelpers.js');
someHelper();
`;
    const { code: output } = await transformAsync(code, options);
    assert.equal(normalize(code), normalize(output));
  });

  it("ignores imports from modules in user-provided exclude list", async () => {
    const code = `
import ignoreMe from 'ignore-me';
const ignoreMe2 = require('ignore-me');
ignoreMe();
ignoreMe2();

import excludeMe from 'exclude-me';
const excludeMe2 = require('exclude-me');
excludeMe();
excludeMe2();
`;
    const { code: output } = await transformAsync(code, {
      plugins: [
        ...syntaxPlugins,
        [
          pluginPath,
          {
            excludeImportsFromModules: ["ignore-me", /^exclude/],
          },
        ],
      ],
    });

    assert.equal(normalize(code), normalize(output));
  });

  describe("dir-based exclusion", () => {
    async function doesTransformFile(filename, pluginOpts = {}) {
      const code = `
import * as foo from './foo';
var foo2 = require('foo');
foo();
foo2();`;
      const { code: output } = await transformAsync(code, {
        plugins: [[pluginPath, pluginOpts]],
        filename,
      });
      return normalize(code) !== normalize(output);
    }

    it("does transform modules outside of test dirs", async () => {
      assert.isTrue(await doesTransformFile("/Users/john/project/index.js"));
    });

    it("does not transform modules in test dirs by default", async () => {
      assert.isFalse(
        await doesTransformFile("/Users/john/project/test/index.js"),
      );
    });

    it("does not transform modules that match user-provided exclude list", async () => {
      assert.isFalse(
        await doesTransformFile("/Users/john/project/prueba/index.js", {
          excludeDirs: ["prueba"],
        }),
      );
    });
  });
});
