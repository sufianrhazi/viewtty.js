function Player() {
    this._chunks = null;
    this._frame = 0;
    this._startTime = null;;
    this._tickHandle = null;
    this.listeners = [];
}
Player.prototype.load = function (chunks) {
    this._chunks = chunks;
    this.rewind();
};
Player.prototype.addListener = function (f) {
    this.listeners.push(f);
};
Player.prototype.removeListener = function (f) {
    this.listeners = this.listeners.filter(function (elem) {
        return f !== elem;
    });
};
Player.prototype.play = function play() {
    if (this._tickHandle) {
        return true;
    }
    if (this._frame >= this._chunks.length) {
        return true;
    }
    this._emit('play');
    this._step();
    return false;
};
Player.prototype._emit = function _emit(type, data) {
    this.listeners.forEach(function (f) {
        try {
            f({
                type: type,
                data: data
            });
        } catch (e) {
            // throw listener failure out-of-band
            setTimeout(function () { throw e; }, 0);
        }
    }.bind(this));
};
Player.prototype.pause = function pause() {
    if (this._tickHandle) {
        this._emit('pause');
        clearTimeout(this._tickHandle);
        this._tickHandle = null;
        this._startTime = null;
    }
};
Player.prototype.rewind = function rewind() {
    this.pause();
    this._emit('rewind');
    this._frame = 0;
};
Player.prototype._step = function _step() {
    var now;
    if (this._startTime === null) {
        this._startTime = (new Date()).getTime() - this._chunks[this._frame].ms;
        now = this._startTime;
    } else {
        now = (new Date()).getTime();
    }
    var chunks = [];
    var frame = this._frame;
    var startIndex;
    for (i = this._frame; i < this._chunks.length && this._chunks[i].ms <= now - this._startTime; ++i) {
        chunks.push(this._chunks[i]);
    }
    this._frame = i;
    chunks.forEach(function (chunk) {
        this._emit('data', {
            data: chunk.data, 
            frame: frame,
            ms: chunk.ms
        });
    }.bind(this));
    if (this._frame < this._chunks.length) {
        var delta = this._chunks[i].ms - now; 
        this._tickHandle = setTimeout(this._step.bind(this), delta);
    } else {
        this._emit('end');
    }
};

module.exports = Player;
