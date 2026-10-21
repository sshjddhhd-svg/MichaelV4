/** أمر: الاوامر — يعرض قائمة الأوامر */
"use strict";
module.exports = {
  config: { name: "الاوامر", aliases: ["الأوامر", "help"], category: "info", role: 0, description: "يعرض قائمة الأوامر" },
  onStart: async ({ message, prefix }) => {
    const seen = new Set(); const lines = [];
    for (const [, cmd] of global.GoatBot?.commands || []) {
      const n = cmd?.config?.name; if (!n || seen.has(n)) continue; seen.add(n);
      lines.push(`• ${prefix}${n} — ${cmd.config.description || ""}`);
    }
    return message.reply(`📜 قائمة الأوامر (${lines.length}):\n\n${lines.join("\n")}`);
  },
};
