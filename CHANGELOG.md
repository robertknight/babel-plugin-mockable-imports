# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
