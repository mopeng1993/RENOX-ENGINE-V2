const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const { loadStyle } = require('./styles');

// Use the binary bundled by ffmpeg-static — no system install needed
ffmpeg.setFfmpegPath(ffmpegStatic);

// ─── Output constants ─────────────────────────────────────────────────────────
const TARGET_W        = 1080;
const TARGET_H        = 1920;
const TARGET_FPS      = 30;
const TARGET_DURATION = 15;   // seconds

/**
 * Full edit pipeline.
 *
 * @param {string} inputPath   - Absolute path to downloaded source video
 * @param {string} outputPath  - Absolute path for encoded output
 * @param {string} styleName   - One of: sigma | cinematic | emotional | anime
 * @returns {Promise<{ duration: number }>}
 */
async function editVideo(inputPath, outputPath, styleName = 'sigma') {
  const meta  = await probeVideo(inputPath);
  const style = loadStyle(styleName);

  console.log(
    `📹 Input  : ${meta.width}×${meta.height} | ` +
    `${meta.duration.toFixed(1)}s | ${meta.fps}fps | ` +
    `audio:${meta.hasAudio} | horizontal:${meta.isHorizontal}`
  );

  // ── Timing ────────────────────────────────────────────────────────────────
  // Skip the first 30% of the video (avoids title cards / intros)
  const clipStart    = calcClipStart(meta.duration);
  const sourceSeg    = Math.min(TARGET_DURATION, meta.duration - clipStart);

  // Speed factor: compress or stretch the chosen segment to exactly 15s
  // Clamped so we never go below 0.8× (choppy) or above 2.0× (unreadable)
  const rawSpeed    = sourceSeg / TARGET_DURATION;
  const speedFactor = clamp(rawSpeed, 0.8, 2.0);

  // How many source seconds we need to read to fill 15s at that speed
  const readDuration = TARGET_DURATION * speedFactor;

  console.log(
    `🎬 Style  : ${styleName} | ` +
    `start:${clipStart.toFixed(1)}s | ` +
    `speed:${speedFactor.toFixed(2)}× | ` +
    `read:${readDuration.toFixed(1)}s`
  );

  // ── Filter graph ──────────────────────────────────────────────────────────
  const filterComplex = buildFilterComplex({
    meta, style, speedFactor,
  });

  // ── Encode ────────────────────────────────────────────────────────────────
  await runFFmpeg({
    inputPath,
    outputPath,
    clipStart,
    readDuration,
    filterComplex,
    speedFactor,
    hasAudio: meta.hasAudio,
  });

  // ── Verify output ─────────────────────────────────────────────────────────
  const outMeta = await probeVideo(outputPath);
  console.log(
    `✅ Output : ${outMeta.width}×${outMeta.height} | ${outMeta.duration.toFixed(1)}s`
  );

  return { duration: Math.round(outMeta.duration) };
}

// ─── Filter graph builder ─────────────────────────────────────────────────────

function buildFilterComplex({ meta, style, speedFactor }) {
  const { width, height, isHorizontal } = meta;
  const pts = (1 / speedFactor).toFixed(6);
  const filters = [];

  if (isHorizontal) {
    // ── Horizontal source → 9:16 with blurred background ──────────────────
    //
    // Layer 1 (bg): scale to fill 1080×1920, gaussian blur
    // Layer 2 (fg): scale to fit within 1080×1920 (letterboxed), centered
    // Composite: overlay fg on bg

    // Background: upscale to cover full canvas, then blur
    filters.push(
      `[0:v]scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=increase,` +
      `crop=${TARGET_W}:${TARGET_H},` +
      `gblur=sigma=28,` +
      `setsar=1` +
      `[bg]`
    );

    // Foreground: fit inside canvas preserving aspect ratio
    // 72% of canvas height gives breathing room around the subject
    const fgMaxH = Math.round(TARGET_H * 0.72);
    const fgMaxW = TARGET_W;
    // Calculate actual fg dimensions maintaining source AR
    let fgW = fgMaxW;
    let fgH = Math.round(fgMaxW * (height / width));
    if (fgH > fgMaxH) {
      fgH = fgMaxH;
      fgW = Math.round(fgMaxH * (width / height));
    }
    // Force even dimensions (required by libx264)
    fgW = fgW % 2 === 0 ? fgW : fgW - 1;
    fgH = fgH % 2 === 0 ? fgH : fgH - 1;

    const fgX = Math.round((TARGET_W - fgW) / 2);
    const fgY = Math.round((TARGET_H - fgH) / 2);

    filters.push(
      `[0:v]scale=${fgW}:${fgH},setsar=1[fg]`
    );

    // Composite
    filters.push(`[bg][fg]overlay=${fgX}:${fgY}[composed]`);

    // Color grade
    filters.push(`[composed]${style.colorFilter}[graded]`);

  } else {
    // ── Portrait / square source → scale+crop to exact 9:16 ───────────────
    filters.push(
      `[0:v]scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=increase,` +
      `crop=${TARGET_W}:${TARGET_H},` +
      `setsar=1` +
      `[scaled]`
    );
    filters.push(`[scaled]${style.colorFilter}[graded]`);
  }

  // Speed ramp + FPS normalisation (applied last so it affects final frame count)
  filters.push(`[graded]setpts=${pts}*PTS,fps=${TARGET_FPS}[out]`);

  return filters.join(';');
}

