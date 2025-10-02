import axios from "axios";
import { URL } from "url";

export default async function handler(req, res) {
  const { id, url } = req.query;

  if (!id && !url) {
    return res.status(400).json({ error: "Please provide either id or url" });
  }

  try {
    let masterM3u8Url = null;

    if (id) {
      const metadataUrl = `https://www.dailymotion.com/player/metadata/video/${id}`;
      const metadataResponse = await axios.get(metadataUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "application/json",
          "Referer": "https://www.dailymotion.com"
        }
      });

      const qualities = metadataResponse.data?.qualities || null;

      if (qualities) {
        // 1. حاول auto
        if (qualities.auto?.[0]?.url) {
          masterM3u8Url = qualities.auto[0].url;
        } else {
          // 2. لف على باقي المفاتيح (240, 480, 720...)
          for (const q of Object.keys(qualities)) {
            const arr = qualities[q];
            if (Array.isArray(arr)) {
              for (const item of arr) {
                if (item.url && item.url.includes(".m3u8")) {
                  masterM3u8Url = item.url;
                  break;
                }
              }
            }
            if (masterM3u8Url) break;
          }
        }
      }
    }

    if (url) {
      masterM3u8Url = url;
    }

    if (!masterM3u8Url) {
      return res.status(404).json({ error: "Could not find master m3u8 URL in metadata" });
    }

    // Fetch master playlist
    const m3u8Response = await axios.get(masterM3u8Url, {
      responseType: "text",
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const m3u8Content = m3u8Response.data;
    const lines = m3u8Content.split("\n");
    const masterBaseUrl = masterM3u8Url.substring(0, masterM3u8Url.lastIndexOf("/") + 1);

    const qualityUrls = {};
    const nameRegex = /NAME="([^"]*)"/;

    for (let i = 0; i < lines.length; i++) {
      const trimmedLine = lines[i].trim();
      if (trimmedLine.startsWith("#EXT-X-STREAM-INF:")) {
        const match = trimmedLine.match(nameRegex);
        const qualityName = match?.[1] || `q${i}`;
        if (i + 1 < lines.length) {
          const urlLine = lines[i + 1].trim();
          if (!urlLine.startsWith("#") && urlLine.includes(".m3u8")) {
            let targetUrl = urlLine.startsWith("http")
              ? urlLine
              : new URL(urlLine, masterBaseUrl).href;
            qualityUrls[qualityName] = targetUrl.replace(/#cell=\w+$/, "");
          }
        }
      }
    }

    return res.status(200).json(qualityUrls);
  } catch (err) {
    console.error("Error:", err.message);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
}
