const express = require('express');
const router = express.Router();
const axios = require('axios');
const { URL } = require('url'); // Import the URL class for easier URL manipulation

// Helper function to safely resolve a potentially relative URL to point to our proxy
function rewriteUrlToProxy(relativeOrAbsoluteUrl, baseUrl, proxyEndpointBase) {
  let absoluteSourceUrl;
  if (relativeOrAbsoluteUrl.startsWith('http')) {
    absoluteSourceUrl = relativeOrAbsoluteUrl; // Already absolute
  } else {
    try {
      absoluteSourceUrl = new URL(relativeOrAbsoluteUrl, baseUrl).href;
    } catch (e) {
      console.error(`Error resolving URL: ${relativeOrAbsoluteUrl} with base ${baseUrl}`, e);
      return relativeOrAbsoluteUrl; // Return original on error
    }
  }
  // Point it to our proxy, encoding the original URL
  return `${proxyEndpointBase}?url=${encodeURIComponent(absoluteSourceUrl)}`;
}

router.get('/video', async (req, res) => {
  const { id } = req.query;
  // Construct the base URL for the proxy endpoint dynamically
  const protocol = req.protocol;
  const host = req.get('host'); // Gets the host from the request headers
  const proxyEndpointBase = `${protocol}://${host}/api/proxy`;

  if (!id) {
    return res.status(400).send('Missing video ID');
  }

  try {
    const metadataUrl = `https://www.dailymotion.com/player/metadata/video/${id}`;
    const metadataResponse = await axios.get(metadataUrl);
    const qualities = metadataResponse.data.qualities;
    const quality = qualities.auto; // Let's specifically use the auto manifest which usually is the master playlist
    const masterM3u8Url = quality ? quality[0].url : null;

    if (!masterM3u8Url) {
      return res.status(404).send('Master manifest URL not found in metadata');
    }

    const m3u8Response = await axios.get(masterM3u8Url, {
      responseType: 'text'
    });
    const m3u8Content = m3u8Response.data;
    // Base URL for resolving any potential relative paths *within* the master playlist itself (less common)
    const masterBaseUrl = masterM3u8Url.substring(0, masterM3u8Url.lastIndexOf('/') + 1);

    // Rewrite URLs within the *master* playlist to point to our proxy
    const lines = m3u8Content.split('\n');
    const rewrittenLines = lines.map(line => {
      line = line.trim();
      if (line.length === 0) {
        return line;
      }

      // Rewrite sub-playlist URLs (lines not starting with #, often ending in .m3u8)
      if (!line.startsWith('#') && line.includes('.m3u8')) {
         console.log(`Rewriting Master Playlist Entry URL: ${line}`);
         return rewriteUrlToProxy(line, masterBaseUrl, proxyEndpointBase);
      }

      // Rewrite URIs within tags (e.g., #EXT-X-MEDIA:URI="...")
      const uriMatch = line.match(/URI="([^"]+)"/);
      if (uriMatch && uriMatch[1]) {
        const originalUri = uriMatch[1];
         console.log(`Rewriting Master Playlist Tag URI: ${originalUri}`);
         const proxiedUri = rewriteUrlToProxy(originalUri, masterBaseUrl, proxyEndpointBase);
        return line.replace(originalUri, proxiedUri);
      }

      // Keep other lines as is
      return line;
    });

    const rewrittenM3u8Content = rewrittenLines.join('\n');

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.status(200).send(rewrittenM3u8Content);

  } catch (err) {
    console.error("[/api/video] Error:", err);
    if (err.response) {
      return res.status(err.response.status || 500).send(`[Video API] Error fetching data from Dailymotion: ${err.response.statusText || 'Unknown error'}`);
    } else {
      return res.status(500).send('[Video API] Internal server error processing video manifest.');
    }
  }
});

module.exports = router;
