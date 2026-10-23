"use strict";
const ownerGuard = require("../utils/ownerGuard");
module.exports = {
  config: { name:"طرد", aliases:["kick","remove"], category:"group", role:2, description:"طرد عضو عبر الرد على رسالته" },
  async run({api,event,threadID}) {
    if (!event.messageReply) return api.sendMessage("⚠️ ردّ على رسالة العضو الذي تريد طرده.",threadID);
    const targetID=String(event.messageReply.senderID||"");
    const botID=String(api.getCurrentUserID?.()||global.GoatBot?.botID||"");
    if(!targetID) return api.sendMessage("❌ تعذّر تحديد هوية العضو.",threadID);
    if(targetID===botID) return api.sendMessage("❌ لا أستطيع طرد نفسي.",threadID);
    if(ownerGuard.protectedIDs().has(targetID)) return api.sendMessage("🔒 لا يمكن طرد مالك البوت أو أحد مسؤولي البوت المحميين.",threadID);
    try {
      await ownerGuard.callApi(api,"removeUserFromGroup",targetID,String(threadID));
      return api.sendMessage("✅ تم تنفيذ طلب الطرد.",threadID);
    } catch(e) {
      return api.sendMessage("❌ فشل الطرد: "+(e?.message||e)+"\nتحقق من صلاحيات البوت في المجموعة.",threadID);
    }
  }
};