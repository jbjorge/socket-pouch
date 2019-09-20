'use strict';

//Can't find original post, but this is close
//http://stackoverflow.com/questions/6965107/ (continues on next line)
//converting-between-strings-and-arraybuffers
export default function (buffer) {
  let binary = '';
  let bytes = new Uint8Array(buffer);
  let length = bytes.byteLength;
  for (let i = 0; i < length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return binary;
}