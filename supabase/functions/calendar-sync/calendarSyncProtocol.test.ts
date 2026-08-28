import {
  buildCalendarEventsListUrl,
  buildCalendarSyncStatusUpdate,
  buildCalendarSyncSuccessReceipt,
  partitionCalendarEventChanges,
  processCalendarEventPages,
} from "./calendarSyncProtocol.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${
        JSON.stringify(actual)
      }`,
    );
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.test("incremental Calendar URLs omit Google-incompatible query parameters", () => {
  const url = new URL(buildCalendarEventsListUrl({
    calendarId: "primary@example.com",
    syncToken: "sync-token",
    window: {
      timeMin: "2026-01-01T00:00:00.000Z",
      timeMax: "2026-12-31T00:00:00.000Z",
    },
  }));

  assertEquals(
    url.searchParams.get("syncToken"),
    "sync-token",
    "Missing sync token",
  );
  assertEquals(
    url.searchParams.get("singleEvents"),
    "true",
    "singleEvents changed",
  );
  assertEquals(
    url.searchParams.get("showDeleted"),
    "true",
    "showDeleted changed",
  );
  for (
    const forbidden of ["orderBy", "timeMin", "timeMax", "updatedMin", "q"]
  ) {
    assert(
      !url.searchParams.has(forbidden),
      `Incremental URL included ${forbidden}`,
    );
  }
});

Deno.test("bounded Calendar URLs carry a window without incremental-only state", () => {
  const url = new URL(buildCalendarEventsListUrl({
    calendarId: "primary",
    window: {
      timeMin: "2026-01-01T00:00:00.000Z",
      timeMax: "2026-12-31T00:00:00.000Z",
    },
  }));

  assertEquals(
    url.searchParams.get("timeMin"),
    "2026-01-01T00:00:00.000Z",
    "Missing timeMin",
  );
  assertEquals(
    url.searchParams.get("timeMax"),
    "2026-12-31T00:00:00.000Z",
    "Missing timeMax",
  );
  assert(
    !url.searchParams.has("syncToken"),
    "Bounded URL unexpectedly had a sync token",
  );
  assert(
    !url.searchParams.has("orderBy"),
    "Bounded URL should preserve legal sync parity",
  );
});

Deno.test("Calendar pagination persists every page and accepts only the final nextSyncToken", async () => {
  const requestedUrls: URL[] = [];
  const pages = [
    { items: [{ id: "one" }], nextPageToken: "page-two" },
    { items: [{ id: "two" }, { id: "three" }], nextSyncToken: "final-sync" },
  ];
  const fetchImpl = async (
    input: string | URL | Request,
  ): Promise<Response> => {
    requestedUrls.push(new URL(String(input)));
    const page = pages.shift();
    assert(page, "Unexpected extra Calendar request");
    return jsonResponse(page);
  };
  const persisted: string[][] = [];

  const result = await processCalendarEventPages<{ id: string }>({
    accessToken: "provider-token",
    calendarId: "primary",
    syncToken: "previous-sync",
    fetchImpl,
  }, async (events) => {
    persisted.push(events.map((event) => event.id));
  });

  assertEquals(result, {
    success: true,
    itemsProcessed: 3,
    syncToken: "final-sync",
  }, "Unexpected pagination result");
  assertEquals(
    persisted,
    [["one"], ["two", "three"]],
    "Pages were not persisted in order",
  );
  assertEquals(requestedUrls.length, 2, "Unexpected request count");
  assert(
    !requestedUrls[0].searchParams.has("pageToken"),
    "First request had a page token",
  );
  assertEquals(
    requestedUrls[1].searchParams.get("pageToken"),
    "page-two",
    "Second request missed the provider page token",
  );
  assertEquals(
    requestedUrls[1].searchParams.get("syncToken"),
    "previous-sync",
    "Incremental token changed across pages",
  );
});

Deno.test("Calendar 410 is surfaced as a bounded-resync requirement", async () => {
  const result = await processCalendarEventPages({
    accessToken: "provider-token",
    calendarId: "primary",
    syncToken: "expired-sync",
    fetchImpl: async () => jsonResponse({ error: "invalidSyncToken" }, 410),
  }, async () => {
    throw new Error("410 response must not persist a page");
  });

  assertEquals(result, {
    success: false,
    itemsProcessed: 0,
    error: "410 Gone - Invalid sync token",
    requiresFullSync: true,
  }, "410 did not request a full sync");
});

Deno.test("Calendar persistence failures stop pagination and remain fail-visible", async () => {
  let requests = 0;
  const result = await processCalendarEventPages<{ id: string }>({
    accessToken: "provider-token",
    calendarId: "primary",
    fetchImpl: async () => {
      requests += 1;
      return jsonResponse({ items: [{ id: "one" }], nextPageToken: "next" });
    },
  }, async () => {
    throw new Error("database rejected the event");
  });

  assert(!result.success, "Persistence failure was reported as success");
  assert(
    result.error.includes("database rejected the event"),
    "Persistence error lost its cause",
  );
  assertEquals(
    result.itemsProcessed,
    0,
    "Failed page was counted as persisted",
  );
  assertEquals(requests, 1, "Pagination continued after persistence failed");
});

Deno.test("Calendar final pages must include nextSyncToken", async () => {
  const result = await processCalendarEventPages<{ id: string }>({
    accessToken: "provider-token",
    calendarId: "primary",
    fetchImpl: async () => jsonResponse({ items: [] }),
  }, async () => {});

  assert(!result.success, "Missing final sync token was accepted");
  assertEquals(
    result.error,
    "Calendar API final page omitted nextSyncToken",
    "Unexpected missing-token error",
  );
});

Deno.test("cancelled Calendar events are separated for cache deletion", () => {
  const result = partitionCalendarEventChanges([
    { id: "active", status: "confirmed" },
    { id: "cancelled", status: "cancelled" },
  ]);

  assertEquals(
    result.activeEvents.map((event) => event.id),
    ["active"],
    "Active event partition was wrong",
  );
  assertEquals(
    result.cancelledEventIds,
    ["cancelled"],
    "Cancelled event was not deleted",
  );
});

Deno.test("410 recovery explicitly clears the stored sync token", () => {
  const update = buildCalendarSyncStatusUpdate(
    "syncing",
    {
      syncToken: null,
      error: "Sync token invalid, performing bounded re-sync",
    },
    "2026-08-28T00:00:00.000Z",
  );

  assert("next_sync_token" in update, "Token-clear field was omitted");
  assertEquals(
    update.next_sync_token,
    null,
    "Invalid sync token was not cleared",
  );
});

Deno.test("only full or bounded completion advances last_full_sync_at", () => {
  const now = "2026-08-28T00:00:00.000Z";
  const incremental = buildCalendarSyncStatusUpdate(
    "complete",
    { syncToken: "incremental-next" },
    now,
  );
  const full = buildCalendarSyncStatusUpdate(
    "complete",
    { syncToken: "full-next", fullSyncCompleted: true },
    now,
  );

  assertEquals(
    incremental.last_sync_at,
    now,
    "Incremental sync did not mark completion",
  );
  assert(
    !("last_full_sync_at" in incremental),
    "Incremental sync incorrectly marked a full sync",
  );
  assertEquals(
    full.last_full_sync_at,
    now,
    "Full sync timestamp was not advanced",
  );
});

Deno.test("bounded 410 recovery returns a full-sync durable receipt", () => {
  assertEquals(
    buildCalendarSyncSuccessReceipt(
      17,
      "replacement-sync-token",
      "full",
      "Bounded re-sync completed successfully",
    ),
    {
      success: true,
      eventsProcessed: 17,
      syncToken: "replacement-sync-token",
      syncType: "full",
      boundedWindow: true,
      message: "Bounded re-sync completed successfully",
    },
    "Bounded recovery receipt did not identify the fallback full sync",
  );
});
