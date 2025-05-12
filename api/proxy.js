const axios = require('axios');
const { URL } = require('url');

// Helper function to safely resolve a potentially relative URL
function resolveUrl(relativeOrAbsoluteUrl, baseUrl) {
  if (relativeOrAbsoluteUrl.startsWith('http')) {
    return relativeOrAbsoluteUrl; // Already absolute
  }
  try {
    return new URL(relativeOrAbsoluteUrl, baseUrl).href;
  } catch (e) {
    console.error(`[Proxy] Error resolving URL: ${relativeOrAbsoluteUrl} with base ${baseUrl}`, e);
    return relativeOrAbsoluteUrl; // Return original on error
  }
}

module.exports = async (req, res) => {
  const targetUrl = req.query.url; // Get the original URL from query param

  if (!targetUrl) {
    return res.status(400).send('Missing target URL for proxy');
  }

  console.log(`[Proxy] Requesting: ${targetUrl}`);

  try {
    const targetResponse = await axios.get(targetUrl, {
      responseType: 'text' // Fetch as text to allow rewriting
    });
    const content = targetResponse.data;
    const contentType = targetResponse.headers['content-type'] || 'application/octet-stream'; // Get original content type

    // Determine the base URL for the *target* URL
    const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

    // Rewrite relative URLs within the fetched content (likely a media/subtitle playlist)
    const lines = content.split('\n');
    const rewrittenLines = lines.map(line => {
      line = line.trim();
      if (line.length === 0) {
        return line;
      }

      // Handle segment/subtitle URLs (lines not starting with #)
      if (!line.startsWith('#')) {
         const absoluteUrl = resolveUrl(line, baseUrl);
         if(line !== absoluteUrl) console.log(`[Proxy] Rewriting segment/line URL: ${line} -> ${absoluteUrl}`);
        return absoluteUrl;
      }

      // Handle URIs within tags (e.g., #EXT-X-KEY:URI="...")
      const uriMatch = line.match(/URI="([^"]+)"/);
      if (uriMatch && uriMatch[1]) {
        const originalUri = uriMatch[1];
        const absoluteUri = resolveUrl(originalUri, baseUrl);
        if (originalUri !== absoluteUri) {
           console.log(`[Proxy] Rewriting Tag URI: ${originalUri} -> ${absoluteUri}`);
          return line.replace(originalUri, absoluteUri);
        }
      }

      // Keep other lines as is
      return line;
    });

    const rewrittenContent = rewrittenLines.join('\n');

    // Send the rewritten content with the appropriate content type
    res.setHeader('Content-Type', contentType.includes('mpegurl') ? 'application/vnd.apple.mpegurl' : contentType);
    res.status(200).send(rewrittenContent);

  } catch (err) {
    console.error(`[Proxy] Error fetching or processing ${targetUrl}:`, err);
    if (err.response) {
      return res.status(err.response.status || 500).send(`[Proxy] Error fetching data from target URL: ${err.response.statusText || 'Unknown error'}`);
    } else {
      return res.status(500).send('[Proxy] Internal server error.');
    }
  }
}; 