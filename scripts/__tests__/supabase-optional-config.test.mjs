import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  compareReceipts,
  evaluateSecretNameInventory,
  loadManifests,
  secretManifestFingerprints,
  validateSecretNameManifests,
} from "../supabase-isolation-preflight.mjs";
import { repoRoot, sha256 } from "../lib/supabase-isolation.mjs";

const REQUIRED = ["OPENAI_API_KEY", "PLAID_CLIENT_ID", "PLAID_SECRET"];
const OPTIONAL = ["CALENDAR_REVIEWED_UPDATES_ENABLED"];
const inventory = (liveNames = REQUIRED, kind = "target") => evaluateSecretNameInventory({
  requiredNames: REQUIRED, optionalNames: OPTIONAL, liveNames, kind,
});

function receipt(kind = "target") {
  return {
    version: 1, kind, status: "ready", manifests: secretManifestFingerprints(),
    catalog: { relations: [], functions: [] }, publicData: [], storage: { objects: [] }, auth: {},
  };
}

describe("strict optional default-OFF configuration inventory", () => {
  it("loads only the reviewed optional name without weakening the required list", () => {
    const manifests = loadManifests();
    assert.deepEqual(manifests.optionalConfigNames, OPTIONAL);
    for (const name of REQUIRED) assert.ok(manifests.secretNames.includes(name));
    assert.ok(!manifests.secretNames.includes(OPTIONAL[0]));
  });

  it("allows absent optional configuration and records absence, not activation", () => {
    const result = inventory();
    assert.deepEqual(result.blockers, []);
    assert.deepEqual(result.secrets.optional, [{ name: OPTIONAL[0], present: false }]);
    assert.equal(result.secrets.activationVerified, false);
    assert.equal(result.secrets.valuesIncluded, false);
  });

  it("allows present optional configuration without claiming its value or activation", () => {
    const result = inventory([...REQUIRED, ...OPTIONAL]);
    assert.deepEqual(result.blockers, []);
    assert.deepEqual(result.secrets.optional, [{ name: OPTIONAL[0], present: true }]);
    assert.equal(result.secrets.activationVerified, false);
    assert.equal(result.secrets.valuesIncluded, false);
    assert.deepEqual(Object.keys(result.secrets.optional[0]), ["name", "present"]);
  });

  it("keeps every missing required name blocked even when the optional name exists", () => {
    const result = inventory(OPTIONAL);
    assert.deepEqual(result.blockers, REQUIRED.map((name) => `missing user-managed secret: ${name}`));
  });

  it("rejects unknown target names while retaining exact platform-managed exemptions", () => {
    const result = inventory([...REQUIRED, ...OPTIONAL, "SUPABASE_URL", "UNKNOWN_FEATURE"]);
    assert.deepEqual(result.secrets.extraUserManagedNames, ["UNKNOWN_FEATURE"]);
    assert.deepEqual(result.blockers, ["target has user-managed secrets outside the allowlist: UNKNOWN_FEATURE"]);
  });

  it("preserves the shared source inventory boundary without adopting unknown names", () => {
    const result = inventory([...REQUIRED, "OTHER_PRODUCT_KEY"], "source");
    assert.deepEqual(result.blockers, []);
    assert.deepEqual(result.secrets.extraUserManagedNames, ["OTHER_PRODUCT_KEY"]);
    assert.deepEqual(result.secrets.optional, [{ name: OPTIONAL[0], present: false }]);
  });

  for (const [label, requiredNames, optionalNames] of [
    ["duplicate required", [...REQUIRED, REQUIRED[0]], OPTIONAL],
    ["duplicate optional", REQUIRED, [...OPTIONAL, OPTIONAL[0]]],
    ["overlapping", [...REQUIRED, ...OPTIONAL], OPTIONAL],
    ["empty required", [], OPTIONAL],
    ["empty optional", REQUIRED, []],
    ["invalid required", ["KEY=PRIVATE_VALUE"], OPTIONAL],
    ["invalid optional", REQUIRED, ["KEY=PRIVATE_VALUE"]],
    ["trailing whitespace required", ["KEY\n"], OPTIONAL],
    ["trailing whitespace optional", REQUIRED, ["KEY\n"]],
    ["platform required", ["SUPABASE_SERVICE_ROLE_KEY"], OPTIONAL],
    ["platform optional", REQUIRED, ["SUPABASE_SERVICE_ROLE_KEY"]],
  ]) {
    it(`rejects ${label} manifests without echoing accidental values`, () => {
      assert.throws(() => validateSecretNameManifests(requiredNames, optionalNames), (error) => {
        assert.ok(!error.message.includes("PRIVATE_VALUE"));
        return true;
      });
    });
  }

  for (const liveNames of [null, [null], ["KEY=PRIVATE_VALUE"], ["KEY\n"], [42], [{ name: "OPENAI_API_KEY", value: "PRIVATE_VALUE" }]]) {
    it(`rejects malformed provider name inventory ${JSON.stringify(liveNames)} without value disclosure`, () => {
      assert.throws(() => inventory(liveNames), (error) => {
        assert.equal(error.message, "invalid provider secret-name inventory");
        return true;
      });
    });
  }

  it("does not accept an unknown inventory kind", () => {
    assert.throws(() => inventory(REQUIRED, "other"), /invalid inventory kind/u);
  });

  it("binds both exact manifest file bytes", () => {
    const fingerprints = secretManifestFingerprints();
    assert.equal(fingerprints.secretsSha256, sha256(readFileSync(resolve(repoRoot, "supabase/isolation/mind-manual-secrets.txt"))));
    assert.equal(fingerprints.optionalConfigSha256, sha256(readFileSync(resolve(repoRoot, "supabase/isolation/mind-manual-optional-config.txt"))));
  });

  it("accepts matching source and target configuration bindings", () => {
    const blockers = [];
    compareReceipts(receipt(), receipt("source"), blockers);
    assert.deepEqual(blockers, []);
  });

  for (const field of ["secretsSha256", "optionalConfigSha256"]) {
    for (const side of ["source", "target"]) {
      for (const change of ["missing", "different", "malformed", "inherited"]) {
        it(`rejects ${change} ${side} ${field} binding`, () => {
          const source = receipt("source");
          const target = receipt();
          const changed = side === "source" ? source : target;
          if (change === "missing") delete changed.manifests[field];
          if (change === "different") changed.manifests[field] = "a".repeat(64);
          if (change === "malformed") changed.manifests[field] = "unverified";
          if (change === "inherited") {
            const value = changed.manifests[field];
            delete changed.manifests[field];
            Object.setPrototypeOf(changed.manifests, { [field]: value });
          }
          const blockers = [];
          compareReceipts(target, source, blockers);
          assert.deepEqual(blockers, [`configuration manifest binding mismatch: ${field}`]);
        });
      }
    }
  }
});
