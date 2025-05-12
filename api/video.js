const express = require('express');
const router = express.Router();
const axios = require('axios');
const { URL } = require('url'); // Import the URL class for easier URL manipulation

router.get('/video', async (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).send('Missing video ID');
  }

  try {
    // 1. Get metadata and the M3U8 manifest URL
    const metadataUrl = `https://www.dailymotion.com/player/metadata/video/${id}`;
    const metadataResponse = await axios.get(metadataUrl);
    const qualities = metadataResponse.data.qualities;
    const quality = qualities.auto || qualities['480'] || qualities['360']; // Or choose a specific quality if needed
    const directUrl = quality ? quality[0].url : null; // This is the URL to the M3U8 manifest

    if (!directUrl) {
      return res.status(404).send('Video manifest URL not found in metadata');
    }

    // 2. Fetch the M3U8 manifest content as text
    const m3u8Response = await axios.get(directUrl, {
      responseType: 'text'
    });
    const m3u8Content = m3u8Response.data;

    // 3. Calculate the base URL for resolving relative paths
    // The base URL is the path to the M3U8 file itself
    const baseUrl = directUrl.substring(0, directUrl.lastIndexOf('/') + 1);

    // 4. Rewrite relative URLs in the M3U8 content to absolute URLs
    const lines = m3u8Content.split('\n');
    const rewrittenLines = lines.map(line => {
      line = line.trim();
      if (line.length === 0 || line.startsWith('#')) {
        // Keep comments and empty lines as is
        return line;
      }
      // Check if it's likely a URL (doesn't start with #)
      // and if it's a relative URL (doesn't start with http)
      if (!line.startsWith('http')) {
        try {
          // Resolve the relative URL against the base URL
          const absoluteUrl = new URL(line, baseUrl).href;
          console.log(`Rewriting relative URL: ${line} -> ${absoluteUrl}`); // Optional: log rewriting
          return absoluteUrl;
        } catch (urlError) {
            console.error(`Error parsing URL: ${line} with base ${baseUrl}`, urlError);
            return line; // Keep original line if URL parsing fails
        }
      }
      // It's already an absolute URL or not a URL line we need to process
      return line;
    });

    const rewrittenM3u8Content = rewrittenLines.join('\n');
    // console.log("Rewritten M3U8 Content:\n", rewrittenM3u8Content); // Optional: log the final M3U8

    // 5. Send the rewritten M3U8 content
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl'); // Standard M3U8 type
    res.status(200).send(rewrittenM3u8Content);

  } catch (err) {
    console.error("Error fetching or processing video manifest:", err);
    // Provide more specific error feedback if possible
    if (err.response) {
        // Error fetching metadata or M3U8
        return res.status(err.response.status || 500).send(`Error fetching data from Dailymotion: ${err.response.statusText || 'Unknown error'}`);
    } else {
        // Other errors (e.g., URL parsing)
        return res.status(500).send('Internal server error processing video manifest.');
    }
  }
});

module.exports = router;
