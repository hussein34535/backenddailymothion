const express = require('express');
const router = express.Router();
const axios = require('axios');
const { URL } = require('url'); // Keep URL for potential use, though maybe not needed now

router.get('/video', async (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).send('Missing video ID');
  }

  try {
    // 1. Get metadata to find the master playlist URL
    const metadataUrl = `https://www.dailymotion.com/player/metadata/video/${id}`;
    const metadataResponse = await axios.get(metadataUrl);
    const qualities = metadataResponse.data.qualities;
    const masterM3u8Url = qualities.auto ? qualities.auto[0].url : null;

    if (!masterM3u8Url) {
      return res.status(404).send('Master playlist URL (qualities.auto) not found in metadata.');
    }

    // 2. Fetch the master playlist content
    const m3u8Response = await axios.get(masterM3u8Url, { responseType: 'text' });
    const m3u8Content = m3u8Response.data;
    const lines = m3u8Content.split('\n');
    const masterBaseUrl = masterM3u8Url.substring(0, masterM3u8Url.lastIndexOf('/') + 1);

    // 3. Extract all available quality URLs
    const qualityUrls = {};
    const nameRegex = /NAME="([^"]*)"/; // Regex to extract the quality name

    for (let i = 0; i < lines.length; i++) {
        const trimmedLine = lines[i].trim();
        if (trimmedLine.startsWith('#EXT-X-STREAM-INF:')) {
            const match = trimmedLine.match(nameRegex);
            const qualityName = match && match[1] ? match[1] : null; // Extract name (e.g., "720")

            if (qualityName && (i + 1 < lines.length)) {
                const urlLine = lines[i + 1].trim();
                if (!urlLine.startsWith('#') && urlLine.includes('.m3u8')) {
                    let targetMediaUrl = urlLine.startsWith('http') ? urlLine : new URL(urlLine, masterBaseUrl).href;
                    // Clean the URL
                    const finalUrl = targetMediaUrl.replace(/#cell=cf3$/, '');
                    qualityUrls[qualityName] = finalUrl; // Store URL with quality name as key
                    console.log(`Found quality ${qualityName}: ${finalUrl}`);
                }
            }
        }
    }

    // Check if any qualities were found
    if (Object.keys(qualityUrls).length === 0) {
      console.log(`Could not extract any media playlist URLs from the master playlist.`);
      return res.status(404).send('Could not extract any media playlist URLs from the master playlist.');
    }

    // 4. Send the JSON object containing all quality URLs
    res.status(200).json(qualityUrls);

  } catch (err) {
    console.error("[/api/video] Error extracting media URL:", err);
    if (err.response) {
      return res.status(err.response.status || 500).send(`[Video API] Error fetching data from Dailymotion: ${err.response.statusText || 'Unknown error'}`);
    } else {
      return res.status(500).send('[Video API] Internal server error extracting media URL.');
    }
  }
});

// Remove the proxy helper function and proxy route if they exist
// Ensure api/proxy.js is deleted or not used in index.js if it was added

module.exports = router;
