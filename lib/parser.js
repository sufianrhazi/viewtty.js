// Tradeoff: the browser allows for UTF-8 decoding of binary data through the
// Blob and FileReader interface, but this is an asynchronous API.
// This synchronous UTF-8 decoder is the most reasonable path forward.
function decodeUtf8(arr) {
    var result = '';
    for (var i = 0; i < arr.length; ++i) {
        var code = arr[i];
        var n;
        if (code & 0x80) {
            n = 0;
            if      ((arr[i] & 0x40) === 0) { throw new Error('Bad UTF-8 Sequence: mismatch'); }
            else if ((arr[i] & 0x20) === 0) { n = 1; code = arr[i] & 0x1F; }
            else if ((arr[i] & 0x10) === 0) { n = 2; code = arr[i] & 0x0F; }
            else if ((arr[i] & 0x08) === 0) { n = 3; code = arr[i] & 0x07; }
            else throw new Error('Bad UTF-8 Sequence: more than 6 additional chars');
            for (var j = 0; j < n; ++j) {
                i++;
                if (i >= arr.length) throw new Error('Bad UTF-8 Sequence: need more data');
                code = (code << 6) | arr[i] & 0x3F;
            }
            if (code > 0x10FFFF) throw new Error('Bad UTF-8 Sequence: code point too large');
            if (code > 0xFFFF) {
                var surrogate = code - 0x010000;
                var high = 0xD800 + ((surrogate & 0xFFC00) >> 10);
                var low  = 0xDC00 + (surrogate & 0x003FF);
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

function Parser() {
}
Parser.prototype.parse = function (buffer) {
    // buffer is a list of header chunks followed by data chunks. 
    // A header chunk is two 32-byte little-endian unsigned integers:
    // - seconds
    // - microseconds
    // A data chunk is one 32-byte little-endian unsigned integer:
    // - length
    // followed by `length` bytes of terminal input data.
    // We assume this data is UTF-8 encoded.
    var chunks = [];
    var startTime = null;
    for (var offset = 0; offset < buffer.byteLength; ) {
        var header = new Uint32Array(buffer.slice(offset + 0, offset + 12));
        var sec = header[0];
        var usec = header[1];
        var len = header[2];
        var ms;
        if (startTime === null) {
            startTime = (sec * 1000) + (usec / 1000);
            ms = 0;
        } else {
            ms = (sec * 1000) + (usec / 1000) - startTime;
        }
        offset += 12;
        var data = decodeUtf8(new Uint8Array(buffer.slice(offset + 0, offset + len)));
        offset += len;
        chunks.push({
            ms: ms,
            data: data
        });
    }
    return chunks;
};
module.exports = Parser;
