/**
 * Creates the schema and stops. Run it before the first boot, and again after
 * pulling a release that adds columns; it is safe to run repeatedly and is what
 * `vercel-build` calls before `next build`.
 */
import { migrate, pool } from '../src/lib/db';

migrate()
  .then(() => { console.log('Schema is up to date.'); return pool().end(); })
  .catch((err) => { console.error(err); pool().end(); process.exit(1); });