// ─── FFmpeg runner ────────────────────────────────────────────────────────────

function runFFmpeg({ inputPath, outputPath, clipStart, readDuration, filterComplex, speedFactor, hasAudio }) {
  return new Promise((resolve, reject) => {
    // atempo range: 0.5–2.0. For large speed factors chain two atempo filters.
    const audioFilters = buildAudioFilters(speedFactor);

    let cmd = ffmpeg(inputPath)
      .seekInput(clipStart)
      .duration(readDuration + 0.5)   // +0.5s buffer avoids off-by-one trim
      .complexFilter(filterComplex, 'out')
      .outputOptions([
        // Video
        '-map', '[out]',
        '-c:v', 'libx264',
        '-preset', 'veryfast',        // fast encode — suits Render Free CPU
        '-crf', '23',                 // good quality/size balance
        '-profile:v', 'baseline',     // max device compatibility
        '-level', '3.1',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',    // stream-optimised mp4
        '-t', String(TARGET_DURATION),
      ]);

    // Audio — only if source has audio track
    if (hasAudio) {
      cmd = cmd
        .outputOptions(['-map', '0:a?'])
        .audioFilters(audioFilters)
        .audioCodec('aac')
        .audioBitrate('128k');
    } else {
      cmd = cmd.outputOptions(['-an']);
    }

    cmd
      .output(outputPath)
      .on('start', (cmdLine) => {
        // Log truncated command for debugging
        console.log('▶ ffmpeg', cmdLine.slice(0, 140) + '…');
      })
      .on('progress', (p) => {
        if (p.percent != null) {
          process.stdout.write(`\r   encoding ${Math.min(100, Math.round(p.percent))}%`);
        }
      })
      .on('end', () => {
        process.stdout.write('\n');
        resolve();
      })
      .on('error', (err) => {
        process.stdout.write('\n');
        reject(new Error(`FFmpeg failed: ${err.message}`));
      })
      .run();
  });
}

// ─── Audio tempo filter builder ───────────────────────────────────────────────
// atempo accepts 0.5–2.0 only. For values outside that range, chain filters.

function buildAudioFilters(speed) {
  if (speed === 1.0) return 'atempo=1.0';

  const filters = [];
  let remaining = clamp(speed, 0.5, 4.0);

  if (remaining > 2.0) {
    // e.g. 3.0× → atempo=2.0,atempo=1.5
    while (remaining > 2.0) {
      filters.push('atempo=2.0');
      remaining /= 2.0;
    }
  } else if (remaining < 0.5) {
    while (remaining < 0.5) {
      filters.push('atempo=0.5');
      remaining /= 0.5;
    }
  }

  filters.push(`atempo=${remaining.toFixed(4)}`);
  return filters.join(',');
}

// ─── ffprobe wrapper ──────────────────────────────────────────────────────────

function probeVideo(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(new Error(`ffprobe failed: ${err.message}`));

      const vs = data.streams.find(s => s.codec_type === 'video');
      if (!vs) return reject(new Error('No video stream found in file'));

      // Parse FPS from fraction string e.g. "30000/1001"
      const [n, d] = (vs.r_frame_rate || vs.avg_frame_rate || '30/1')
        .split('/').map(Number);
      const fps = d ? n / d : 30;

      const width    = vs.width;
      const height   = vs.height;
      const duration = parseFloat(data.format.duration) || 0;

      resolve({
        width,
        height,
        duration,
        fps: Math.round(fps),
        hasAudio:     data.streams.some(s => s.codec_type === 'audio'),
        isHorizontal: width > height,
      });
    });
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Choose where to start the clip.
 * Skips the first 30% of the video (avoids intros/title cards).
 * Never starts so late that we run out of footage.
 */
function calcClipStart(totalDuration) {
  if (totalDuration <= TARGET_DURATION) return 0;
  const ideal   = totalDuration * 0.30;
  const maxStart = totalDuration - TARGET_DURATION;
  return Math.min(ideal, maxStart);
}

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

module.exports = { editVideo };
