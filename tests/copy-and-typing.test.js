"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

function freshCopyCommand() {
  delete require.cache[require.resolve("../src/commands/copy")];
  delete require.cache[require.resolve("../src/utils/copyMessage")];
  global._dracarysAutoJobs = new Map();
  global.GoatBot = { botID: "bot-1", config: {}, protection: {} };
  global.log = { info() {}, warn() {}, error() {} };
  return require("../src/commands/copy");
}

function fakeApi(historyRef) {
  return {
    getCurrentUserID: () => "bot-1",
    sendMessage(message, threadID, callback) {
      historyRef.sent.push({ message, threadID, at: Date.now() });
      queueMicrotask(() => callback?.(null, { messageID: `sent-${historyRef.sent.length}` }));
    }
  };
}

test("copy command starts automatic sending with a short confirmation", async () => {
  const history = { sent: [] };
  const cmd = freshCopyCommand();
  const api = fakeApi(history);
  const replies = [];
  await cmd.onStart({
    api, threadID: "group-1", args: [],
    message: { reply: async text => replies.push(text) }
  });

  assert.equal(global._dracarysAutoJobs.has("group-1"), true);
  assert.deepEqual(replies, ["تم تفعيل مراقبة المجموعة"]);
  assert.equal(history.sent.length, 0, "first automatic message must wait 20–35 seconds");
  cmd.stopWatch("group-1");
  assert.equal(global._dracarysAutoJobs.has("group-1"), false);
});

test("copy command does not create duplicate automatic jobs for the same group", async () => {
  const history = { sent: [] };
  const cmd = freshCopyCommand();
  const api = fakeApi(history);
  const replies = [];
  const ctx = {
    api, threadID: "group-2", args: [],
    message: { reply: async text => replies.push(text) }
  };

  await cmd.onStart(ctx);
  await cmd.onStart(ctx);
  assert.equal(global._dracarysAutoJobs.size, 1);
  assert.deepEqual(replies, [
    "تم تفعيل مراقبة المجموعة",
    "الإرسال التلقائي يعمل بالفعل بهذه المجموعة"
  ]);
  cmd.stopWatch("group-2");
});

test("stop command stops the active automatic job and keeps confirmation short", async () => {
  const cmd = freshCopyCommand();
  const api = fakeApi({ sent: [] });
  const replies = [];
  await cmd.onStart({
    api, threadID: "group-3", args: [],
    message: { reply: async text => replies.push(text) }
  });

  const stop = require("../src/commands/stop");
  await stop.onStart({
    threadID: "group-3",
    message: { reply: async text => replies.push(text) }
  });
  assert.equal(global._dracarysAutoJobs.has("group-3"), false);
  assert.equal(replies.at(-1), "تم ايقاف المراقبة بهذه المجموعة");
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
