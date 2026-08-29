import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { buildVoiceSamplePath } from "./storagePath.ts";

Deno.test("voice sample path is owned by the first folder segment", () => {
  const userId = "36a9655a-2e1b-4b36-a25e-1f2da19f8daf";
  assertEquals(buildVoiceSamplePath(userId, 0), `${userId}/sample-0.webm`);
});

Deno.test("voice sample path rejects untrusted path inputs", () => {
  assertThrows(() => buildVoiceSamplePath("voice-samples/owner", 0));
  assertThrows(() =>
    buildVoiceSamplePath("36a9655a-2e1b-4b36-a25e-1f2da19f8daf", -1)
  );
  assertThrows(() =>
    buildVoiceSamplePath("36a9655a-2e1b-4b36-a25e-1f2da19f8daf", 1.5)
  );
});
