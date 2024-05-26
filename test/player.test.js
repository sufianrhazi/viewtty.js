// lib/player.test.ts
import assert from "assert";

// lib/player.ts
var Player = class {
  constructor({
    now: depNow,
    setTimeout: depSetTimeout,
    clearTimeout: depClearTimeout
  } = {}) {
    this._chunks = [];
    this._frame = 0;
    this._startTime = null;
    this._tickHandle = null;
    this.listeners = [];
    this.now = depNow || (() => Date.now());
    this.setTimeout = depSetTimeout || setTimeout;
    this.clearTimeout = depClearTimeout || clearTimeout;
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
    if (this._tickHandle !== null) {
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
    let record;
    if (type === "data") {
      record = { type, data };
    } else {
      record = { type };
    }
    this.listeners.forEach((f) => {
      try {
        f(record);
      } catch (e) {
        this.setTimeout(function() {
          throw e;
        }, 0);
      }
    });
  }
  pause() {
    if (this._tickHandle !== null) {
      this._emit("pause");
      this.clearTimeout(this._tickHandle);
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
    for (i = this._frame; i < this._chunks.length && this._chunks[i].ms <= elapsed; ++i) {
      chunks.push(this._chunks[i]);
    }
    this._frame = i;
    chunks.forEach((chunk) => {
      this._emit("data", {
        data: chunk.data,
        ms: chunk.ms
      });
    });
    if (this._frame < this._chunks.length) {
      const lastFrame = this._frame > 0 ? this._frame - 1 : 0;
      var delta = this._chunks[this._frame].ms - elapsed;
      this._tickHandle = this.setTimeout(() => this._step(), delta);
    } else {
      this._emit("end");
    }
  }
};

// lib/player.test.ts
var Timer = class {
  constructor() {
    this.now = () => {
      return this._now;
    };
    this.setTimeout = (f, ms) => {
      const when = this._now + ms;
      const event = {
        ms: when,
        fn: f,
        cleared: false
      };
      const id = this.id++;
      this.events.set(id, event);
      return id;
    };
    this.clearTimeout = (id) => {
      const event = this.events.get(id);
      if (event) {
        event.cleared = true;
      }
    };
    this.id = 0;
    this._now = 0;
    this.events = /* @__PURE__ */ new Map();
  }
  advance(ms) {
    this._now += ms;
    for (let id = 0; id < this.id; ++id) {
      const event = this.events.get(id);
      if (event && !event.cleared && event.ms <= this._now) {
        this.events.delete(id);
        event.fn();
      }
    }
  }
};
var setup = () => {
  const timer = new Timer();
  const player = new Player(timer);
  const messages = [];
  player.addListener((msg) => messages.push(msg));
  player.load([
    {
      ms: 10,
      data: "foo"
    },
    {
      ms: 20,
      data: "bar"
    },
    {
      ms: 30,
      data: "baz"
    },
    {
      ms: 40,
      data: "bum"
    },
    {
      ms: 50,
      data: "quz"
    }
  ]);
  return { timer, player, messages };
};
function test(name, fn) {
  console.log("TEST", name);
  fn();
}
test("does not play until played", () => {
  const { timer, player, messages } = setup();
  assert.deepEqual(
    [
      {
        type: "rewind"
      }
    ],
    messages
  );
  timer.advance(20);
});
test("can play until end", () => {
  const { timer, player, messages } = setup();
  player.play();
  assert.deepEqual(
    [
      {
        type: "rewind"
      },
      {
        type: "play"
      },
      {
        type: "data",
        data: {
          data: "foo",
          ms: 10
        }
      }
    ],
    messages
  );
  timer.advance(100);
  assert.deepEqual(
    [
      {
        type: "rewind"
      },
      {
        type: "play"
      },
      {
        type: "data",
        data: {
          data: "foo",
          ms: 10
        }
      },
      {
        type: "data",
        data: {
          data: "bar",
          ms: 20
        }
      },
      {
        type: "data",
        data: {
          data: "baz",
          ms: 30
        }
      },
      {
        type: "data",
        data: {
          data: "bum",
          ms: 40
        }
      },
      {
        type: "data",
        data: {
          data: "quz",
          ms: 50
        }
      },
      { type: "end" }
    ],
    messages
  );
});
test("plays up to timer", () => {
  const { timer, player, messages } = setup();
  player.play();
  assert.deepEqual(
    [
      {
        type: "rewind"
      },
      {
        type: "play"
      },
      {
        type: "data",
        data: {
          data: "foo",
          ms: 10
        }
      }
    ],
    messages
  );
  timer.advance(15);
  assert.deepEqual(
    [
      {
        type: "rewind"
      },
      {
        type: "play"
      },
      {
        type: "data",
        data: {
          data: "foo",
          ms: 10
        }
      },
      {
        type: "data",
        data: {
          data: "bar",
          ms: 20
        }
      }
    ],
    messages
  );
});
test("can resume after timer", () => {
  const { timer, player, messages } = setup();
  player.play();
  assert.deepEqual(
    [
      {
        type: "rewind"
      },
      {
        type: "play"
      },
      {
        type: "data",
        data: {
          data: "foo",
          ms: 10
        }
      }
    ],
    messages
  );
  timer.advance(10);
  timer.advance(10);
  assert.deepEqual(
    [
      {
        type: "rewind"
      },
      {
        type: "play"
      },
      {
        type: "data",
        data: {
          data: "foo",
          ms: 10
        }
      },
      {
        type: "data",
        data: {
          data: "bar",
          ms: 20
        }
      },
      {
        type: "data",
        data: {
          data: "baz",
          ms: 30
        }
      }
    ],
    messages
  );
});
test("can pause and resume after timer", () => {
  const { timer, player, messages } = setup();
  player.play();
  timer.advance(15);
  assert.deepEqual(
    [
      {
        type: "rewind"
      },
      {
        type: "play"
      },
      {
        type: "data",
        data: {
          data: "foo",
          ms: 10
        }
      },
      {
        type: "data",
        data: {
          data: "bar",
          ms: 20
        }
      }
    ],
    messages
  );
  player.pause();
  assert.deepEqual(
    [
      {
        type: "rewind"
      },
      {
        type: "play"
      },
      {
        type: "data",
        data: {
          data: "foo",
          ms: 10
        }
      },
      {
        type: "data",
        data: {
          data: "bar",
          ms: 20
        }
      },
      {
        type: "pause"
      }
    ],
    messages
  );
  timer.advance(1e5);
  assert.deepEqual(
    [
      {
        type: "rewind"
      },
      {
        type: "play"
      },
      {
        type: "data",
        data: {
          data: "foo",
          ms: 10
        }
      },
      {
        type: "data",
        data: {
          data: "bar",
          ms: 20
        }
      },
      {
        type: "pause"
      }
    ],
    messages
  );
  player.play();
  assert.deepEqual(
    [
      {
        type: "rewind"
      },
      {
        type: "play"
      },
      {
        type: "data",
        data: {
          data: "foo",
          ms: 10
        }
      },
      {
        type: "data",
        data: {
          data: "bar",
          ms: 20
        }
      },
      {
        type: "pause"
      },
      {
        type: "play"
      },
      {
        type: "data",
        data: {
          data: "baz",
          ms: 30
        }
      }
    ],
    messages
  );
  timer.advance(10);
  assert.deepEqual(
    [
      {
        type: "rewind"
      },
      {
        type: "play"
      },
      {
        type: "data",
        data: {
          data: "foo",
          ms: 10
        }
      },
      {
        type: "data",
        data: {
          data: "bar",
          ms: 20
        }
      },
      {
        type: "pause"
      },
      {
        type: "play"
      },
      {
        type: "data",
        data: {
          data: "baz",
          ms: 30
        }
      },
      {
        type: "data",
        data: {
          data: "bum",
          ms: 40
        }
      }
    ],
    messages
  );
});
