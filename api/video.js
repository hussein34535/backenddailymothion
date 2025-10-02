import axios from "axios";
import { URL } from "url";

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).send("Missing url");
  }

  try {
    // عشان أي URL فيه & أو = يفضل شغال
    const target = decodeURIComponent(url);
    res.redirect(target);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
