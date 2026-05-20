const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const ffprobePath = require("ffprobe-static").path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// 自动创建文件夹
if (!fs.existsSync("./downloads")) {
  fs.mkdirSync("./downloads");
}

if (!fs.existsSync("./output")) {
  fs.mkdirSync("./output");
}

// 风格加载
const STYLES = require("./styles");

async function editVideo(inputPath, outputPath, styleName = "sigma") {

  return new Promise((resolve, reject) => {

    ffmpeg.ffprobe(inputPath, (err, metadata) => {

      if (err) {
        return reject(err);
      }

      const videoStream = metadata.streams.find(
        s => s.codec_type === "video"
      );

      const width = videoStream.width;
      const height = videoStream.height;

      const isHorizontal = width > height;

      const style = STYLES[styleName] || STYLES["sigma"];

      let videoFilter = "";

      // 横屏
      if (isHorizontal) {

        videoFilter = `
[0:v]scale=1080:1920:force_original_aspect_ratio=increase,
boxblur=20:10,crop=1080:1920[bg];

[0:v]scale=1080:-1:force_original_aspect_ratio=decrease[fg];

[bg][fg]overlay=(W-w)/2:(H-h)/2,
${style.colorFilter},
setpts=0.9*PTS,
fps=30
`;

      } else {

        // 竖屏
        videoFilter = `
scale=1080:1920:force_original_aspect_ratio=increase,
crop=1080:1920,
${style.colorFilter},
setpts=0.9*PTS,
fps=30
`;

      }

      ffmpeg(inputPath)

        .videoFilters(videoFilter)

        .audioFilters("atempo=1.05")

        .duration(15)

        .videoCodec("libx264")

        .outputOptions([
          "-preset veryfast",
          "-profile:v baseline",
          "-movflags +faststart",
          "-pix_fmt yuv420p"
        ])

        .size("1080x1920")

        .save(outputPath)

        .on("end", () => {

          console.log("✅ Edit complete");

          resolve(outputPath);

        })

        .on("error", (error) => {

          console.error("❌ FFMPEG ERROR:", error);

          reject(error);

        });

    });

  });

}

module.exports = {
  editVideo
};
