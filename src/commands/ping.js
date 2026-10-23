"use strict";
module.exports = {
  config: { name:"ping", aliases:["p"], category:"info", role:0, description:"قياس زمن استجابة البوت" },
  async run({api,threadID}) {
    const start=Date.now();
    const done=(err)=>api.sendMessage(err ? "❌ تعذر قياس الاستجابة." : `🏓 Pong! زمن الاستجابة: ${Date.now()-start}ms`,threadID);
    try { const ret=api.sendMessage("🏓 جارٍ القياس…",threadID,(err,info)=>{
      if(err) return done(err);
      if(info?.messageID && typeof api.editMessage==="function") {
        try { api.editMessage(`🏓 Pong! ${Date.now()-start}ms`,info.messageID,(editErr)=>{if(editErr) done(editErr);}); }
        catch { done(null); }
      } else done(null);
    }); if(ret&&typeof ret.then==="function") ret.catch(()=>done(new Error("send failed"))); }
    catch { done(new Error("send failed")); }
  }
};