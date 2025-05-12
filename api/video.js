const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/video', async (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).send('Missing video ID');
  }

  try {
    const metadataUrl = `https://www.dailymotion.com/player/metadata/video/${id}`;
    const response = await axios.get(metadataUrl);
    const qualities = response.data.qualities;

    const quality = qualities.auto || qualities['480'] || qualities['360'];
    const directUrl = quality ? quality[0].url : null;

    if (!directUrl) {
      return res.status(404).send('Video not found');
    }

    // Fetch the M3U8 content instead of redirecting
    const m3u8Response = await axios.get(directUrl, {
      responseType: 'stream' // Important for streaming the content
    });

    // Set the correct content type for M3U8 (Trying alternative)
    res.setHeader('Content-Type', 'application/x-mpegURL');

    // Pipe the M3U8 stream from Dailymotion to the client
    m3u8Response.data.pipe(res);

  } catch (err) {
    console.error("Error fetching or proxying video:", err); // Add logging for server-side errors
    if (err.response && err.response.status === 403) {
        return res.status(403).send('Dailymotion rejected the request (Forbidden).');
    }
    return res.status(500).send('Error getting video');
  }
});

module.exports = router;
