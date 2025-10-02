import axios from "axios";

export default async function handler(req, res) {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "Missing url" });

    const decodedUrl = decodeURIComponent(url);
    console.log("Fetching:", decodedUrl);

    const response = await axios.get(decodedUrl);
    const text = response.data;

    // هنا نخلي الدالة ترجع بس كل الروابط اللي في النص
    const urls = Array.from(text.matchAll(/https?:\/\/[^\s'\"]+/g)).map(m => m[0]);

    res.status(200).json({ links: urls });

  } catch (err) {
    console.error("Serverless Error:", err);
    res.status(500).json({ error: err.message });
  }
}
