"use strict";

const { ImportMap } = require("../helpers");

const { assert } = require("chai");

describe("helpers", () => {
  describe("ImportMap", () => {
    it("creates a property for each alias", () => {
      const firstIdent = 42;
      const secondIdent = "foo";
      const map = new ImportMap({
        firstIdent: ["src-module", "firstIdent", firstIdent],
        secondIdent: ["other-src-module", "secondIdent", secondIdent]
      });
      assert.equal(map.firstIdent, firstIdent);
      assert.equal(map.secondIdent, secondIdent);
    });

    it("does not create properties for aliases that match `$mock` or `$restore` methods", () => {
      const map = new ImportMap({
        ident: ["src-module", "ident", "ident-value"],
        $mock: ["src-module", "$mock", "value"],
        $restore: ["src-module", "$mock", "value"]
      });
      assert.equal(map.$mock, ImportMap.prototype.$mock);
      assert.equal(map.$restore, ImportMap.prototype.$restore);
    });

    describe("$add", () => {
      it("adds a new property to the instance", () => {
        const map = new ImportMap();
        map.$add("foo", "./bar", "foo", 42);
        assert.equal(map.foo, 42);
        assert.deepEqual(map.$meta.foo, ["./bar", "foo", 42]);
      });

      ["$mock", "$restore", "$add"].forEach(method => {
        it(`does not add a new property if the name is ${method}`, () => {
          const map = new ImportMap();
          map.$add(method, "./bar", "foo", 42);
          assert.notEqual(map[method], 42);
        });
      });
    });

    describe("$mock", () => {
      it("replaces all matching aliases with mock values", () => {
        const map = new ImportMap({
          first: ["a-module", "first", "original-first-value"],
          second: ["a-module", "second", "original-second-value"],
          third: ["a-module", "first", "original-first-value"]
        });

        map.$mock({
          "a-module": {
            first: "new-first-value",
            second: "new-second-value"
          }
        });

        assert.equal(map.first, "new-first-value");
        assert.equal(map.second, "new-second-value");
        assert.equal(map.third, "new-first-value");
      });

      it("can be called multiple times", () => {
        const map = new ImportMap({
          first: ["a-module", "first", "original-first-value"],
          second: ["a-module", "second", "original-second-value"]
        });

        map.$mock({ "a-module": { first: "new-first-value" } });
        map.$mock({ "a-module": { second: "new-second-value" } });

        assert.equal(map.first, "new-first-value");
        assert.equal(map.second, "new-second-value");
      });

      it("throws if mock does not match any imported symbol", () => {
        const map = new ImportMap({
          ident: ["a-module", "ident", "ident-value"]
        });

        assert.throws(() => {
          map.$mock({ "b-module": { ident: "new-value" } });
        }, 'Module does not import "ident" from "b-module"');
        assert.throws(() => {
          map.$mock({ "a-module": { otherIdent: "new-value" } });
        }, 'Module does not import "otherIdent" from "a-module"');
      });

      it("supports namespace imports", () => {
        const map = new ImportMap({
          aModule: ["a-module", "*", { ident: "ident-value" }]
        });

        map.$mock({ "a-module": { ident: "new-value" } });

        assert.deepEqual(map.aModule, { ident: "new-value" });
      });

      it("throws if a mock is supplied for a module that is not imported", () => {
        const map = new ImportMap({});
        assert.throws(() => {
          map.$mock({ "a-module": { ident: "new-value" } });
        }, 'Module does not import "ident" from "a-module"');
      });

      it("supports a shorthand for mocking non-object default exports", () => {
        const map = new ImportMap({
          Widget: ["./Widget", "default", function Widget() {}]
        });
        const MockWidget = () => {};
        map.$mock({ "./Widget": MockWidget });
        assert.equal(map.Widget, MockWidget);
      });

      it("mocks symbols imported via CommonJS imports", () => {
        const map = new ImportMap({
          Widget: ["./Widget", "<CJS>", function Widget() {}]
        });
        const MockWidget = () => {};
        map.$mock({ "./Widget": MockWidget });
        assert.equal(map.Widget, MockWidget);
      });

      it("supports passing a function to `$mock`", () => {
        const objectOne = {};
        const map = new ImportMap({
          functionOne: [
            "./function-one",
            "functionOne",
            function functionOne() {}
          ],
          functionTwo: [
            "./function-two",
            "functionTwo",
            function functionTwo() {}
          ],
          objectOne: ["./object-one", "default", objectOne]
        });
        const stubFunction = () => {};

        // Call `$mock` with a function that mocks all function imports with
        // a stub function.
        map.$mock((source, symbol, value) => {
          if (typeof value === "function") {
            return stubFunction;
          } else {
            return null;
          }
        });

        // Check that only the function imports were mocked.
        assert.equal(map.functionOne, stubFunction);
        assert.equal(map.functionTwo, stubFunction);
        assert.equal(map.objectOne, objectOne);
      });

      it("does not process keys of `$mock` argument if it is a function", () => {
        const map = new ImportMap({
          foo: ["./foo", "foo", () => "original foo"]
        });

        const mocker = () => null;

        // This should be ignored because `mocker` is a function.
        mocker["./foo"] = { foo: () => "mocked foo" };

        map.$mock(mocker);

        assert.equal(map.foo(), "original foo");
      });
    });

    describe("$restore", () => {
      let map;
      beforeEach(() => {
        map = new ImportMap({
          first: ["a-module", "first", "original-first-value"],
          second: ["a-module", "second", "original-second-value"],
          third: ["a-module", "first", "original-first-value"],
          fourth: ["b-module", "foo", "original-foo-value"]
        });
      });

      it("restores original property values", () => {
        map.$mock({
          "a-module": {
            first: "new-first-value",
            second: "new-second-value"
          }
        });

        map.$restore();

        assert.equal(map.first, "original-first-value");
        assert.equal(map.second, "original-second-value");
        assert.equal(map.third, "original-first-value");
      });

      it("can be called multiple times", () => {
        map.$mock({ "a-module": { first: "new-first-value" } });
        map.$restore();
        map.$restore();

        assert.equal(map.first, "original-first-value");
      });

      it("restores specified modules if an argument is passed", () => {
        map.$mock({
          "a-module": {
            first: "new-first-value",
            second: "new-second-value"
          },
          "b-module": {
            foo: "new-foo-value"
          }
        });

        map.$restore({ "a-module": true });

        assert.equal(map.first, "original-first-value");
        assert.equal(map.second, "original-second-value");
        assert.equal(map.fourth, "new-foo-value");
      });

      it("restores specified symbols if an argument is passed", () => {
        map.$mock({
          "a-module": {
            first: "new-first-value",
            second: "new-second-value"
          }
        });

        map.$restore({ "a-module": { first: true } });

        assert.equal(map.first, "original-first-value");
        assert.equal(map.second, "new-second-value");
      });
    });
  });
});
