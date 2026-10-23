"use strict";
module.exports = {
  config: { name:"uptime", aliases:["up"], category:"info", role:0, description:"مدة تشغيل البوت" },
  run({api,threadID}) {
    const s=Math.floor(process.uptime()), d=Math.floor(s/86400), h=Math.floor(s%86400/3600), m=Math.floor(s%3600/60), sec=s%60;
    const parts=[]; if(d)parts.push(d+" يوم"); if(h)parts.push(h+" ساعة"); if(m)parts.push(m+" دقيقة"); parts.push(sec+" ثانية");
    return api.sendMessage("⏱️ مدة التشغيل: "+parts.join(" "),threadID);
  }
};