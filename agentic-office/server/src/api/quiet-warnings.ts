// Silencia solo el aviso experimental de node:sqlite; el resto de avisos se conserva.
const originalEmit = process.emit.bind(process) as (event: string, ...args: unknown[]) => boolean;
process.emit = ((event: string, ...args: unknown[]) => {
  const w = args[0] as { name?: string; message?: string } | undefined;
  if (event === 'warning' && w?.name === 'ExperimentalWarning' && /sqlite/i.test(w.message ?? '')) return false;
  return originalEmit(event, ...args);
}) as typeof process.emit;
export {};
