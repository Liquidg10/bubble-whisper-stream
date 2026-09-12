/** Keep nested work inside the parent request's admission lease. */
export async function dispatchAndDrain(
  url: string,
  init: RequestInit,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const response = await fetcher(url, init);
  // Receiving headers is not completion. Consume the bounded child response so
  // its request/stream lease can release before the parent is marked processed.
  await response.arrayBuffer();
  if (!response.ok) throw new Error('Plaid sync dispatch did not complete');
}
