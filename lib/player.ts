export class Player {
    _chunks: any;
    _frame: any;
    _startTime: any;
    _tickHandle: any;
    listeners: any;

    constructor() {
        this._chunks = null;
        this._frame = 0;
        this._startTime = null;
        this._tickHandle = null;
        this.listeners = [];
    }

    load(chunks: any) {
        this._chunks = chunks;
        this.rewind();
    }

    addListener(f: any) {
        this.listeners.push(f);
    }

    removeListener(f: any) {
        this.listeners = this.listeners.filter(function (elem: any) {
            return f !== elem;
        });
    }

    play() {
        if (this._tickHandle) {
            return true;
        }
        if (this._frame >= this._chunks.length) {
            return true;
        }
        this._emit('play');
        this._step();
        return false;
    }

    _emit(type: any, data?: any) {
        this.listeners.forEach((f: any) => {
            try {
                f({
                    type: type,
                    data: data,
                });
            } catch (e) {
                // throw listener failure out-of-band
                setTimeout(function () {
                    throw e;
                }, 0);
            }
        });
    }

    pause() {
        if (this._tickHandle) {
            this._emit('pause');
            clearTimeout(this._tickHandle);
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
            this._startTime = this._chunks[this._frame].ms;
        }
        var now = this._chunks[this._frame].ms;
        var dt = now - this._startTime;
        var chunks = [];
        var frame = this._frame;
        var startIndex;
        let i;
        for (
            i = this._frame;
            i < this._chunks.length && this._chunks[i].ms <= dt;
            ++i
        ) {
            chunks.push(this._chunks[i]);
        }
        this._frame = i;
        chunks.forEach((chunk) => {
            this._emit('data', {
                data: chunk.data,
                frame: frame,
                ms: chunk.ms,
            });
        });
        if (this._frame < this._chunks.length) {
            var delta = this._chunks[this._frame].ms - dt;
            this._tickHandle = setTimeout(() => this._step(), delta);
        } else {
            this._emit('end');
        }
    }
}
