const started = Date.now();

function stamp() {
  const seconds = ((Date.now() - started) / 1000).toFixed(1).padStart(6, " ");
  return `[${seconds}s]`;
}

export function log(message) {
  process.stdout.write(`${stamp()} ${message}\n`);
}

export function step(title) {
  process.stdout.write(`\n${stamp()} ▸ ${title}\n`);
}

export function warn(message) {
  process.stdout.write(`${stamp()} ! ${message}\n`);
}

export function fail(error) {
  process.stderr.write(`\n${stamp()} ✗ ${error?.stack ?? error}\n`);
}

export function humanBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
