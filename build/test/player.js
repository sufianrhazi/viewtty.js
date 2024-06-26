"use strict";
export class Player {
  constructor() {
    this._chunks = null;
    this._frame = 0;
    this._startTime = null;
    this._tickHandle = null;
    this.listeners = [];
  }
  load(chunks) {
    this._chunks = chunks;
    this.rewind();
  }
  addListener(f) {
    this.listeners.push(f);
  }
  removeListener(f) {
    this.listeners = this.listeners.filter(function(elem) {
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
    this._emit("play");
    this._step();
    return false;
  }
  _emit(type, data) {
    this.listeners.forEach((f) => {
      try {
        f({
          type,
          data
        });
      } catch (e) {
        setTimeout(function() {
          throw e;
        }, 0);
      }
    });
  }
  pause() {
    if (this._tickHandle) {
      this._emit("pause");
      clearTimeout(this._tickHandle);
      this._tickHandle = null;
      this._startTime = null;
    }
  }
  rewind() {
    this.pause();
    this._emit("rewind");
    this._frame = 0;
  }
  _step() {
    var now;
    if (this._startTime === null) {
      this._startTime = (/* @__PURE__ */ new Date()).getTime() - this._chunks[this._frame].ms;
      now = this._startTime;
    } else {
      now = (/* @__PURE__ */ new Date()).getTime();
    }
    var dt = now - this._startTime;
    var chunks = [];
    var frame = this._frame;
    var startIndex;
    let i;
    for (i = this._frame; i < this._chunks.length && this._chunks[i].ms <= dt; ++i) {
      chunks.push(this._chunks[i]);
    }
    this._frame = i;
    chunks.forEach((chunk) => {
      this._emit("data", {
        data: chunk.data,
        frame,
        ms: chunk.ms
      });
    });
    if (this._frame < this._chunks.length) {
      var delta = this._chunks[this._frame].ms - dt;
      this._tickHandle = setTimeout(() => this._step(), delta);
    } else {
      this._emit("end");
    }
  }
}
