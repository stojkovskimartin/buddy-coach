/** Wording for imports from watches and phone health apps. */

/** "1 new workout, 2 updated" after an import. */
export function importText(result: { created: number; updated: number }): string {
  const added = result.created === 1 ? "1 new workout" : `${result.created} new workouts`;
  return result.updated ? `${added}, ${result.updated} updated` : added;
}
