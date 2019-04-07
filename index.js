'use strict';

const packageName = require('./package.json').name;
const helperImportPath = `${packageName}/lib/helpers`;

module.exports = ({types: t}) => {
  function commomJSRequireSource(node) {
    const args = node.arguments;
    if (
      node.callee.name === 'require' &&
      args.length === 1 &&
      t.isStringLiteral(args[0])
    ) {
      return args[0].value;
    } else {
      return null;
    }
  }

  return {
    visitor: {
      Program: {
        // Initialize state variables that get updated as imports and references
        // to those imports are found.
        enter(path, state) {
          // Map of local identifier for import => import info.
          state.importMeta = new Map();
          // The last `import` or top-level CommonJS require node that was
          // seen in the code.
          state.lastImport = null;
          // Keep track of whether modifying this file has been aborted.
          // TODO - It should be possible to make use of `path.stop()` and avoid
          // needing to do this. This currently results in processing of the
          // file by other plugins stopping though it seems. Perhaps need to
          // create an innert path and use that?
          state.aborted = false;
        },

        // Emit the code that generates the `$imports` object used by tests to
        // mock dependencies.
        exit(path, state) {
          if (state.aborted || state.importMeta.size === 0) {
            return;
          }

          // Generate `import { ImportMap } from 'babel-plugin-mock/helpers'`
          const helperImport = t.importDeclaration(
            [
              t.importSpecifier(
                t.identifier('ImportMap'),
                t.identifier('ImportMap'),
              ),
            ],
            t.stringLiteral(helperImportPath),
          );

          // Generate `export const $imports = new ImportMap(...)`
          const importMetaObjLiteral = t.objectExpression(
            [...state.importMeta.entries()].map(([localIdent, meta]) =>
              t.objectProperty(
                t.identifier(localIdent.name),
                t.arrayExpression([
                  t.stringLiteral(meta.source),
                  t.stringLiteral(meta.symbol),
                  meta.value,
                ]),
              ),
            ),
          );
          const $importsDecl = t.variableDeclaration('const', [
            t.variableDeclarator(
              t.identifier('$imports'),
              t.newExpression(t.identifier('ImportMap'), [
                importMetaObjLiteral,
              ]),
            ),
          ]);

          const exportImportsDecl = t.exportNamedDeclaration(null, [
            t.exportSpecifier(
              t.identifier('$imports'),
              t.identifier('$imports'),
            ),
          ]);

          // Insert `$imports` declaration below last import.
          const insertedNodes = state.lastImport.insertAfter(helperImport);
          insertedNodes[0].insertAfter($importsDecl);

          // Insert `export { $imports }` at the end of the file. The reason for
          // inserting here is that this gets converted to `exports.$imports =
          // $imports` if the file is later transpiled to CommonJS, and this
          // must come after any `module.exports = <value>` assignments.
          const body = path.get('body');
          body[body.length - 1].insertAfter(exportImportsDecl);
        },
      },

      CallExpression(path, state) {
        const node = path.node;
        const src = commomJSRequireSource(node);
        if (!src) {
          return;
        }

        // Ignore requires that are not part of the initializer of a
        // `var init = require("module")` statement.
        const varDecl = path.findParent(p => p.isVariableDeclarator());
        if (!varDecl) {
          return;
        }

        // If the `require` is wrapped in some way, we just ignore it, since
        // we cannot determine which symbols are being required without knowing
        // what the wrapping expression does.
        if (varDecl.node.init !== node) {
          return;
        }

        // Ignore non-top level require expressions.
        if (varDecl.parentPath.parent.type !== 'Program') {
          return;
        }

        state.lastImport = varDecl.findParent(p => p.isVariableDeclaration());

        // `var aModule = require("a-module")`
        const id = varDecl.node.id;
        if (id.type === 'Identifier') {
          state.importMeta.set(id, {
            symbol: '*',
            source: src,
            value: id,
          });
        } else if (id.type === 'ObjectPattern') {
          // `var { aSymbol: localName } = require("a-module")`
          for (let property of id.properties) {
            state.importMeta.set(property.value, {
              symbol: property.key.name,
              source: src,
              value: property.value,
            });
          }
        }
      },

      ImportDeclaration(path, state) {
        if (state.aborted) {
          return;
        }
        // Process import and add metadata to `state.importMeta` map.
        state.lastImport = path;
        path.node.specifiers.forEach(spec => {
          if (spec.local.name === '$imports') {
            // Abort processing the file if it declares an import called
            // `$imports`.
            state.aborted = true;
            return;
          }

          let imported;
          switch (spec.type) {
            case 'ImportDefaultSpecifier':
              // import Foo from './foo'
              imported = 'default';
              break;
            case 'ImportNamespaceSpecifier':
              // import * as foo from './foo'
              imported = '*';
              break;
            case 'ImportSpecifier':
              // import { foo } from './foo'
              imported = spec.imported.name;
              break;
            default:
              throw new Error('Unknown import specifier type: ' + spec.type);
          }

          state.importMeta.set(spec.local, {
            symbol: imported,
            source: path.node.source.value,
            value: spec.local,
          });
        });
      },

      ReferencedIdentifier(child, state) {
        if (state.aborted) {
          return;
        }

        const name = child.node.name;
        const binding = child.scope.getBinding(name, /* noGlobal */ true);
        if (!binding || !state.importMeta.has(binding.identifier)) {
          return;
        }

        // Ignore the reference in the generated `$imports` variable declaration.
        const newExprParent = child.findParent(p => p.isNewExpression());
        if (
          newExprParent &&
          t.isIdentifier(newExprParent.node.callee) &&
          newExprParent.node.callee.name === 'ImportMap'
        ) {
          return;
        }

        // Do not replace occurrences in `export { identifier }` expressions.
        // Ideally we *should* make these exports change to reflect mocking.
        // Bailing out here means that such code will at least compile.
        if (child.parent.type === 'ExportSpecifier') {
          return;
        }

        // Replace import reference with `$imports.symbol`.
        if (
          child.parent.type === 'JSXOpeningElement' ||
          child.parent.type === 'JSXClosingElement' ||
          child.parent.type === 'JSXMemberExpression'
        ) {
          child.replaceWith(
            t.jsxMemberExpression(
              t.jsxIdentifier('$imports'),
              t.jsxIdentifier(child.node.name),
            ),
          );
        } else {
          child.replaceWith(
            t.memberExpression(
              t.identifier('$imports'),
              t.identifier(child.node.name),
            ),
          );
        }
      },
    },
  };
};
('use strict');
