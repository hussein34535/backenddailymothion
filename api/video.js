import axios from "axios";
import { URL } from "url";

export default async function handler(req, res) {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "Missing url" });

    const decodedUrl = decodeURIComponent(url);
    console.log("Fetching:", decodedUrl);

    const response = await fetch(decodedUrl);
    const text = await response.text();

    console.log("Response status:", response.status);
    res.status(200).send(text);

  } catch (err) {
    console.error("Serverless Error:", err);
    res.status(500).json({ error: err.message });
  }
}
