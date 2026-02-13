## Migration History Notes

- `20260104182400_add_nextauth_tables` is intentionally a no-op legacy marker.
- The real NextAuth migration is `20260106004518_add_nextauth_tables`.
- Applied migration files must never be edited after deploy; only add forward migrations.

### Why this file exists

This project had drift caused by post-apply migration edits in the past. The fix is:

1. keep legacy entries as-is,
2. codify corrections in new forward migrations,
3. avoid modifying historical migrations.
