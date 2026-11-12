import { CreateAdminError, parseStaffRole } from './create-admin-core.js';

// A distinct entry point makes old images fail closed instead of ignoring an unknown role flag.
try {
  parseStaffRole(process.argv.slice(2));
  await import('./create-admin.js');
} catch (error) {
  console.error(error instanceof CreateAdminError ? error.message : 'Staff bootstrap unavailable.');
  process.exitCode = 1;
}
