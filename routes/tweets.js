import express from "express"
import Tweet from "../models/Tweet.js"
import User from "../models/User.js"
import { isAuthenticated } from "../middleware/auth.js"
import { postTweet, getTweet } from "../utils/twitterClient.js"
import { TwitterApi } from "twitter-api-v2"



const router = express.Router()

// Post a new tweet
// router.post("/post", isAuthenticated, async (req, res) => {
//   try {
//     const { content : text } = req.body;


//     if (!text) {
//       return res.status(400).json({ message: "Tweet text is required" })
//     }

//     // Get user
//     const user = await User.findById(req.userId)

//     if (!user) {
//       return res.status(404).json({ message: "User not found" })
//     }

//     // Post tweet using Twitter API
//     const tweetData = await postTweet(user.accessToken, text)

//     // Save tweet to database
//     const tweet = new Tweet({
//       user: req.userId,
//       tweetId: tweetData.id,
//       text,
//       verified: true, // Auto-verify our own tweets
//     })

//     await tweet.save()

//     res.status(201).json({
//       message: "Tweet posted successfully",
//       tweet: {
//         id: tweet._id,
//         tweetId: tweetData.id,
//         text,
//         createdAt: tweet.createdAt,
//       },
//     })
//   } catch (error) {
//     console.error("Error posting tweet:", error)
//     res.status(500).json({ message: "Failed to post tweet" })
//   }
// })


router.post("/post", isAuthenticated, async (req, res) => {
  try {
    const { content: text } = req.body;

    if (!text || text.length > 280) {
      return res.status(400).json({ 
        message: "Tweet text is required and must be under 280 characters" 
      });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Initialize Twitter client with access token
    const userClient = new TwitterApi(user.accessToken);
    const roClient = userClient.readWrite;

    // Post tweet using Twitter API v2
    const tweet = await roClient.v2.tweet(text);

    // Save tweet to database
    const newTweet = new Tweet({
      user: req.userId,
      tweetId: tweet.data.id,
      text,
      verified: true,
    });

    await newTweet.save();

    res.status(201).json({
      message: "Tweet posted successfully",
      tweet: {
        id: tweet.data.id,
        text: tweet.data.text,
        url: `https://twitter.com/${user.username}/status/${tweet.data.id}`,
        createdAt: new Date(),
      },
    });

  } catch (error) {
    console.error("Twitter API error:", error);
    
    const errorData = {
      message: "Failed to post tweet",
      twitterError: {
        code: error.code || 'UNKNOWN',
        message: error.message,
        details: error.data?.detail || 'No additional details'
      }
    };

    // Handle specific Twitter API errors
    if (error.code === 403) {
      errorData.message = "Permission denied by Twitter";
      // Check for common 403 reasons
      if (error.data?.detail?.includes("duplicate content")) {
        errorData.twitterError.details = "Duplicate tweet content";
      }
      return res.status(403).json(errorData);
    }

    res.status(error.code || 500).json(errorData);
  }
});

// Get user's tweets
router.get("/user", isAuthenticated, async (req, res) => {
  try {
    const tweets = await Tweet.find({ user: req.userId }).sort({ createdAt: -1 })

    res.json(tweets)
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch tweets" })
  }
})

// Verify a tweet
// router.post("/verify", async (req, res) => {
//   try {
//     const { url } = req.body

//     if (!url) {
//       return res.status(400).json({ message: "Tweet URL is required" })
//     }

//     // Extract tweet ID from URL
//     const tweetIdMatch = url.match(/status\/(\d+)/)

//     if (!tweetIdMatch) {
//       return res.status(400).json({ message: "Invalid tweet URL" })
//     }

//     const tweetId = tweetIdMatch[1]

//     // Get tweet data from Twitter API
//     const tweetData = await getTweet(tweetId)

//     if (!tweetData || !tweetData.data) {
//       return res.status(404).json({
//         isVerified: false,
//         message: "Tweet not found or has been deleted",
//       })
//     }

//     // Get author data
//     const author = tweetData.includes?.users?.[0]

//     if (!author) {
//       return res.status(404).json({
//         isVerified: false,
//         message: "Tweet author information not available",
//       })
//     }

//     // Return verification result
//     res.json({
//       isVerified: true,
//       tweet: {
//         id: tweetData.data.id,
//         text: tweetData.data.text,
//         createdAt: tweetData.data.created_at || new Date().toISOString(),
//         author: {
//           id: author.id,
//           username: author.username,
//           name: author.name,
//           profileImageUrl: author.profile_image_url,
//         },
//       },
//     })
//   } catch (error) {
//     console.error("Error verifying tweet:", error)
//     res.status(500).json({
//       isVerified: false,
//       message: "Failed to verify tweet",
//     })
//   }
// })


router.post("/verify", isAuthenticated, async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ message: "Tweet URL is required" });
    }

    // Extract tweet ID from URL
    const tweetIdMatch = url.match(/status\/(\d+)/);
    if (!tweetIdMatch) {
      return res.status(400).json({ message: "Invalid tweet URL" });
    }
    const tweetId = tweetIdMatch[1];

    // Get user's access token
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    // Initialize Twitter client with user's access token
    const userClient = new TwitterApi(user.accessToken);
    const roClient = userClient.readOnly;

    // Get tweet data
    const tweetData = await roClient.v2.singleTweet(tweetId, {
      expansions: ['author_id'],
      'tweet.fields': ['created_at', 'text'],
      'user.fields': ['username', 'name', 'profile_image_url']
    });

    // Verify ownership
    const isOwner = tweetData.data.author_id === user.twitterId;
    
    if (!isOwner) {
      return res.json({
        isVerified: false,
        message: "This tweet does not belong to the authenticated user"
      });
    }

    res.json({
      isVerified: true,
      tweet: {
        id: tweetData.data.id,
        text: tweetData.data.text,
        createdAt: tweetData.data.created_at,
        url: `https://twitter.com/${user.username}/status/${tweetData.data.id}`,
        author: {
          id: user.twitterId,
          username: user.username,
          name: user.name,
          profileImageUrl: user.profileImageUrl
        }
      }
    });

  } catch (error) {
    console.error("Error verifying tweet:", error);
    res.status(500).json({
      isVerified: false,
      message: error.message || "Failed to verify tweet",
      code: error.code
    });
  }
});

export default router

