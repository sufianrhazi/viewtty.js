class UTF8Decoder {
    pendingCodePoint: number;
    emitter: (codePoint: string) => void;
    needed: number;

    constructor(emitter: (codePoint: string) => void) {
        this.pendingCodePoint = 0;
        this.emitter = emitter;
        this.needed = 0;
    }

    next(byte: number) {
        if (this.needed === 0) {
            if ((byte & 0x80) === 0) {
                this.emitter(String.fromCodePoint(byte));
            } else if ((byte & 0x40) === 0) {
                throw new Error('Bad UTF-8 Sequence: mismatch');
            } else if ((byte & 0x20) === 0) {
                this.needed = 1;
                this.pendingCodePoint = byte & 0x1f;
            } else if ((byte & 0x10) === 0) {
                this.needed = 2;
                this.pendingCodePoint = byte & 0x0f;
            } else if ((byte & 0x08) === 0) {
                this.needed = 3;
                this.pendingCodePoint = byte & 0x07;
            } else {
                throw new Error(
                    'Bad UTF-8 Sequence: 11110xxx not found at start'
                );
            }
        } else {
            if ((byte & 0b1100_0000) !== 0b1000_0000) {
                throw new Error(
                    'Bad UTF-8 Sequence: 10xxxxxx not found in trailing bytes'
                );
            }
            this.pendingCodePoint =
                (this.pendingCodePoint << 6) | (byte & 0x3f);
            this.needed -= 1;
            if (this.needed === 0) {
                if (this.pendingCodePoint > 0x10ffff) {
                    throw new Error('Bad UTF-8 Sequence: code point too large');
                }
                if (this.pendingCodePoint > 0xffff) {
                    var surrogate = this.pendingCodePoint - 0x010000;
                    var high = 0xd800 + ((surrogate & 0xffc00) >> 10);
                    var low = 0xdc00 + (surrogate & 0x003ff);
                    this.emitter(
                        String.fromCharCode(high) + String.fromCharCode(low)
                    );
                    this.pendingCodePoint = 0;
                } else {
                    this.emitter(String.fromCharCode(this.pendingCodePoint));
                    this.pendingCodePoint = 0;
                }
            }
        }
    }
}
// Tradeoff: the browser allows for UTF-8 decoding of binary data through the
// Blob and FileReader interface, but this is an asynchronous API.
// This synchronous UTF-8 decoder is the most reasonable path forward for now.
function decodeUtf8(arr: Uint8Array) {
    var result = '';
    for (var i = 0; i < arr.length; ++i) {
        var code: number = arr[i];
        var extraBytes;
        if (code & 0x80) {
            extraBytes = 0;
            if ((arr[i] & 0x40) === 0) {
                throw new Error('Bad UTF-8 Sequence: mismatch');
            } else if ((arr[i] & 0x20) === 0) {
                extraBytes = 1;
                code = arr[i] & 0x1f;
            } else if ((arr[i] & 0x10) === 0) {
                extraBytes = 2;
                code = arr[i] & 0x0f;
            } else if ((arr[i] & 0x08) === 0) {
                extraBytes = 3;
                code = arr[i] & 0x07;
            } else
                throw new Error(
                    'Bad UTF-8 Sequence: more than 6 additional chars'
                );
            const offset = i;
            for (var j = 0; j < extraBytes; ++j) {
                i++;
                if (i >= arr.length)
                    throw new Error('Bad UTF-8 Sequence: need more data');
                code = (code << 6) | (arr[i] & 0x3f);
            }
            if (code > 0x10ffff)
                throw new Error('Bad UTF-8 Sequence: code point too large');
            if (code > 0xffff) {
                var surrogate = code - 0x010000;
                var high = 0xd800 + ((surrogate & 0xffc00) >> 10);
                var low = 0xdc00 + (surrogate & 0x003ff);
                result += String.fromCharCode(high) + String.fromCharCode(low);
            } else {
                result += String.fromCharCode(code);
            }
        } else {
            result += String.fromCharCode(code);
        }
    }
    return result;
}

export class Parser {
    parse(buffer: ArrayBuffer) {
        // buffer is a list of header chunks followed by data chunks.
        // A header chunk is two 32-byte little-endian unsigned integers:
        // - seconds
        // - microseconds
        // A data chunk is one 32-byte little-endian unsigned integer:
        // - length
        // followed by `length` bytes of terminal input data.
        // We assume this data is UTF-8 encoded.
        var chunks: { ms: number; data: string }[] = [];
        var startTime = null;
        var chunk = '';
        var decoder = new UTF8Decoder((str) => {
            chunk += str;
        });
        for (var offset = 0; offset < buffer.byteLength; ) {
            var header = new Uint32Array(buffer.slice(offset + 0, offset + 12));
            var sec = header[0];
            var usec = header[1];
            var len = header[2];
            var ms;
            if (startTime === null) {
                startTime = sec * 1000 + usec / 1000;
                ms = 0;
            } else {
                ms = sec * 1000 + usec / 1000 - startTime;
            }
            offset += 12;
            const byteArray = new Uint8Array(
                buffer.slice(offset + 0, offset + len)
            );
            chunk = '';
            for (let i = 0; i < len; ++i) {
                decoder.next(byteArray[i]);
            }
            offset += len;
            chunks.push({
                ms: ms,
                data: chunk,
            });
        }
        return chunks;
    }
}
