/**
 * Colas en serie por clave (una por agente). Las tareas de claves distintas corren en paralelo.
 */
export interface KeyedQueue {
  run<T>(key: string, fn: () => Promise<T>): Promise<T>;
  /** true mientras la cola tenga una tarea en ejecucion o esperando. */
  isBusy(key: string): boolean;
}

export function createKeyedQueue(): KeyedQueue {
  const tails = new Map<string, Promise<void>>();
  const pending = new Map<string, number>();

  return {
    run<T>(key: string, fn: () => Promise<T>): Promise<T> {
      pending.set(key, (pending.get(key) ?? 0) + 1);
      const prev = tails.get(key) ?? Promise.resolve();
      const result = prev.then(fn);
      const tail = result.then(
        () => undefined,
        () => undefined,
      );
      tails.set(key, tail);
      // El contador baja antes de que el llamador vea el resultado, asi isBusy es preciso en sus finally.
      const done = <V>(v: V) => {
        const n = (pending.get(key) ?? 1) - 1;
        if (n <= 0) pending.delete(key);
        else pending.set(key, n);
        if (tails.get(key) === tail && n <= 0) tails.delete(key);
        return v;
      };
      return result.then(done, (err: unknown) => {
        done(undefined);
        throw err;
      });
    },
    isBusy(key: string): boolean {
      return (pending.get(key) ?? 0) > 0;
    },
  };
}
