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
    });

    describe("$restore", () => {
      let map;
      beforeEach(() => {
        map = new ImportMap({
          first: ["a-module", "first", "original-first-value"],
          second: ["a-module", "second", "original-second-value"],
          third: ["a-module", "first", "original-first-value"]
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
    });
  });
});
