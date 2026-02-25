// src/services/format.js

// Konwertuj Markdown z Claude na Slack mrkdwn
function toSlackMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '*$1*')       // bold: ** → *
    .replace(/^### (.*$)/gm, '*$1*')          // h3 → bold
    .replace(/^## (.*$)/gm, '*$1*')           // h2 → bold
    .replace(/^# (.*$)/gm, '*$1*')            // h1 → bold
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>');  // linki
}

module.exports = { toSlackMarkdown };
