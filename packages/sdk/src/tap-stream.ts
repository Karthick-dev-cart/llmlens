/**
 * Wraps an async-iterable object with a Proxy that taps every value as it's
 * yielded, while leaving everything else on the object — extra SDK methods
 * like a Stream's `.controller` or `.tee()` — passing through via
 * Reflect.get untouched. Only the iteration itself is intercepted.
 */
export function tapStream<T extends AsyncIterable<unknown>>(
  stream: T,
  onChunk: (chunk: unknown) => void,
  onDone: () => void,
  onError: (err: unknown) => void,
): T {
  return new Proxy(stream, {
    get(target, prop, receiver) {
      if (prop === Symbol.asyncIterator) {
        return function (this: unknown) {
          const iterator = target[Symbol.asyncIterator]();
          return {
            async next() {
              try {
                const result = await iterator.next();
                if (result.done) {
                  onDone();
                } else {
                  onChunk(result.value);
                }
                return result;
              } catch (err) {
                onError(err);
                throw err;
              }
            },
            return: iterator.return?.bind(iterator),
            throw: iterator.throw?.bind(iterator),
            [Symbol.asyncIterator]() {
              return this;
            },
          };
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
