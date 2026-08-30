import { assertScopeBinding } from "./migration-subject-scope.mjs";
import { validateImportScope } from "./import-subject-package.mjs";

/** One approved subject set must survive every action-time receipt boundary. */
export function validateRollbackScope(
  { scope, scopeFileSha256, manifest, source, decision, targetRef, receipts },
) {
  const binding = validateImportScope({
    scope,
    scopeFileSha256,
    manifest,
    source,
    decision,
    targetRef,
  });
  const required = [
    "sourceRevalidation",
    "sourceFreeze",
    "imported",
    "storage",
    "storageRevalidation",
    "oauthReset",
    "quarantine",
  ];
  for (const label of required) {
    assertScopeBinding(
      receipts?.[label]?.subjectScope,
      binding,
      `${label} subject scope`,
    );
  }
  if (
    receipts.sourceRevalidation.auth?.subjectIdsSha256 !==
      binding.subjectIdsSha256 ||
    receipts.sourceRevalidation.auth?.userCount !== binding.subjectCount
  ) {
    throw new Error(
      "Fresh source Auth inventory does not match the approved subject scope",
    );
  }
  return binding;
}
