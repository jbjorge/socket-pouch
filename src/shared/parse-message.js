'use strict';

function parseMessage(msg, numArgs) {
  let res = [];
  for (let i = 0; i < numArgs - 1; i++) {
    let idx = msg.indexOf(':');
    res.push(msg.substring(0, idx));
    msg = msg.substring(idx + 1);
  }
  res.push(msg);
  return res;
}

module.exports = parseMessage;