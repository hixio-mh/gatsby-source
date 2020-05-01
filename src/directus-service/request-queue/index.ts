export interface QueueableRequest<T = unknown> {
  exec(): Promise<IteratorResult<T>>;
  results(): T;
  reset(): void;
  finished(): Promise<T>;
}

export interface RequestQueueConfig {
  maxConcurrentRequests?: number;
  throttle?: number;
  timeout?: number;
}

export interface RequestQueue<T = any> {
  enqueue(request: QueueableRequest<T>): void;
  flush(): Promise<T[]>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class BasicRequestQueue<T = any> implements RequestQueue<T> {
  private _queue: QueueableRequest<T>[] = [];
  private _active: Promise<IteratorResult<T>>[] = [];

  private _failed: QueueableRequest<T>[] = [];
  private _completed: QueueableRequest<T>[] = [];

  private _maxConcurrentRequests: number = Number.POSITIVE_INFINITY;
  private _throttle = 0;
  private _timeout = 15 * 1000;

  private _currentFlush: Promise<void> | void = undefined;

  constructor(config: RequestQueueConfig) {
    if (typeof config.maxConcurrentRequests === 'number' && config.maxConcurrentRequests > 0) {
      this._maxConcurrentRequests = config.maxConcurrentRequests;
    }

    if (
      typeof config.throttle === 'number' &&
      !isNaN(config.throttle) &&
      Number.isFinite(config.throttle) &&
      config.throttle >= 0
    ) {
      this._throttle = config.throttle;
    }

    if (
      typeof config.timeout === 'number' &&
      !isNaN(config.timeout) &&
      Number.isFinite(config.timeout) &&
      config.timeout >= 0
    ) {
      this._timeout = config.timeout;
    }
  }

  public enqueue(request: QueueableRequest<T>): void {
    this._queue.unshift(request);
    this._scheduleFlush();
  }

  public async flush(): Promise<T[]> {
    // Prevent multiple simultaneous flushes
    if (this._currentFlush) {
      await this._currentFlush;
    } else {
      // Ensure 'currentFlush' is cleared after the flush finishes.
      await (this._currentFlush = this._startFlush().finally(() => (this._currentFlush = undefined)));
    }

    return this._getResults();
  }

  private _scheduleFlush(): void {
    if (!this._currentFlush) {
      this.flush().catch(e => void 0);
    }
  }

  private async _startFlush(): Promise<void> {
    // Continue to queue requests until request queue is empty
    while (this._queue.length) {
      // Fill up the active queue with queued requests.
      while (this._active.length < this._maxConcurrentRequests && this._queue.length) {
        this._activateRequest(this._queue.pop()!);
      }

      // Wait for any request to finish. Again '_active'
      // is guaranteed to be at least one promise long.
      await Promise.race(this._active);

      // Wait for the throttle if present before
      // continuing to next request
      if (this._throttle > 0) {
        await new Promise(r => setTimeout(r, this._throttle));
      }
    }
  }

  private _getResults(): T[] {
    console.warn('TO IMPLEMENT...');
    return [];
  }

  private async _activateRequest(request: QueueableRequest<T>): Promise<void> {
    const activeRequest = this._wrapTimeout(request.exec(), this._timeout);
    this._active.push(activeRequest);

    try {
      const curs = await activeRequest;
      if (!curs.done) this.enqueue(request);
      else this._handleRequestComplete(request);
    } catch (e) {
      this._handleRequestError(e, request);
    } finally {
      this._removeActive(activeRequest);
    }
  }

  private _wrapTimeout<W>(prom: Promise<W>, timeout = 0): Promise<W> {
    if (typeof timeout !== 'number' || isNaN(timeout) || !Number.isFinite(timeout) || timeout <= 0) {
      return prom;
    }

    return Promise.race([
      prom,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Request timed out')), timeout)) as Promise<never>,
    ]);
  }

  private _handleRequestComplete(request: QueueableRequest<T>): void {
    this._completed.push(request);
  }

  private _handleRequestError(e: Error, request: QueueableRequest<T>): void {
    console.error('ERROR: Encountered error during request...', { e, request });
    this._failed.push(request);
  }

  private _removeActive(request: Promise<IteratorResult<T, any>>): void {
    this._active = this._active.filter(r => r !== request);
  }
}
