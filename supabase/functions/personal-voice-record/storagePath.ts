const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildVoiceSamplePath(
  userId: string,
  sampleIndex: number,
): string {
  if (!UUID_PATTERN.test(userId)) {
    throw new Error("Invalid voice-sample owner");
  }
  if (!Number.isInteger(sampleIndex) || sampleIndex < 0 || sampleIndex > 99) {
    throw new Error("Invalid voice-sample index");
  }
  return `${userId}/sample-${sampleIndex}.webm`;
}
