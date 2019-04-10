'use strict';

const pathModule = require('path');

const packageName = require('./package.json').name;
const helperImportPath = `${packageName}/lib/helpers`;

const EXCLUDE_LIST = [
  // Proxyquirify and proxyquire-universal are two popular mocking libraries
  // which include Browserify plugins that look for references to their imports
  // in the code. You'd never want to mock these, and applying the transform
  // here breaks the plugin.
  'proxyquire',
];

const EXCLUDED_DIRS = ['test', '__tests__'];

module.exports = ({types: t}) => {
  /**
   * Return the required module from a CallExpression, if it is a `require(...)`
   * call.
   */
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

  /**
   * Create an `$imports.$add(alias, source, symbol, value)` method call.
   */
  function createAddImportCall(alias, source, symbol, value) {
    return t.callExpression(
      t.memberExpression(t.identifier('$imports'), t.identifier('$add')),
      [
        t.stringLiteral(alias),
        t.stringLiteral(source),
        t.stringLiteral(symbol),
        value,
      ],
    );
  }

  /**
   * Return true if imports from the module `source` should not be made
   * mockable.
   */
  function excludeImportsFromModule(source, state) {
    const excludeList = state.opts.excludeImportsFromModules || EXCLUDE_LIST;
    return source === helperImportPath || excludeList.includes(source);
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
    return dirParts.some(part => excludeList.includes(part));
  }

  function isCommonJSExportAssignment(path) {
    const assignExpr = path.node;
    if (t.isMemberExpression(assignExpr.left)) {
      const target = assignExpr.left;
      if (t.isIdentifier(target.object) && t.isIdentifier(target.property)) {
        return (
          target.object.name === 'module' && target.property.name === 'exports'
        );
      }
    }
    return false;
  }

  function lastExprInSequence(node) {
    if (t.isSequenceExpression(node)) {
      return node.expressions[node.expressions.length - 1];
    } else {
      return node;
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
          state.aborted = excludeModule(state);

          // Set to `true` if a `module.exports = <expr>` expression was seen
          // in the module.
          state.hasCommonJSExportAssignment = false;
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

          const $importsDecl = t.variableDeclaration('const', [
            t.variableDeclarator(
              t.identifier('$imports'),
              t.newExpression(t.identifier('ImportMap'), []),
            ),
          ]);

          const exportImportsDecl = t.exportNamedDeclaration(null, [
            t.exportSpecifier(
              t.identifier('$imports'),
              t.identifier('$imports'),
            ),
          ]);

          const body = path.get('body');

          // Insert `$imports` declaration below last import.
          const insertedNodes = body[0].insertAfter(helperImport);
          insertedNodes[0].insertAfter($importsDecl);

          // Insert `export { $imports }` at the end of the file. The reason for
          // inserting here is that this gets converted to `exports.$imports =
          // $imports` if the file is later transpiled to CommonJS, and this
          // must come after any `module.exports = <value>` assignments.
          body[body.length - 1].insertAfter(exportImportsDecl);

          // If the module contains a `module.exports = <foo>` expression then
          // add `module.exports.$imports = <foo>` at the end of the file.
          if (state.hasCommonJSExportAssignment) {
            const moduleExportsExpr = t.memberExpression(
              t.memberExpression(
                t.identifier('module'),
                t.identifier('exports'),
              ),
              t.identifier('$imports'),
            );
            const cjsExport = t.expressionStatement(
              t.assignmentExpression(
                '=',
                moduleExportsExpr,
                t.identifier('$imports'),
              ),
            );
            body[body.length - 1].insertAfter(cjsExport);
          }
        },
      },

      AssignmentExpression(path, state) {
        if (!isCommonJSExportAssignment(path)) {
          return;
        }
        state.hasCommonJSExportAssignment = true;
      },

      CallExpression(path, state) {
        if (state.aborted) {
          return;
        }

        const node = path.node;
        const source = commomJSRequireSource(node);
        if (!source) {
          return;
        }

        if (excludeImportsFromModule(source, state)) {
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
        //
        // An exception is made where the `require` statement is wrapped in
        // a sequence (`var foo = (..., require('blah'))`) as some code coverage
        // transforms do. We know in this case that the result will be the
        // result of the require.
        if (lastExprInSequence(varDecl.node.init) !== node) {
          return;
        }

        // Ignore non-top level require expressions.
        if (varDecl.parentPath.parent.type !== 'Program') {
          return;
        }

        // TODO - Code such as `var { foo } = require("bar")` may get
        // transformed to `var _bar = require("bar"), foo = _bar.foo`.
        //
        // In this case we need to ensure that `foo` is registered as an import
        // and references to it later in the file are replaced with `$imports.foo`.

        const varDeclStatement = varDecl.findParent(p =>
          p.isVariableDeclaration(),
        );
        state.lastImport = varDeclStatement;

        // `var aModule = require("a-module")`
        const id = varDecl.node.id;
        if (id.type === 'Identifier') {
          const symbol = '<CJS>';
          state.importMeta.set(id, {
            symbol,
            source,
            value: id,
          });
          varDeclStatement.insertAfter(
            createAddImportCall(id.name, source, symbol, id),
          );
        } else if (id.type === 'ObjectPattern') {
          // `var { aSymbol: localName } = require("a-module")`
          for (let property of id.properties) {
            if (!t.isIdentifier(property.value)) {
              // Ignore destructuring more complex than a rename.
              continue;
            }
            const symbol = property.key.name;
            const value = property.value;
            state.importMeta.set(property.value, {symbol, source, value});
            varDeclStatement.insertAfter(
              createAddImportCall(property.value.name, source, symbol, value),
            );
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

          const source = path.node.source.value;
          if (excludeImportsFromModule(source, state)) {
            return;
          }

          state.importMeta.set(spec.local, {
            symbol: imported,
            source,
            value: spec.local,
          });

          path.insertAfter(
            createAddImportCall(spec.local.name, source, imported, spec.local),
          );
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

        // Ignore the reference in generated `$imports.$add` calls.
        const callExprParent = child.findParent(p => p.isCallExpression());
        const callee = callExprParent && callExprParent.node.callee;
        if (
          callee &&
          t.isMemberExpression(callee) &&
          t.isIdentifier(callee.object) &&
          callee.object.name === '$imports' &&
          callee.property.name === '$add') {
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
