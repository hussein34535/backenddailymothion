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

    // 3. Find the 720p quality playlist URL
    let targetMediaUrl = null;
    const qualityToFind = "720";
    let qualityFound = false; // Flag to track if 720p was found

    for (let i = 0; i < lines.length; i++) {
        const trimmedLine = lines[i].trim();
        // Look for the specific 720p stream info line
        if (trimmedLine.startsWith('#EXT-X-STREAM-INF:') && trimmedLine.includes(`NAME="${qualityToFind}"`) && (i + 1 < lines.length)) {
            const urlLine = lines[i+1].trim();
            // Ensure the next line is a URL
            if (!urlLine.startsWith('#')) {
                // Construct the absolute URL if it's relative
                targetMediaUrl = urlLine.startsWith('http') ? urlLine : new URL(urlLine, masterBaseUrl).href;
                qualityFound = true;
                console.log(`Found target quality ${qualityToFind}: ${targetMediaUrl}`);
                break; // Found 720p, no need to continue searching
            }
        }
    }

    // Check if the 720p quality was specifically found
    if (!qualityFound) {
      console.log(`Quality ${qualityToFind}p not found in master playlist.`);
      // Return 404 if 720p is not available
      return res.status(404).send(`Quality ${qualityToFind}p not found for this video.`);
    }

    // 4. إزالة الجزء غير المرغوب فيه وإرسال الرابط المعدل
    const finalUrl = targetMediaUrl.replace(/#cell=cf3$/, ''); // إزالة #cell=cf3 من النهاية فقط

    // Perform an HTTP 302 redirect to the extracted M3U8 URL
    res.redirect(302, finalUrl);

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
