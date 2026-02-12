/**
 * Async Event Queue for sequential event processing.
 *
 * Replaces Python's asyncio.Queue with a Promise-based implementation.
 */

export class EventQueue<T = unknown> {
  private queue: T[] = [];
  private maxSize: number;
  private resolvers: Array<(value: T) => void> = [];
  private _droppedCount = 0;
  private _processing = false;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  /** Add an event to the queue. Returns false if full. */
  put(event: T): boolean {
    if (this.queue.length >= this.maxSize) {
      this._droppedCount++;
      return false;
    }

    // If someone is waiting for an event, deliver immediately
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve(event);
      return true;
    }

    this.queue.push(event);
    return true;
  }

  /** Get next event from queue. Blocks until available or timeout. */
  async get(timeoutMs?: number): Promise<T | null> {
    // If queue has items, return immediately
    if (this.queue.length > 0) {
      return this.queue.shift()!;
    }

    // Otherwise wait for an event
    return new Promise<T | null>((resolve) => {
      if (timeoutMs !== undefined) {
        const timer = setTimeout(() => {
          // Remove this resolver
          const idx = this.resolvers.indexOf(wrappedResolve);
          if (idx >= 0) this.resolvers.splice(idx, 1);
          resolve(null);
        }, timeoutMs);

        const wrappedResolve = (value: T) => {
          clearTimeout(timer);
          resolve(value);
        };
        this.resolvers.push(wrappedResolve);
      } else {
        this.resolvers.push((value: T) => resolve(value));
      }
    });
  }

  get isProcessing(): boolean {
    return this._processing;
  }

  set processing(value: boolean) {
    this._processing = value;
  }

  get qsize(): number {
    return this.queue.length;
  }

  get droppedCount(): number {
    return this._droppedCount;
  }

  /** Clear all pending items and resolvers. */
  clear(): void {
    this.queue = [];
    // Resolve any waiting getters with null
    for (const resolve of this.resolvers) {
      resolve(null as unknown as T);
    }
    this.resolvers = [];
  }
}
