/**
 * 视频缩略图截取工具
 * 前端使用 <video> + <canvas> 截取视频第一帧作为缩略图
 */

/**
 * 从视频文件中截取指定时间的帧
 * @param videoFile 视频文件
 * @param time 截取时间点（秒），默认 0.5 跳过纯黑首帧
 * @returns JPEG Blob
 */
export async function extractVideoThumbnail(
  videoFile: File,
  time: number = 0.5
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const url = URL.createObjectURL(videoFile);
    video.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
    };

    video.onloadedmetadata = () => {
      // 如果视频时长短于截取时间，从 0 开始
      video.currentTime = Math.min(time, video.duration * 0.1);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        const maxDim = 320; // 缩略图最大尺寸，节省存储
        const scale = Math.min(maxDim / video.videoWidth, maxDim / video.videoHeight, 1);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          reject(new Error("Canvas context failed"));
          return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            cleanup();
            if (blob) resolve(blob);
            else reject(new Error("toBlob failed"));
          },
          "image/jpeg",
          0.8
        );
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Video load failed"));
    };

    // 超时保护：5 秒内未完成则放弃截帧
    setTimeout(() => {
      cleanup();
      reject(new Error("Video thumbnail extraction timeout"));
    }, 5000);
  });
}
