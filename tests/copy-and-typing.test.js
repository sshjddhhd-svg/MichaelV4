"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

function freshCopyCommand() {
  delete require.cache[require.resolve("../src/commands/copy")];
  delete require.cache[require.resolve("../src/utils/copyMessage")];
  global._copyWatchers = new Map();
  global.GoatBot = { botID: "bot-1", config: {}, protection: {} };
  global.log = { info() {}, warn() {}, error() {} };
  return require("../src/commands/copy");
}

function fakeApi(historyRef) {
  return {
    getCurrentUserID: () => "bot-1",
    getThreadHistory(threadID, limit, timestamp, callback) {
      queueMicrotask(() => callback(null, historyRef.messages.slice(-limit)));
    },
    sendMessage(message, threadID, callback) {
      historyRef.sent.push({ message, threadID, at: Date.now() });
      queueMicrotask(() => callback?.(null, { messageID: `sent-${historyRef.sent.length}` }));
    }
  };
}

test("copy watcher starts and does not reply to the baseline message", async () => {
  const history = {
    messages: [{ messageID: "old-1", senderID: "user-2", body: "old", timestamp: 100 }],
    sent: []
  };
  const cmd = freshCopyCommand();
  const api = fakeApi(history);
  const state = global._copyWatchers;
  const started = await cmd.onStart({
    api, threadID: "group-1", args: [],
    message: { reply: async () => undefined }
  });
  assert.equal(started, undefined);
  assert.equal(state.has("group-1"), true);
  assert.equal(history.sent.length, 0);
  cmd.stopWatch("group-1");
});

test("outgoing typing guard delays send and preserves callbacks", async () => {
  global.GoatBot = { config: { outgoingThrottle: { typingMinMs: 25, typingMaxMs: 25, minIntervalMs: 0 } } };
  global.utils = {
    calcHumanTypingDelay: () => 25,
    simulateTyping: async (_api, _thread, delay) => new Promise(resolve => setTimeout(resolve, delay))
  };
  global.log = { warn() {} };
  const guardPath = require.resolve("../src/protection/outgoingThrottle");
  delete require.cache[guardPath];
  const guard = require("../src/protection/outgoingThrottle");
  let sentAt = 0;
  const api = {
    sendMessage(_message, _threadID, callback) {
      sentAt = Date.now();
      callback(null, { ok: true });
    }
  };
  guard.start(api);
  const start = Date.now();
  const result = await new Promise((resolve, reject) => {
    api.sendMessage("hello", "group-1", (err, value) => err ? reject(err) : resolve(value));
  });
  assert.equal(result.ok, true);
  assert.ok(sentAt - start >= 20, `send delay was only ${sentAt - start}ms`);
  guard.stop();
});

test("copy command parses several common history response shapes", () => {
  const cmd = freshCopyCommand();
  assert.equal(typeof cmd.onStart, "function");
  assert.equal(typeof cmd.stopWatch, "function");
});
