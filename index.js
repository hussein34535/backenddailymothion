const express = require('express');
const axios = require('axios');
const app = express();

app.get('/video/:id', async (req, res) => {
  const videoId = req.params.id;

  try {
    const metadataUrl = `https://www.dailymotion.com/player/metadata/video/${videoId}`;
    const response = await axios.get(metadataUrl);
    const qualities = response.data.qualities;

    const quality = qualities.auto || qualities['480'] || qualities['360'];
    const directUrl = quality ? quality[0].url : null;

    if (!directUrl) {
      return res.status(404).send('Video not found');
    }

    // redirect المستخدم للرابط المؤقت
    return res.redirect(directUrl);
  } catch (err) {
    return res.status(500).send('Error getting video');
  }
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});

