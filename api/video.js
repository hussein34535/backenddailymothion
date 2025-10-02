// routes/video.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { URL } = require('url');

// Helper: fetch with common headers (helps مع Dailymotion / bein links)
async function fetchText(url) {
  const resp = await axios.get(url, {
    responseType: 'text',
    maxRedirects: 5,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept': '*/*',
      'Referer': 'https://www.dailymotion.com'
    },
    timeout: 15000
  });
  return resp.data;
}

router.get('/video', async (req, res) => {
  const { id, url } = req.query;

  if (!id && !url) {
    return res.status(400).send('Missing id or url query param');
  }

  try {
    // 1) Decide source: metadata (by id) or master m3u8 url (by url)
    let masterM3u8Url = null;

    if (id) {
      // Fetch metadata from Dailymotion and try extract master playlist URL
      const metadataUrl = `https://www.dailymotion.com/player/metadata/video/${id}`;
      const metadataResp = await axios.get(metadataUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'application/json',
          'Referer': 'https://www.dailymotion.com'
        },
        timeout: 10000
      });

      const qualities = metadataResp.data && metadataResp.data.qualities ? metadataResp.data.qualities : null;

      // common places where master m3u8 can be
      if (qualities) {
        // try qualities.auto first (typical)
        if (qualities.auto && qualities.auto.length && qualities.auto[0].url) {
          masterM3u8Url = qualities.auto[0].url;
        } else {
          // fallback: look through all quality arrays and pick first .m3u8 if exists
          for (const key of Object.keys(qualities)) {
            const arr = qualities[key];
            if (Array.isArray(arr)) {
              for (const item of arr) {
                if (item && item.url && String(item.url).includes('.m3u8')) {
                  masterM3u8Url = item.url;
                  break;
                }
              }
            }
            if (masterM3u8Url) break;
          }
        }
      }

      if (!masterM3u8Url) {
        return res.status(404).send('Could not find master m3u8 URL in metadata');
      }
    } else if (url) {
      masterM3u8Url = url;
    }

    // 2) Fetch master playlist content
    const m3u8Content = await fetchText(masterM3u8Url);
    const lines = m3u8Content.split(/\r?\n/);
    const masterBaseUrl = masterM3u8Url.substring(0, masterM3u8Url.lastIndexOf('/') + 1);

    // 3) Parse qualities
    const qualityUrls = {};
    const nameRegex = /NAME="([^"]*)"/i;
    const resRegex = /RESOLUTION=(\d+x\d+)/i;
    const bwRegex = /BANDWIDTH=(\d+)/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const infoLine = line;
        // try NAME
        let qName = null;
        const nameMatch = infoLine.match(nameRegex);
        if (nameMatch && nameMatch[1]) qName = nameMatch[1];

        // fallback to RESOLUTION (e.g., 1280x720 -> use height 720)
        if (!qName) {
          const resMatch = infoLine.match(resRegex);
          if (resMatch && resMatch[1]) {
            const parts = resMatch[1].split('x');
            qName = parts[1] ? parts[1] : resMatch[1]; // use height if available
          }
        }

        // further fallback to BANDWIDTH
        if (!qName) {
          const bwMatch = infoLine.match(bwRegex);
          if (bwMatch && bwMatch[1]) qName = `bw_${bwMatch[1]}`;
        }

        // next non-empty, non-comment line should be the URL
        let urlLine = null;
        if (i + 1 < lines.length) urlLine = lines[i + 1].trim();

        if (urlLine && !urlLine.startsWith('#')) {
          // resolve relative URL
          let finalUrl = urlLine.startsWith('http') ? urlLine : new URL(urlLine, masterBaseUrl).href;
          // clean weird suffixes if any
          finalUrl = finalUrl.replace(/#.*$/, '');
          // ensure qName exists
          if (!qName) {
            // try to extract filename quality e.g., /720/ or /index_720.m3u8
            const m = finalUrl.match(/(\d{2,4}p)|(\d{3,4})/i);
            qName = m ? (m[0].toString().replace('p', '')) : finalUrl;
          }
          qualityUrls[qName] = finalUrl;
        }
      }
    }

    // if none found, maybe the master is actually a media playlist (single quality) -> return itself
    if (Object.keys(qualityUrls).length === 0) {
      // check if content has segments (#EXTINF) — then it's a media playlist
      const hasSegments = lines.some(l => l.trim().startsWith('#EXTINF'));
      if (hasSegments) {
        // derive a name
        qualityUrls['default'] = masterM3u8Url;
      } else {
        return res.status(404).send('No variant playlists found in master m3u8');
      }
    }

    // Optionally: sort keys (desc by numeric quality if possible)
    const sorted = {};
    Object.keys(qualityUrls)
      .sort((a, b) => {
        const na = parseInt(a.replace(/\D/g, '')) || 0;
        const nb = parseInt(b.replace(/\D/g, '')) || 0;
        return nb - na;
      })
      .forEach(k => (sorted[k] = qualityUrls[k]));

    return res.json(sorted);

  } catch (err) {
    console.error("[/api/video] Error extracting media URL:", err.message || err);
    if (err.response && err.response.status) {
      return res.status(err.response.status).send(`[Video API] Error fetching upstream: ${err.response.statusText || err.response.status}`);
    }
    return res.status(500).send('[Video API] Internal server error extracting media URL.');
  }
});

module.exports = router;
