# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.1] - 2020-02-18

- Handle case where identifier referring to import is renamed by another Babel
  plugin after the call to `$imports.$add` is generated [#25](https://github.com/robertknight/babel-plugin-mockable-imports/pull/25)

## [1.7.0] - 2020-02-01

- Support selectively restoring/undoing mocks by passing an argument to `$restore`
  [#23](https://github.com/robertknight/babel-plugin-mockable-imports/pull/23)

## [1.6.0] - 2020-01-20

- Support mocking CommonJS imports of a specific export in the form
  `var alias = require("module/path").exportName` or
  `var alias = require("module/path")["exportName"]` [#22](https://github.com/robertknight/babel-plugin-mockable-imports/pull/22)

## [1.5.2] - 2019-11-04

- Fix a bug where functions passed to `$imports.$mock` were processed as both
  objects and functions
  [#16](https://github.com/robertknight/babel-plugin-mockable-imports/pull/16)

## [1.5.1] - 2019-05-29

- Fix a bug where calls to `$imports.$add` were added to the top-level of the
  module but were not statements. This invalid output caused problems when the
  plugin was used together with some other Babel plugins

## [1.5.0] - 2019-05-13

- Support passing a function to `$mock` to semi-automatically mock imports
  based on the source, symbol name or original value
  [(#14)](https://github.com/robertknight/babel-plugin-mockable-imports/pull/14)

## [1.4.0] - 2019-05-08

- Ignore Babel-generated CommonJS imports (https://github.com/robertknight/babel-plugin-mockable-imports/pull/8).
  The plugin uses the heuristic that CommonJS imports are auto-generated if
  the variable name starts with an underscore.

## [1.3.0] - 2019-04-11

- Support CommonJS imports with separate variable declaration and
  initialization (#5)

## [1.2.0] - 2019-04-11

- Make CommonJS imports which use destructuring mockable when the
  babel-transform-object-destructuring plugin is enabled (#4)
- Fix use of CommonJS imports if variable declarations before the last
  CommonJS import in the file references them (#4)

## [1.1.0] - 2019-04-08

- Support mocking of CommonJS / Node-style imports (`var aModule = require("a-module")`)
- Support excluding imports from certain modules from being transformed for
  mock-ability, via the `excludeImportsFromModules` option
- Support excluding modules from certain directories from being processed by
  this plugin via the `excludeDirs` option. By default this is configured to
  avoid transforming tests
- Fix CommonJS default exports (`module.exports = <expression>`) overwriting the
  `$imports` export
- Use more robust logic to avoid rewriting references to imports in the
  initialization of the `$imports` variable in generated code

## [1.0.0] - 2019-04-07

- Initial release
