interface Chunk {
    ms: number;
    data: string;
}
type Listener = (event: ListenerRecord) => void;
type ListenerEvent = 'play' | 'pause' | 'rewind' | 'end' | 'data';
type ListenerData = {
    data: string;
    ms: number;
};
type ListenerRecord =
    | { type: 'data'; data: ListenerData }
    | {
          type: 'play' | 'pause' | 'rewind' | 'end';
      };

export interface Dependencies {
    now: () => number;
    setTimeout: (fn: () => void, ms: number) => number;
    clearTimeout: (handle: number) => void;
}

export class Player {
    _chunks: Chunk[];
    _frame: number;
    _startTime: number | null;
    _tickHandle: number | null;
    listeners: Listener[];
    now: Dependencies['now'];
    setTimeout: Dependencies['setTimeout'];
    clearTimeout: Dependencies['clearTimeout'];

    constructor({
        now: depNow,
        setTimeout: depSetTimeout,
        clearTimeout: depClearTimeout,
    }: Partial<Dependencies> = {}) {
        this._chunks = [];
        this._frame = 0;
        this._startTime = null;
        this._tickHandle = null;
        this.listeners = [];
        this.now = depNow || (() => Date.now());
        this.setTimeout =
            depSetTimeout ||
            ((fn: () => void, val: number) => setTimeout(fn, val));
        this.clearTimeout =
            depClearTimeout || ((val: number) => clearTimeout(val));
    }

    load(chunks: Chunk[]) {
        this._chunks = chunks;
        this.rewind();
    }

    addListener(f: Listener) {
        this.listeners.push(f);
    }

    removeListener(f: Listener) {
        this.listeners = this.listeners.filter(function (elem: Listener) {
            return f !== elem;
        });
    }

    play() {
        if (this._tickHandle !== null) {
            return true;
        }
        if (this._frame >= this._chunks.length) {
            return true;
        }
        this._emit('play');
        this._step();
        return false;
    }

    _emit(type: 'data', data: ListenerData): void;
    _emit(type: 'play' | 'pause' | 'rewind' | 'end'): void;
    _emit(
        type: 'data' | 'play' | 'pause' | 'rewind' | 'end',
        data?: ListenerData
    ) {
        let record: ListenerRecord;
        if (type === 'data') {
            record = { type, data: data! };
        } else {
            record = { type };
        }
        this.listeners.forEach((f) => {
            try {
                f(record);
            } catch (e) {
                // throw listener failure out-of-band
                this.setTimeout(function () {
                    throw e;
                }, 0);
            }
        });
    }

    pause() {
        if (this._tickHandle !== null) {
            this._emit('pause');
            this.clearTimeout(this._tickHandle);
            this._tickHandle = null;
            this._startTime = null;
        }
    }

    rewind() {
        this.pause();
        this._emit('rewind');
        this._frame = 0;
    }

    _step() {
        if (this._startTime === null) {
            this._startTime = this.now();
            if (this._frame < this._chunks.length) {
                this._startTime -= this._chunks[this._frame].ms;
            }
        }
        var now = this.now();
        var elapsed = now - this._startTime;
        var chunks = [];
        var frame = this._frame;
        var startIndex;
        let i;
        for (
            i = this._frame;
            i < this._chunks.length && this._chunks[i].ms <= elapsed;
            ++i
        ) {
            chunks.push(this._chunks[i]);
        }
        this._frame = i;
        chunks.forEach((chunk) => {
            this._emit('data', {
                data: chunk.data,
                ms: chunk.ms,
            });
        });
        if (this._frame < this._chunks.length) {
            const lastFrame = this._frame > 0 ? this._frame - 1 : 0;
            var delta = this._chunks[this._frame].ms - elapsed;
            this._tickHandle = this.setTimeout(() => this._step(), delta);
        } else {
            this._emit('end');
        }
    }
}
