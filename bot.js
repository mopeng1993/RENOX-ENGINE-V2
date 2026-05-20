const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { editVideo } = require('./editor');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MAX_FILE_SIZE = 80 * 1024 * 1024; // 80MB
const MAX_DURATION = 180; // 3 minutes in seconds

if (!TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is not set');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// Ensure temp directories exist
['downloads', 'output'].forEach(dir => {
  const p = path.join(__dirname, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

console.log('🎬 RENOX ENGINE started');

// Per-user style memory (resets on restart — fine for MVP)
const userStyles = {};

// ─── Commands ────────────────────────────────────────────────────────────────

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `🎬 *RENOX ENGINE* — AI Video Editor\n\n` +
    `Send me any video and I'll auto-edit it into a 9:16 vertical short:\n` +
    `• 15 seconds · 30fps · 1080×1920\n` +
    `• Blurred background for horizontal videos\n` +
    `• Optimized for TikTok / Reels / Shorts\n\n` +
    `*Styles:*\n` +
    `  /style sigma — Bold & punchy _(default)_\n` +
    `  /style cinematic — Film grade\n` +
    `  /style emotional — Soft & warm\n` +
    `  /style anime — High contrast\n\n` +
    `*Limits:* 80MB · 3 minutes\n\n` +
    `Just send a video to get started 🚀`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `*RENOX ENGINE — Help*\n\n` +
    `1. Send a video (mp4, mov, avi, webm)\n` +
    `2. Bot detects orientation and auto-edits\n` +
    `3. Receive a 15s 9:16 vertical short\n\n` +
    `*Commands:*\n` +
    `/start — Welcome\n` +
    `/style <name> — Set style\n` +
    `/help — This message`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/style (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const style = match[1].trim().toLowerCase();
  const valid = ['sigma', 'cinematic', 'emotional', 'anime'];

  if (!valid.includes(style)) {
    return bot.sendMessage(chatId,
      `❌ Unknown style *${style}*\nChoose from: ${valid.join(', ')}`,
      { parse_mode: 'Markdown' }
    );
  }

  userStyles[chatId] = style;
  bot.sendMessage(chatId,
    `✅ Style set to *${style}*\nSend a video to apply it.`,
    { parse_mode: 'Markdown' }
  );
});

// ─── Video handler ────────────────────────────────────────────────────────────

bot.on('video', async (msg) => {
  await handleVideo(msg, false);
});

// Videos sent as files (uncompressed)
bot.on('document', async (msg) => {
  const doc = msg.document;
  const videoMimes = [
    'video/mp4', 'video/quicktime', 'video/x-msvideo',
    'video/webm', 'video/mpeg', 'video/x-matroska'
  ];
  if (doc && videoMimes.includes(doc.mime_type)) {
    await handleVideo(msg, true);
  }
});

async function handleVideo(msg, isDocument) {
  const chatId = msg.chat.id;
  const fileObj = isDocument ? msg.document : msg.video;

  // Size check
  if (fileObj.file_size && fileObj.file_size > MAX_FILE_SIZE) {
    return bot.sendMessage(chatId,
      `❌ File too large (${(fileObj.file_size / 1024 / 1024).toFixed(1)} MB)\nMax: 80 MB`
    );
  }

  // Duration check (only on video type, not document)
  if (!isDocument && msg.video.duration && msg.video.duration > MAX_DURATION) {
    return bot.sendMessage(chatId,
      `❌ Video too long (${msg.video.duration}s)\nMax: 3 minutes`
    );
  }

  const style = userStyles[chatId] || 'sigma';
  const ts = Date.now();
  const inputPath  = path.join(__dirname, 'downloads', `${chatId}_${ts}.mp4`);
  const outputPath = path.join(__dirname, 'output',    `${chatId}_${ts}_out.mp4`);

  // Status message
  const statusMsg = await bot.sendMessage(chatId,
    `⚙️ *RENOX ENGINE*\nStyle: *${style}*\n\n⏳ Downloading...`,
    { parse_mode: 'Markdown' }
  );

  try {
    // 1. Download
    await downloadFile(fileObj.file_id, inputPath);
    await updateStatus(chatId, statusMsg.message_id,
      `⚙️ *RENOX ENGINE*\nStyle: *${style}*\n\n🎞 Editing...`
    );

    // 2. Edit
    const result = await editVideo(inputPath, outputPath, style);
    await updateStatus(chatId, statusMsg.message_id,
      `⚙️ *RENOX ENGINE*\nStyle: *${style}*\n\n📤 Uploading...`
    );

    // 3. Send result
    await bot.sendVideo(chatId, outputPath, {
      caption:
        `✅ *RENOX ENGINE* — Done!\n\n` +
        `🎨 Style: *${style}*\n` +
        `📐 Format: 9:16 vertical\n` +
        `⏱ Duration: ${result.duration}s\n` +
        `🎞 FPS: 30\n` +
        `📱 Optimized for TikTok · Reels · Shorts`,
      parse_mode: 'Markdown',
      supports_streaming: true,
    });

    await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});

  } catch (err) {
    console.error('Processing error:', err);
    await updateStatus(chatId, statusMsg.message_id,
      `❌ *Error processing video*\n\`${err.message}\`\n\nPlease try again.`
    );
  } finally {
    // Always clean up temp files
    for (const f of [inputPath, outputPath]) {
      if (fs.existsSync(f)) fs.unlink(f, () => {});
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function downloadFile(fileId, destPath) {
  const fileInfo = await bot.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${fileInfo.file_path}`;

  return new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(destPath);
    https.get(fileUrl, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
      }
      res.pipe(dest);
      dest.on('finish', () => dest.close(resolve));
      dest.on('error', reject);
    }).on('error', reject);
  });
}

async function updateStatus(chatId, msgId, text) {
  try {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: 'Markdown',
    });
  } catch (_) {
    // Ignore edit failures (message too old, not modified, etc.)
  }
}

// ─── Render Free keep-alive ───────────────────────────────────────────────────
// Render Free spins down after 15 min of inactivity.
// Self-ping every 14 min prevents that.

if (process.env.RENDER_EXTERNAL_URL) {
  const keepAliveUrl = process.env.RENDER_EXTERNAL_URL;
  setInterval(() => {
    https.get(keepAliveUrl, (res) => {
      console.log(`🏓 Keep-alive ping: ${res.statusCode}`);
    }).on('error', (e) => {
      console.warn('Keep-alive ping failed:', e.message);
    });
  }, 14 * 60 * 1000);
}

// ─── Health check HTTP server (required by Render) ───────────────────────────

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    engine: 'RENOX ENGINE',
    version: '1.0.0',
    uptime: Math.floor(process.uptime()),
  }));
}).listen(PORT, () => {
  console.log(`🌐 Health server listening on port ${PORT}`);
});
