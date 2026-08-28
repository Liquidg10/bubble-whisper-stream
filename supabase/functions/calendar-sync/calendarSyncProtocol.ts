export const GOOGLE_CALENDAR_PAGE_SIZE = 250;
export const MAX_CALENDAR_SYNC_PAGES = 100;

export interface CalendarSyncWindow {
  timeMin: string;
  timeMax: string;
}

export interface GoogleCalendarPage<TEvent> {
  items?: TEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

export interface CalendarPageRequest {
  accessToken: string;
  calendarId: string;
  syncToken?: string | null;
  window?: CalendarSyncWindow;
  fetchImpl?: typeof fetch;
  maxPages?: number;
}

export type CalendarSyncStatus = "idle" | "syncing" | "complete" | "error";
export type CalendarSyncType = "full" | "incremental";

export interface CalendarSyncStatusOptions {
  syncToken?: string | null;
  error?: string;
  fullSyncCompleted?: boolean;
}

export type CalendarPageResult =
  | {
    success: true;
    itemsProcessed: number;
    syncToken: string;
  }
  | {
    success: false;
    itemsProcessed: number;
    error: string;
    requiresFullSync?: boolean;
  };

export interface CalendarSyncSuccessReceipt {
  success: true;
  eventsProcessed: number;
  syncToken: string;
  syncType: CalendarSyncType;
  boundedWindow: boolean;
  message?: string;
}

export function buildCalendarSyncSuccessReceipt(
  eventsProcessed: number,
  syncToken: string,
  syncType: CalendarSyncType,
  message?: string,
): CalendarSyncSuccessReceipt {
  return {
    success: true,
    eventsProcessed,
    syncToken,
    syncType,
    boundedWindow: syncType === "full",
    ...(message ? { message } : {}),
  };
}

export function partitionCalendarEventChanges<
  TEvent extends { id?: string; status?: string },
>(events: TEvent[]): { activeEvents: TEvent[]; cancelledEventIds: string[] } {
  const activeEvents: TEvent[] = [];
  const cancelledEventIds: string[] = [];

  for (const event of events) {
    if (!event.id) {
      throw new Error("Google Calendar returned an event without an id");
    }

    if (event.status === "cancelled") {
      cancelledEventIds.push(event.id);
    } else {
      activeEvents.push(event);
    }
  }

  return { activeEvents, cancelledEventIds };
}

export function buildCalendarSyncStatusUpdate(
  status: CalendarSyncStatus,
  options: CalendarSyncStatusOptions = {},
  nowIso = new Date().toISOString(),
): Record<string, string | null> {
  const updates: Record<string, string | null> = {
    sync_status: status,
    last_sync_error: options.error ?? null,
  };

  if (Object.prototype.hasOwnProperty.call(options, "syncToken")) {
    updates.next_sync_token = options.syncToken ?? null;
  }
  if (status === "complete") {
    updates.last_sync_at = nowIso;
  }
  if (options.fullSyncCompleted) {
    updates.last_full_sync_at = nowIso;
  }

  return updates;
}

export function buildCalendarEventsListUrl(options: {
  calendarId: string;
  syncToken?: string | null;
  window?: CalendarSyncWindow;
  pageToken?: string;
}): string {
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${
      encodeURIComponent(options.calendarId)
    }/events`,
  );

  url.searchParams.set("maxResults", String(GOOGLE_CALENDAR_PAGE_SIZE));
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("showDeleted", "true");

  if (options.syncToken) {
    // Google forbids orderBy/timeMin/timeMax alongside syncToken. Keep every
    // other synchronization parameter identical to the initial request.
    url.searchParams.set("syncToken", options.syncToken);
  } else if (options.window) {
    url.searchParams.set("timeMin", options.window.timeMin);
    url.searchParams.set("timeMax", options.window.timeMax);
  }

  if (options.pageToken) {
    url.searchParams.set("pageToken", options.pageToken);
  }

  return url.toString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function processCalendarEventPages<TEvent>(
  request: CalendarPageRequest,
  persistPage: (events: TEvent[]) => Promise<void>,
): Promise<CalendarPageResult> {
  const fetchImpl = request.fetchImpl ?? fetch;
  const maxPages = request.maxPages ?? MAX_CALENDAR_SYNC_PAGES;

  if (
    !Number.isInteger(maxPages) || maxPages < 1 ||
    maxPages > MAX_CALENDAR_SYNC_PAGES
  ) {
    return {
      success: false,
      itemsProcessed: 0,
      error: "Calendar sync page limit is invalid",
    };
  }

  let pageToken: string | undefined;
  let itemsProcessed = 0;
  const seenPageTokens = new Set<string>();

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const url = buildCalendarEventsListUrl({
      calendarId: request.calendarId,
      syncToken: request.syncToken,
      window: request.window,
      pageToken,
    });

    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: {
          Authorization: `Bearer ${request.accessToken}`,
          Accept: "application/json",
        },
      });
    } catch (error) {
      return {
        success: false,
        itemsProcessed,
        error: `Calendar API request failed: ${errorMessage(error)}`,
      };
    }

    if (!response.ok) {
      const responseBody = await response.text();
      if (
        response.status === 410 || responseBody.includes("invalidSyncToken")
      ) {
        return {
          success: false,
          itemsProcessed,
          error: "410 Gone - Invalid sync token",
          requiresFullSync: true,
        };
      }

      if (response.status === 401) {
        return {
          success: false,
          itemsProcessed,
          error: "Token expired - refresh required",
        };
      }

      return {
        success: false,
        itemsProcessed,
        error: `Calendar API error: HTTP ${response.status}`,
      };
    }

    let page: GoogleCalendarPage<TEvent>;
    try {
      page = await response.json();
    } catch {
      return {
        success: false,
        itemsProcessed,
        error: "Calendar API returned invalid JSON",
      };
    }

    if (!page || typeof page !== "object" || !Array.isArray(page.items ?? [])) {
      return {
        success: false,
        itemsProcessed,
        error: "Calendar API returned an invalid event page",
      };
    }

    const events = page.items ?? [];
    try {
      await persistPage(events);
    } catch (error) {
      return {
        success: false,
        itemsProcessed,
        error: `Calendar event persistence failed: ${errorMessage(error)}`,
      };
    }
    itemsProcessed += events.length;

    if (page.nextPageToken) {
      if (page.nextSyncToken) {
        return {
          success: false,
          itemsProcessed,
          error: "Calendar API returned conflicting page and sync tokens",
        };
      }
      if (seenPageTokens.has(page.nextPageToken)) {
        return {
          success: false,
          itemsProcessed,
          error: "Calendar API repeated a page token",
        };
      }

      seenPageTokens.add(page.nextPageToken);
      pageToken = page.nextPageToken;
      continue;
    }

    if (!page.nextSyncToken) {
      return {
        success: false,
        itemsProcessed,
        error: "Calendar API final page omitted nextSyncToken",
      };
    }

    return {
      success: true,
      itemsProcessed,
      syncToken: page.nextSyncToken,
    };
  }

  return {
    success: false,
    itemsProcessed,
    error: `Calendar sync exceeded the ${maxPages}-page safety limit`,
  };
}
