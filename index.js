import * as pathModule from "path";

const helperImportPath = "babel-plugin-mockable-imports/lib/helpers";

/**
 * Default list of modules whose imports are excluded from processing.
 */
const EXCLUDE_LIST = [
  // Exclude imports added by this plugin.
  helperImportPath,

  // Proxyquirify and proxyquire-universal are two popular mocking libraries
  // which include Browserify plugins that look for references to their imports
  // in the code. You'd never want to mock these, and applying the transform
  // here breaks the plugin.
  "proxyquire",

  // Rollup plugins such as @rollup/plugin-babel use null-prefixed modules for
  // internal helpers.
  /\0/,
];

/**
 * Default list of directories that are excluded from the transforms applied
 * by this plugin.
 *
 * The default list includes common names of test directories, because there
 * is no point in making imports in test modules mockable.
 */
const EXCLUDED_DIRS = ["test", "__tests__"];

export default ({ types: t }) => {
  /**
   * Create an `$imports.$add(alias, source, symbol, value)` method call.
   */
  function createAddImportCall(alias, source, symbol, value) {
    return t.expressionStatement(
      t.callExpression(
        t.memberExpression(t.identifier("$imports"), t.identifier("$add")),
        [
          t.stringLiteral(alias),
          t.stringLiteral(source),
          t.stringLiteral(symbol),
          value,
        ],
      ),
    );
  }

  /**
   * Return true if imports from the module `source` should not be made
   * mockable.
   */
  function excludeImportsFrom(source, excludeList = EXCLUDE_LIST) {
    return excludeList.some(
      (pattern) =>
        (typeof pattern === "string" && pattern === source) ||
        (pattern instanceof RegExp && pattern.test(source)),
    );
  }

  /**
   * Return true if the current module should not be processed at all.
   */
  function excludeModule(state) {
    const filename = state.file.opts.filename;
    if (!filename) {
      // No filename was supplied when Babel was run, assume this file should
      // be processed.
      return false;
    }

    const excludeList = state.opts.excludeDirs || EXCLUDED_DIRS;
    const dirParts = pathModule.dirname(filename).split(pathModule.sep);
    return dirParts.some((part) => excludeList.includes(part));
  }

  return {
    visitor: {
      Program: {
        // Initialize state variables that get updated as imports and references
        // to those imports are found.
        enter(path, state) {
          // Map associating local identifiers which refer to an import to the
          // alias name which was registered with `$imports.$add`.
          //
          // Other Babel plugins may rename local identifiers which refer to
          // imports, so we need to keep track of what name the identifier had
          // at the point when the `$imports.$add` call was generated.
          //
          // When replacing a reference to such an identifier, this enables us
          // to generate the correct `$imports.<alias name>` reference.
          state.importIdentifiers = new Map();

          // Flag to keep track of whether further processing of this file has
          // stopped.
          state.aborted = excludeModule(state);

          // Set to `true` if a `module.exports = <expr>` expression was seen
          // in the module.
          state.hasCommonJSExportAssignment = false;
        },

        // Emit the code that generates the `$imports` object used by tests to
        // mock dependencies.
        exit(path, state) {
          if (state.aborted || state.importIdentifiers.size === 0) {
            return;
          }

          // Generate `import { ImportMap } from 'babel-plugin-mock/helpers'`
          const helperImport = t.importDeclaration(
            [
              t.importSpecifier(
                t.identifier("ImportMap"),
                t.identifier("ImportMap"),
              ),
            ],
            t.stringLiteral(helperImportPath),
          );

          const $importsDecl = t.variableDeclaration("const", [
            t.variableDeclarator(
              t.identifier("$imports"),
              t.newExpression(t.identifier("ImportMap"), []),
            ),
          ]);

          const exportImportsDecl = t.exportNamedDeclaration(null, [
            t.exportSpecifier(
              t.identifier("$imports"),
              t.identifier("$imports"),
            ),
          ]);

          const body = path.get("body");

          // Insert `$imports` declaration below last import.
          const insertedNodes = body[0].insertAfter(helperImport);
          const [varPath] = insertedNodes[0].insertAfter($importsDecl);
          path.scope.registerDeclaration(varPath);

          // Insert `export { $imports }` at the end of the file. The reason for
          // inserting here is that this gets converted to `exports.$imports =
          // $imports` if the file is later transpiled to CommonJS, and this
          // must come after any `module.exports = <value>` assignments.
          body[body.length - 1].insertAfter(exportImportsDecl);
        },
      },

      // Register ES6 imports.
      ImportDeclaration(path, state) {
        if (state.aborted) {
          return;
        }
        // Process import and add metadata to `state.importIdentifiers` map.
        path.node.specifiers.forEach((spec) => {
          if (spec.local.name === "$imports") {
            // Abort processing the file if it declares an import called
            // `$imports`.
            state.aborted = true;
            return;
          }

          let imported;
          switch (spec.type) {
            case "ImportDefaultSpecifier":
              // import Foo from './foo'
              imported = "default";
              break;
            case "ImportNamespaceSpecifier":
              // import * as foo from './foo'
              imported = "*";
              break;
            case "ImportSpecifier":
              // import { foo } from './foo'
              imported = spec.imported.name;
              break;
            default:
              throw new Error("Unknown import specifier type: " + spec.type);
          }

          const source = path.node.source.value;
          if (
            excludeImportsFrom(source, state.opts.excludeImportsFromModules)
          ) {
            return;
          }

          state.importIdentifiers.set(spec.local, spec.local.name);
          path.insertAfter(
            createAddImportCall(spec.local.name, source, imported, spec.local),
          );
        });
      },

      // Replace references to identifiers with `$imports.<identifier>`
      // expressions which resolve either to the original import or the active
      // mocks.
      ReferencedIdentifier(child, state) {
        if (state.aborted) {
          return;
        }

        // Check if this a reference to an import.
        const name = child.node.name;
        const binding = child.scope.getBinding(name, /* noGlobal */ true);
        if (!binding || !state.importIdentifiers.has(binding.identifier)) {
          return;
        }

        // Ignore the reference in generated `$imports.$add` calls.
        const callExprParent = child.findParent((p) => p.isCallExpression());
        const callee = callExprParent && callExprParent.node.callee;
        if (
          callee &&
          t.isMemberExpression(callee) &&
          t.isIdentifier(callee.object) &&
          callee.object.name === "$imports" &&
          callee.property.name === "$add"
        ) {
          return;
        }

        // Do not replace occurrences in `export { identifier }` expressions.
        // Ideally we *should* make these exports change to reflect mocking.
        // Bailing out here means that such code will at least compile.
        if (child.parent.type === "ExportSpecifier") {
          return;
        }

        // Replace import reference with `$imports.<alias>`. Note that it is
        // important to use the same alias that was registered with `$imports.$add`,
        // even if the identifier was subsequently renamed by other Babel plugins.
        const alias = state.importIdentifiers.get(binding.identifier);
        if (
          child.parent.type === "JSXOpeningElement" ||
          child.parent.type === "JSXClosingElement" ||
          child.parent.type === "JSXMemberExpression"
        ) {
          child.replaceWith(
            t.jsxMemberExpression(
              t.jsxIdentifier("$imports"),
              t.jsxIdentifier(alias),
            ),
          );
        } else {
          child.replaceWith(
            t.memberExpression(t.identifier("$imports"), t.identifier(alias)),
          );
        }
      },
    },
  };
};
