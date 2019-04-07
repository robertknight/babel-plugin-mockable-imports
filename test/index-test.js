"use strict";

const { transform } = require("@babel/core");
const { assert } = require("chai");

function importsDecl(init) {
  return `
import { ImportMap } from "babel-plugin-mockable-imports/lib/helpers";
export const $imports = new ImportMap(${init});
`.trim();
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
  }
];

describe("plugin", () => {
  fixtures.forEach(({ description, code, output }) => {
    it(`generates expected code for ${description}`, () => {
      const options = {
        plugins: ["@babel/plugin-syntax-jsx", require.resolve("../index")]
      };
      const { code: actualOutput } = transform(code, options);
      assert.equal(actualOutput.trim(), output.trim());
    });
  });
});
