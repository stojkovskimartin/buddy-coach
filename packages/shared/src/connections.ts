/** Wording for imports from watches and phone health apps. */

/** "1 new workout, 2 updated" after an import. */
export function importText(result: { created: number; updated: number }): string {
  const added = result.created === 1 ? "1 new workout" : `${result.created} new workouts`;
  return result.updated ? `${added}, ${result.updated} updated` : added;
}

/** "2 new weights, 1 updated" after an account sync, or why nothing happened. */
export function syncText(
  result: { synced: boolean; created: number; updated: number },
  what: "weight" | "workout",
): string {
  if (!result.synced) return "Synced less than 10 minutes ago, try again later";
  if (!result.created && !result.updated) return `No new ${what}s`;
  const added = result.created === 1 ? `1 new ${what}` : `${result.created} new ${what}s`;
  return result.updated ? `${added}, ${result.updated} updated` : added;
}
