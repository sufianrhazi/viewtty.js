"use strict";
function decodeUtf8(arr) {
  var result = "";
  for (var i = 0; i < arr.length; ++i) {
    var code = arr[i];
    var n;
    if (code & 128) {
      n = 0;
      if ((arr[i] & 64) === 0) {
        throw new Error("Bad UTF-8 Sequence: mismatch");
      } else if ((arr[i] & 32) === 0) {
        n = 1;
        code = arr[i] & 31;
      } else if ((arr[i] & 16) === 0) {
        n = 2;
        code = arr[i] & 15;
      } else if ((arr[i] & 8) === 0) {
        n = 3;
        code = arr[i] & 7;
      } else
        throw new Error(
          "Bad UTF-8 Sequence: more than 6 additional chars"
        );
      for (var j = 0; j < n; ++j) {
        i++;
        if (i >= arr.length)
          throw new Error("Bad UTF-8 Sequence: need more data");
        code = code << 6 | arr[i] & 63;
      }
      if (code > 1114111)
        throw new Error("Bad UTF-8 Sequence: code point too large");
      if (code > 65535) {
        var surrogate = code - 65536;
        var high = 55296 + ((surrogate & 1047552) >> 10);
        var low = 56320 + (surrogate & 1023);
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
  parse(buffer) {
    var chunks = [];
    var startTime = null;
    for (var offset = 0; offset < buffer.byteLength; ) {
      var header = new Uint32Array(buffer.slice(offset + 0, offset + 12));
      var sec = header[0];
      var usec = header[1];
      var len = header[2];
      var ms;
      if (startTime === null) {
        startTime = sec * 1e3 + usec / 1e3;
        ms = 0;
      } else {
        ms = sec * 1e3 + usec / 1e3 - startTime;
      }
      offset += 12;
      var data = decodeUtf8(
        new Uint8Array(buffer.slice(offset + 0, offset + len))
      );
      offset += len;
      chunks.push({
        ms,
        data
      });
    }
    return chunks;
  }
}
