import {EventEmitter} from 'events';

type Callback = (err?: Error | null) => void;

type Listeners = {
  onClose: (...args: any[]) => void;
  onDrain: (...args: any[]) => void;
  onError: (...args: any[]) => void;
  onFinish: (...args: any[]) => void;
};

export class SyncTransform extends EventEmitter implements NodeJS.WritableStream, NodeJS.ReadableStream {
  public writable: boolean;

  private _destination: NodeJS.WritableStream | undefined;
  private _source: NodeJS.ReadableStream | undefined;
  private _destinationListeners: Listeners;
  private _destroyed: boolean;
  private _destinationNeedsEnd: boolean;
  private _lastPush: boolean;

  constructor(
    private readonly _transformF: (chunk: Uint8Array | string, _encoding?: string) => Uint8Array | string | undefined = (chunk) => chunk,
    private readonly _flushF: () => void = () => {}
  ) {
    super();
    this._destination = undefined;
    this._source = undefined;
    this._destroyed = false;
    this.writable = true;
    this._destinationNeedsEnd = true;
    this._lastPush = true;
    this._destinationListeners = {
      onClose: () => this.emit('close'),
      onDrain: () => this.emit('drain'),
      onError: (err) => this.emit('error', err),
      onFinish: () => this.emit('finish')
    };
    this.on('pipe', (src) => {
      if (this._source) {
        throw new Error('multiple sources not allowed');
      }
      this._source = src;
    });
    this.on('unpipe', (src) => {
      if (this._source === src) {
        this._source = undefined;
      }
    });
  }

  pipe<T extends NodeJS.WritableStream>(dest: T, opts?: {
    end?: boolean;
  }): T {
    if (this._destination) {
      throw new Error('multiple pipe not allowed');
    }
    this._destination = dest;
    dest.emit('pipe', this);
    dest.on('close', this._destinationListeners.onClose);
    dest.on('drain', this._destinationListeners.onDrain);
    dest.on('error', this._destinationListeners.onError);
    dest.on('finish', this._destinationListeners.onFinish);
    this._destinationNeedsEnd = !opts || opts.end !== false;
    return dest;
  }

  unpipe(dest: NodeJS.WritableStream): this {
    if (!this._destination || this._destination !== dest) {
      return this;
    }
    this._destination = undefined;
    dest.removeListener('close', this._destinationListeners.onClose);
    dest.removeListener('drain', this._destinationListeners.onDrain);
    dest.removeListener('error', this._destinationListeners.onError);
    dest.removeListener('finish', this._destinationListeners.onFinish);
    dest.emit('unpipe', this);
    return this;
  }

  write(chunk: Uint8Array | string, encoding?: string | Callback, cb?: Callback): boolean {
    if (typeof encoding === 'function') {
      cb = encoding;
      encoding = undefined;
    }
    if (!this.writable) {
      const error = new Error('write after EOF');
      this.emit('error', error);
      if (cb) {
        cb(error);
      }
      return false;
    }

    if (!this._destination) {
      const error = new Error('Pipe destination unset');
      this.emit('error', error);
      if (cb) {
        cb(error);
      }
      return false;
    }

    let res;
    try {
      res = this._transform(chunk, encoding);
    } catch (error) {
      this.emit('error', error);
      if (cb) {
        cb(error);
      }
    }
    if (res) {
      this._lastPush = this._destination.write(res, cb);
    } else if (res === null) {
      this.doEnd(cb);
      return false;
    }

    return this._lastPush;
  }

  end(chunk?: Uint8Array | string | Callback, encoding?: string | Callback, cb?: Callback): this {
    if (typeof encoding === 'function') {
      cb = encoding;
      encoding = undefined;
    }
    if (typeof chunk === 'function') {
      cb = chunk;
      chunk = undefined;
    }
    if (chunk) {
      // errors if we are after EOF
      this.write(chunk, encoding, (err) => {
        if (err) {
          if (cb) {
            cb(err);
          }
        } else {
          this.doEnd(cb);
        }
      });
    } else {
      this.doEnd(cb);
    }
    return this;
  }

  destroy(err: Error | null | undefined): this {
    if (!this._destroyed) {
      this._destroyed = true;
      this.writable = false;
      process.nextTick(() => {
        if (err) {
          this.emit('error', err);
        }
        this.emit('close');
      });
    }
    return this;
  }

  protected _transform(chunk: Uint8Array | string, _encoding?: string): Uint8Array | string | null | undefined {
    return this._transformF(chunk);
  }

  protected _flush(): void {
    this._flushF();
  }

  private doEnd(cb?: Callback): void {
    if (this.writable) {
      this.writable = false;
      if (this._destination) {
        try {
          this._flush();
          this.emit('finish');
          if (this._destinationNeedsEnd && this._destination) {
            this._destination.end(cb);
          }
        } catch (err) {
          this.emit('error', err);
          if (cb) {
            cb(err);
          }
        }
      }
    }
  }

  get readable(): boolean {
    return this._source ? this._source.readable : false;
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<string | Buffer> {
    if (this._source) {
      return this._asyncIterator();
    }
    throw new Error('Pipe source unset');
  }

  private async *_asyncIterator(): AsyncIterableIterator<string | Buffer> {
    for await (const chunk of this._source!) {
      const result = this._transformF(chunk);
      if (result) {
        yield result as string | Buffer;
      }
    }
  }

  isPaused(): boolean {
    return false;
  }

  pause(): this {
    if (this._source) {
      this._source.pause();
    }
    return this;
  }

  read(): string | Buffer {
    throw new Error('Syncthrough does not allow direct read');
  }

  resume(): this {
    if (this._source) {
      this._source.resume();
    }
    return this;
  }

  setEncoding(encoding: string): this {
    if (this._source) {
      this._source.setEncoding(encoding);
    }
    return this;
  }

  unshift(chunk: string | Uint8Array, encoding?: BufferEncoding): void {
    if (this._source) {
      this._source.unshift(chunk, encoding);
    }
  }

  wrap(oldStream: NodeJS.ReadableStream): this {
    if (this._source) {
      this._source.wrap(oldStream);
    }
    return this;
  }
}
