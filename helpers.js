class MockingError extends Error {
  constructor(msg) {
    super(msg);
  }
}

/**
 * Object exposed by modules that have been processed by this plugin.
 *
 * The processed modules create an instance of `ImportMap` and register
 * mockable imports using `$add`. Test modules import the `ImportMap` from
 * the module under test and call `$mock` and `$restore` methods to mock
 * dependencies.
 */
class ImportMap {
  constructor(imports = {}) {
    /**
     * A mapping of import local name (or alias) to metadata about where
     * the import came from.
     */
    this.$meta = imports;
    this.$restore();
  }

  /**
   * Register an import.
   *
   * The `value` of the import will become available as a property named
   * `alias` on this instance.
   */
  $add(alias, source, symbol, value) {
    if (isSpecialMethod(alias)) {
      return;
    }
    this.$meta[alias] = [source, symbol, value];
    this[alias] = value;
  }

  /**
   * Replace true imports with mocks.
   *
   * If mocks are already active when this is called, the mocks in `imports`
   * are merged with the active mocks.
   *
   * @param {Object|Function} imports -
   *   An object whose keys are file paths (as used by the module being
   *   tested, *not* the test module) and values are objects mapping export
   *   names to mock values. As a convenience, the value can also be a
   *   function in which case it is treated as a mock for the module's
   *   default export.
   *
   *   Alternatively this can be a function which accepts
   *   (source, symbol, value) arguments and returns either a mock for
   *   that import or `null`/`undefined` to avoid mocking that import.
   *   This second form is useful for mocking many imports at once.
   */
  $mock(imports) {
    if (typeof imports === "function") {
      const mocks = {};
      Object.keys(this.$meta).forEach(alias => {
        const [source, symbol, value] = this.$meta[alias];
        const mock = imports(source, symbol, value);
        if (mock != null) {
          mocks[source] = mocks[source] || {};
          mocks[source][symbol] = mock;
        }
      });
      this.$mock(mocks);

      return;
    }

    Object.keys(imports).forEach(source => {
      const sourceImports = imports[source];
      let esImports = sourceImports;
      if (typeof esImports === "function") {
        esImports = { default: esImports };
      }

      // Handle namespace ES imports (`import * as foo from "foo"`).
      const namespaceAliases = Object.keys(this.$meta).filter(alias => {
        const [source_, symbol_] = this.$meta[alias];
        return source_ === source && symbol_ === "*";
      });
      namespaceAliases.forEach(alias => {
        this[alias] = esImports;
      });

      // Handle CJS imports (`var foo = require("bar")`).
      const cjsAliases = Object.keys(this.$meta).filter(alias => {
        const [source_, symbol_] = this.$meta[alias];
        return source_ === source && symbol_ === "<CJS>";
      });
      cjsAliases.forEach(alias => {
        this[alias] = sourceImports;
      });

      // Handle named ES imports (`import { foo } from "..."`) or
      // destructured CJS imports (`var { foo } = require("...")`).
      Object.keys(esImports).forEach(symbol => {
        const aliases = Object.keys(this.$meta).filter(alias => {
          const [source_, symbol_] = this.$meta[alias];
          return source_ === source && symbol_ === symbol;
        });

        if (
          aliases.length === 0 &&
          namespaceAliases.length === 0 &&
          cjsAliases.length === 0
        ) {
          throw new Error(
            `Module does not import "${symbol}" from "${source}"`
          );
        }

        aliases.forEach(alias => {
          this[alias] = esImports[symbol];
        });
      });
    });
  }

  /**
   * Replace any active mocks with the original imports.
   *
   * This function does nothing if called when no mocks are active.
   */
  $restore() {
    Object.keys(this.$meta).forEach(alias => {
      if (isSpecialMethod(alias)) {
        // Skip imports which conflict with special methods.
        return;
      }
      const [, , value] = this.$meta[alias];
      this[alias] = value;
    });
  }
}

function isSpecialMethod(name) {
  return ImportMap.prototype.hasOwnProperty(name);
}

module.exports = {
  ImportMap,
  MockingError
};
