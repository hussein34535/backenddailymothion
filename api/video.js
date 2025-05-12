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

    // 3. Find the desired quality playlist URL (e.g., 720p, fallback to 480p, etc.)
    let targetMediaUrl = null;
    let qualityFound = null;

    // Prioritize qualities (e.g., 720p first)
    const qualityPriorities = ["720", "480", "380"]; // Add or reorder as needed

    for (const qualityName of qualityPriorities) {
        for (let i = 0; i < lines.length; i++) {
            const trimmedLine = lines[i].trim();
            if (trimmedLine.startsWith('#EXT-X-STREAM-INF:') && trimmedLine.includes(`NAME="${qualityName}"`) && (i + 1 < lines.length)) {
                const urlLine = lines[i+1].trim();
                if (!urlLine.startsWith('#')) {
                    targetMediaUrl = urlLine.startsWith('http') ? urlLine : new URL(urlLine, masterBaseUrl).href;
                    qualityFound = qualityName;
                    console.log(`Found target quality ${qualityFound}: ${targetMediaUrl}`);
                    break; // Found the desired quality
                }
            }
        }
        if (targetMediaUrl) break; // Stop searching if found
    }

    // Fallback: If no prioritized quality found, take the first media playlist URL
    if (!targetMediaUrl) {
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine.startsWith('#') && trimmedLine.includes('.m3u8')) {
                targetMediaUrl = trimmedLine.startsWith('http') ? trimmedLine : new URL(trimmedLine, masterBaseUrl).href;
                qualityFound = "first_available";
                console.log(`Using first available quality: ${targetMediaUrl}`);
                break;
            }
        }
    }

    if (!targetMediaUrl) {
      return res.status(404).send('Could not extract any media playlist URL from the master playlist.');
    }

    // 4. Send the extracted URL back to the client
    // Option 1: Send as JSON (Recommended)
    // res.status(200).json({ url: targetMediaUrl, quality: qualityFound });

    // Option 2: Send as plain text
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(targetMediaUrl);

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
