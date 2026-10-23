"use strict";
module.exports = {
  config: { name:"uid", aliases:["id"], category:"info", role:0, description:"عرض معرّف المستخدم والمحادثة" },
  run({api,event,threadID,senderID}) {
    const mentions=event.mentions||{};
    const ids=Object.keys(mentions);
    const text=ids.length ? "🆔 معرّفات المستخدمين:\n"+ids.map(id=>`• ${mentions[id]}: ${id}`).join("\n") : `🆔 معرّفك: ${senderID}\n💬 معرّف المحادثة: ${threadID}`;
    return api.sendMessage(text,threadID);
  }
};