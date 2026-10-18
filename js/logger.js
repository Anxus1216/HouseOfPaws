import { DEBUG_ENABLED } from './debug-config.generated.js';

const PREFIX = '[爪爪小屋]';

function write(level, event, details) {
  const sink = globalThis.console;
  const method = sink?.[level];
  if (typeof method !== 'function') return;
  try {
    if (details === undefined) method.call(sink, `${PREFIX} ${event}`);
    else method.call(sink, `${PREFIX} ${event}`, details);
  } catch (error) { /* Diagnostics must never interrupt gameplay. */ }
}

// Release builds keep failures visible, while routine gameplay stays quiet.
export function logInfo(event, details) {
  if (DEBUG_ENABLED) write('info', event, details);
}

export function logWarn(event, details) { write('warn', event, details); }
export function logError(event, details) { write('error', event, details); }
