class MockingError extends Error {
  constructor(msg) {
    super(msg);
  }
}

class ImportMap {
  constructor(imports) {
    /**
     * A mapping of import local name (or alias) to metadata about where
     * the import came from.
     */
    this.$meta = imports;
    this.$restore();
  }

  /**
   * Replace true imports with mocks.
   *
   * If mocks are already active when this is called, the mocks in `imports`
   * are merged with the active mocks.
   *
   * @param {Object} imports -
   *   Map of file path (as used in the module that imports the file) to
   *   replacement content for that module.
   */
  $mock(imports) {
    Object.keys(imports).forEach(source => {
      const sourceImports = imports[source];
      let esImports = sourceImports;
      if (typeof esImports === 'function') {
        esImports = {default: esImports};
      }

      // Handle namespace ES imports (`import * as foo from "foo"`).
      const namespaceAliases = Object.keys(this.$meta).filter(alias => {
        const [source_, symbol_] = this.$meta[alias];
        return source_ === source && symbol_ === '*';
      });
      namespaceAliases.forEach(alias => {
        this[alias] = esImports;
      });

      // Handle CJS imports (`var foo = require("bar")`).
      const cjsAliases = Object.keys(this.$meta).filter(alias => {
        const [source_, symbol_] = this.$meta[alias];
        return source_ === source && symbol_ === '<CJS>';
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
            `Module does not import "${symbol}" from "${source}"`,
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
    const proto = Object.getPrototypeOf(this);
    Object.keys(this.$meta).forEach(alias => {
      if (proto.hasOwnProperty(alias)) {
        // Skip imports which conflict with special methods.
        return;
      }
      const [, , value] = this.$meta[alias];
      this[alias] = value;
    });
  }
}

module.exports = {
  ImportMap,
  MockingError,
};
