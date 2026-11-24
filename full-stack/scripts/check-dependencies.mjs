import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// npm removes node_modules during `ci`. Its hidden lockfile is written only
// after a successful installation, so a failed/partial install is never reused.
export function checkDependencies(directory) {
  const read = path => JSON.parse(readFileSync(path, 'utf8'));
  try {
    const lock = read(join(directory, 'package-lock.json'));
    const installed = read(join(directory, 'node_modules/.package-lock.json'));
    for (const [location, expected] of Object.entries(lock.packages)) {
      const manifestPath = join(directory, location, 'package.json');
      if (expected.link) {
        if (realpathSync(join(directory, location)) !== realpathSync(resolve(directory, expected.resolved))) {
          return { ready: false, reason: `Workspace ${location} belum terhubung dengan benar.` };
        }
        continue;
      }
      if (!location.includes('node_modules/')) {
        const manifest = read(manifestPath);
        for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
          const normalize = value => JSON.stringify(Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b)));
          if (normalize(manifest[field]) !== normalize(expected[field])) {
            return { ready: false, reason: `${location || 'Root'} package.json berbeda dengan lockfile.` };
          }
        }
        continue;
      }
      // Cross-platform native optional packages are intentionally absent.
      if (expected.optional && !existsSync(manifestPath)) continue;
      const actual = read(manifestPath), entry = installed.packages[location];
      if (actual.version !== expected.version || !entry || entry.version !== expected.version || entry.integrity !== expected.integrity) {
        return { ready: false, reason: `Dependensi ${location} belum lengkap atau versinya berbeda.` };
      }
    }
    return { ready: true };
  } catch {
    return { ready: false, reason: 'Instalasi dependensi belum lengkap atau belum tersedia.' };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkDependencies(process.cwd());
  if (!result.ready) console.error(result.reason);
  process.exitCode = result.ready ? 0 : 1;
}
