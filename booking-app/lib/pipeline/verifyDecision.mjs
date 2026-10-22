/**
 * Combine MillionVerifier with an optional backup verifier.
 * A reject from either side wins. Catch-all wins over a clean result from the other side.
 * A missing backup leaves the primary result unchanged.
 */
export function combineVerification(primary, backup) {
  if (!backup) return primary || 'unchecked';
  if (primary === 'reject' || backup === 'reject') return 'reject';
  if (primary === 'catch_all' || backup === 'catch_all') return 'catch_all';
  if (primary === 'ok' || backup === 'ok') return 'ok';
  return primary || 'unchecked';
}
