import NewsAPI from "newsapi";
import axios from "axios";
import * as cheerio from "cheerio";
import { GoogleGenAI } from "@google/genai";

const newsapi = new NewsAPI(process.env.NEWS_API);

const today = new Date();

const year = today.getFullYear();
const month = today.getMonth() + 1; // getMonth() is zero-based
let day = today.getDate();
day--;

let formattedDate = `${year}-${month}-${day}`;
console.log("Formatted Date: ", formattedDate);
let newsArray = [];

const apiKeys = [
  process.env.GOOGLE_API_KEY_1,
  process.env.GOOGLE_API_KEY_2,
  process.env.GOOGLE_API_KEY_3,
];

// Index to keep track of current key
let currentKeyIndex = 0;

// Get the next API key in a round-robin manner
function getNextApiKey() {
  const key = apiKeys[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
  return key;
}

// Create model instance using current API key

async function aiSummarizer(str) {
  let api = getNextApiKey();

  const ai = new GoogleGenAI({
    apiKey: api,
  });
  const tools = [
    {
      googleSearch: {},
    },
  ];
  const config = {
    tools,
  };
  const model = "gemini-2.5-pro";
  const contents = [
    {
      role: "user",
      parts: [
        {
          text: `  Suppose you are an expert narrator who can narrate the news in a clear and concise way like a friend narrates the news to his friend in an informal way. Your task is to consicely summarize the news provided below
            Use enough sentences that the even the dumbest person can also understand what it is saying.
            This will be sent as a message so you don't have to write words like "As mentioned in article "
            If this article is not somehow realted to Artificial Intelligence, or Computer Science or Technology, then just say "skip": 
            ${str}`,
        },
      ],
    },
  ];

  const response = await ai.models.generateContentStream({
    model,
    config,
    contents,
  });
  let fileIndex = 0;
  let msg = " ";

  for await (const chunk of response) {
    msg += chunk.text;
  }
  console.log(msg);
  if (msg !== "skip") {
    newsArray.push(msg);
  }
  return msg;
}

async function newsGetter() {
  try {
    return await newsapi.v2
      .everything({
        q: "Artificial Intelligence",
        from: formattedDate,
        to: formattedDate,
        language: "en",
        sortBy: "relevancy",
        page: 1,
      })
      .then(async (response) => {
        if (response.totalResults === 0) {
          day--;
          formattedDate = `${year}-${month}-${day}`;
          console.log("Checking news for date: ", formattedDate);
          return newsapi.v2.everything({
            q: "Artificial Intelligence",
            from: formattedDate,
            to: formattedDate,
            language: "en",
            sortBy: "relevancy",
            page: 1,
          });
        }
        return response;
      })
      .then(async (newsData) => {
        let articles = newsData.articles.slice(0, 10);
        for (let article of articles) {
          const res = await axios.get(article.url);
          const $ = cheerio.load(res.data);
          const bodyContent = $("body").html();
          await new Promise((resolve) => setTimeout(resolve, 2 * 60000)); // 60000 ms = 1 minute
          let news = await aiSummarizer(bodyContent);
        }
      })
      .catch((error) => {
        console.error("Error fetching news:", error);
      });
  } catch (err) {
    console.error("Error fetching news:", err);
  }
}

async function main() {
  await newsGetter();

  for (let i = 0; i < newsArray.length; i++) {
    const response = await fetch("https://api.pushbullet.com/v2/pushes", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PUSHBULLET_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "note",
        title: "Today's AI News",
        body: newsArray[i],
      }),
    });
  }
}

setInterval(() => {
  main();
}, 24 * 60 * 60 * 1000);
