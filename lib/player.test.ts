import assert from 'assert';
import { Player, Dependencies } from './player';

class Timer implements Dependencies {
    _now: number;
    id: number;
    events: Map<number, { ms: number; fn: () => void; cleared: boolean }>;

    constructor() {
        this.id = 0;
        this._now = 0;
        this.events = new Map();
    }

    now = () => {
        return this._now;
    };

    setTimeout = (f: () => void, ms: number) => {
        const when = this._now + ms;
        const event = {
            ms: when,
            fn: f,
            cleared: false,
        };
        const id = this.id++;
        this.events.set(id, event);
        return id;
    };

    clearTimeout = (id: number) => {
        const event = this.events.get(id);
        if (event) {
            event.cleared = true;
        }
    };

    advance(ms: number) {
        this._now += ms;
        for (let id = 0; id < this.id; ++id) {
            const event = this.events.get(id);
            if (event && !event.cleared && event.ms <= this._now) {
                this.events.delete(id);
                event.fn();
            }
        }
    }
}

const setup = () => {
    const timer = new Timer();
    const player = new Player(timer);
    const messages: any[] = [];
    player.addListener((msg) => messages.push(msg));
    player.load([
        {
            ms: 10,
            data: 'foo',
        },
        {
            ms: 20,
            data: 'bar',
        },
        {
            ms: 30,
            data: 'baz',
        },
        {
            ms: 40,
            data: 'bum',
        },
        {
            ms: 50,
            data: 'quz',
        },
    ]);
    return { timer, player, messages };
};

function test(name: string, fn: () => void) {
    console.log('TEST', name);
    fn();
}

test('does not play until played', () => {
    const { timer, player, messages } = setup();
    assert.deepEqual(
        [
            {
                type: 'rewind',
            },
        ],
        messages
    );
    timer.advance(20);
});

test('can play until end', () => {
    const { timer, player, messages } = setup();
    player.play();
    assert.deepEqual(
        [
            {
                type: 'rewind',
            },
            {
                type: 'play',
            },
            {
                type: 'data',
                data: {
                    data: 'foo',
                    ms: 10,
                },
            },
        ],
        messages
    );
    timer.advance(100);
    assert.deepEqual(
        [
            {
                type: 'rewind',
            },
            {
                type: 'play',
            },
            {
                type: 'data',
                data: {
                    data: 'foo',
                    ms: 10,
                },
            },
            {
                type: 'data',
                data: {
                    data: 'bar',
                    ms: 20,
                },
            },
            {
                type: 'data',
                data: {
                    data: 'baz',
                    ms: 30,
                },
            },
            {
                type: 'data',
                data: {
                    data: 'bum',
                    ms: 40,
                },
            },
            {
                type: 'data',
                data: {
                    data: 'quz',
                    ms: 50,
                },
            },
            { type: 'end' },
        ],
        messages
    );
});

test('plays up to timer', () => {
    const { timer, player, messages } = setup();
    player.play();
    assert.deepEqual(
        [
            {
                type: 'rewind',
            },
            {
                type: 'play',
            },
            {
                type: 'data',
                data: {
                    data: 'foo',
                    ms: 10,
                },
            },
        ],
        messages
    );
    timer.advance(15);
    assert.deepEqual(
        [
            {
                type: 'rewind',
            },
            {
                type: 'play',
            },
            {
                type: 'data',
                data: {
                    data: 'foo',
                    ms: 10,
                },
            },
            {
                type: 'data',
                data: {
                    data: 'bar',
                    ms: 20,
                },
            },
        ],
        messages
    );
});

test('can resume after timer', () => {
    const { timer, player, messages } = setup();
    player.play();
    assert.deepEqual(
        [
            {
                type: 'rewind',
            },
            {
                type: 'play',
            },
            {
                type: 'data',
                data: {
                    data: 'foo',
                    ms: 10,
                },
            },
        ],
        messages
    );
    timer.advance(10);
    timer.advance(10);
    assert.deepEqual(
        [
            {
                type: 'rewind',
            },
            {
                type: 'play',
            },
            {
                type: 'data',
                data: {
                    data: 'foo',
                    ms: 10,
                },
            },
            {
                type: 'data',
                data: {
                    data: 'bar',
                    ms: 20,
                },
            },
            {
                type: 'data',
                data: {
                    data: 'baz',
                    ms: 30,
                },
            },
        ],
        messages
    );
});

test('can pause and resume after timer', () => {
    const { timer, player, messages } = setup();
    player.play();
    timer.advance(15);
    assert.deepEqual(
        [
            {
                type: 'rewind',
            },
            {
                type: 'play',
            },
            {
                type: 'data',
                data: {
                    data: 'foo',
                    ms: 10,
                },
            },
            {
                type: 'data',
                data: {
                    data: 'bar',
                    ms: 20,
                },
            },
        ],
        messages
    );
    player.pause();
    assert.deepEqual(
        [
            {
                type: 'rewind',
            },
            {
                type: 'play',
            },
            {
                type: 'data',
                data: {
                    data: 'foo',
                    ms: 10,
                },
            },
            {
                type: 'data',
                data: {
                    data: 'bar',
                    ms: 20,
                },
            },
            {
                type: 'pause',
            },
        ],
        messages
    );
    timer.advance(100000);
    assert.deepEqual(
        [
            {
                type: 'rewind',
            },
            {
                type: 'play',
            },
            {
                type: 'data',
                data: {
                    data: 'foo',
                    ms: 10,
                },
            },
            {
                type: 'data',
                data: {
                    data: 'bar',
                    ms: 20,
                },
            },
            {
                type: 'pause',
            },
        ],
        messages
    );
    player.play();
    assert.deepEqual(
        [
            {
                type: 'rewind',
            },
            {
                type: 'play',
            },
            {
                type: 'data',
                data: {
                    data: 'foo',
                    ms: 10,
                },
            },
            {
                type: 'data',
                data: {
                    data: 'bar',
                    ms: 20,
                },
            },
            {
                type: 'pause',
            },
            {
                type: 'play',
            },
            {
                type: 'data',
                data: {
                    data: 'baz',
                    ms: 30,
                },
            },
        ],
        messages
    );
    timer.advance(10);
    assert.deepEqual(
        [
            {
                type: 'rewind',
            },
            {
                type: 'play',
            },
            {
                type: 'data',
                data: {
                    data: 'foo',
                    ms: 10,
                },
            },
            {
                type: 'data',
                data: {
                    data: 'bar',
                    ms: 20,
                },
            },
            {
                type: 'pause',
            },
            {
                type: 'play',
            },
            {
                type: 'data',
                data: {
                    data: 'baz',
                    ms: 30,
                },
            },
            {
                type: 'data',
                data: {
                    data: 'bum',
                    ms: 40,
                },
            },
        ],
        messages
    );
});
