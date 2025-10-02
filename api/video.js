const express = require('express');
const router = express.Router();
const axios = require('axios');
const { URL } = require('url');

router.get('/video', async (req, res) => {
  const { id, url } = req.query;

  try {
    // لو الرابط مباشر متوفر
    if (url) {
      const decodedUrl = decodeURIComponent(url);
      const response = await axios.get(decodedUrl, { responseType: 'text' });
      return res.status(200).send(response.data);
    }

    // لو video ID متوفر
    if (id) {
      const metadataUrl = `https://www.dailymotion.com/player/metadata/video/${id}`;
      const metadataResponse = await axios.get(metadataUrl);
      const qualities = metadataResponse.data.qualities;
      const masterM3u8Url = qualities.auto ? qualities.auto[0].url : null;

      if (!masterM3u8Url) return res.status(404).send('Master playlist not found');

      const m3u8Response = await axios.get(masterM3u8Url, { responseType: 'text' });
      const lines = m3u8Response.data.split('\n');
      const masterBaseUrl = masterM3u8Url.substring(0, masterM3u8Url.lastIndexOf('/') + 1);

      const qualityUrls = {};
      const nameRegex = /NAME="([^"]*)"/;

      for (let i = 0; i < lines.length; i++) {
        const trimmedLine = lines[i].trim();
        if (trimmedLine.startsWith('#EXT-X-STREAM-INF:')) {
          const match = trimmedLine.match(nameRegex);
          const qualityName = match && match[1] ? match[1] : null;

          if (qualityName && i + 1 < lines.length) {
            const urlLine = lines[i + 1].trim();
            if (!urlLine.startsWith('#') && urlLine.includes('.m3u8')) {
              let targetMediaUrl = urlLine.startsWith('http') ? urlLine : new URL(urlLine, masterBaseUrl).href;
              qualityUrls[qualityName] = targetMediaUrl;
            }
          }
        }
      }

      if (Object.keys(qualityUrls).length === 0) {
        return res.status(404).send('No quality URLs found in master playlist');
      }

      return res.status(200).json(qualityUrls);
    }

    // لو ولا حاجة متوفرة
    res.status(400).send('Missing video ID or URL');

  } catch (err) {
    console.error('[/api/video] Error:', err);
    res.status(500).send('Internal server error');
  }
});

module.exports = router;
