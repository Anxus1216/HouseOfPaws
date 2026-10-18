export function debugEnabledFromText(text) {
  if (typeof text !== 'string') return false;
  try { return JSON.parse(text)?.debug?.enable === true; }
  catch (error) { return false; }
}
