import { TwitterApi } from "twitter-api-v2"
import dotenv from "dotenv"

dotenv.config()

// Create a client with consumer keys only - this will be used for the OAuth flow
export const twitterClient = new TwitterApi({
  clientId: process.env.TWITTER_CLIENT_ID,
  clientSecret: process.env.TWITTER_CLIENT_SECRET,
})

// Generate auth link for OAuth 2.0 with PKCE
export const generateAuthLink = async (callbackUrl) => {
  const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(callbackUrl, {
    scope: ["tweet.read", "tweet.write", "users.read", "offline.access"],
  })

  return { url, codeVerifier, state }
}

// Create a client with user context
export const getClientForUser = (accessToken) => {
  return new TwitterApi(accessToken)
}

// Post a tweet
export const postTweet = async (accessToken, text) => {
  const userClient = getClientForUser(accessToken)
  const { data } = await userClient.v2.tweet(text)
  return data
}

// Get a tweet by ID
export const getTweet = async (tweetId) => {
  try {
    // For public tweets, we can use the app-only client
    const appOnlyClient = await twitterClient.appLogin()

    const tweet = await appOnlyClient.v2.singleTweet(tweetId, {
      expansions: ["author_id"],
      "user.fields": ["name", "username", "profile_image_url", "description", "location"],
    })

    return tweet
  } catch (error) {
    console.error("Error fetching tweet:", error)
    throw error
  }
}

// Get user information
export const getUserInfo = async (accessToken) => {
  const userClient = getClientForUser(accessToken)
  const { data } = await userClient.v2.me({
    "user.fields": ["name", "username", "profile_image_url", "description", "location"],
  })
  return data
}

