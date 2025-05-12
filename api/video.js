const axios = require('axios');

module.exports = async (req, res) => {
  const {
    query: { id },
  } = req;

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

    return res.redirect(directUrl);
  } catch (err) {
    return res.status(500).send('Error getting video');
  }
};
