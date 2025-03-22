import express from "express"
import jwt from "jsonwebtoken"
import User from "../models/User.js"
import { isAuthenticated } from "../middleware/auth.js"
import { generateAuthLink, twitterClient } from "../utils/twitterClient.js"
import { TwitterApi } from "twitter-api-v2"


const router = express.Router()

// Store PKCE verifiers and states temporarily (in a real app, use Redis or another store)
const authStore = new Map()

// Twitter auth routes
router.get("/twitter", async (req, res) => {
  try {
    const callbackUrl = process.env.TWITTER_CALLBACK_URL
    const { url, codeVerifier, state } = await generateAuthLink(callbackUrl)

    // Store the code verifier and state for later use
    authStore.set(state, { codeVerifier })

    // Redirect to Twitter auth page
    res.redirect(url)
  } catch (error) {
    console.error("Error generating auth link:", error)
    res.status(500).json({ message: "Failed to initiate Twitter login" })
  }
})

router.get("/status", isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    res.json({
      authenticated: true,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        profileImageUrl: user.profileImageUrl
      }
    });
  } catch (error) {
    res.status(401).json({ authenticated: false });
  }
});

// router.get("/callback/twitter/", async (req, res) => {
//   try {
//     const { code, state } = req.query

//     if (!code || !state) {
//       return res.redirect(`${process.env.FRONTEND_URL}/login?error=missing_params`)
//     }

//     // Get the stored code verifier
//     const storedAuth = authStore.get(state)

//     if (!storedAuth) {
//       return res.redirect(`${process.env.FRONTEND_URL}/login?error=invalid_state`)
//     }

//     // Exchange the code for tokens
//     const { codeVerifier } = storedAuth
//     const { accessToken, refreshToken, expiresIn } = await twitterClient.loginWithOAuth2({
//       code,
//       codeVerifier,
//       redirectUri: process.env.TWITTER_CALLBACK_URL,
//     })

//     // Clean up the stored auth data
//     authStore.delete(state)

//     // Get user info
//     const userClient = twitterClient.readWrite(accessToken)
//     const twitterUser = await userClient.v2.me({
//       "user.fields": ["profile_image_url", "description", "location"],
//     })

//     // Find or create user
//     let user = await User.findOne({ twitterId: twitterUser.data.id })

//     if (user) {
//       // Update existing user
//       user.accessToken = accessToken
//       user.refreshToken = refreshToken
//       user.username = twitterUser.data.username
//       user.name = twitterUser.data.name
//       user.profileImageUrl = twitterUser.data.profile_image_url
//       user.description = twitterUser.data.description
//       user.location = twitterUser.data.location
//       user.tokenExpiry = new Date(Date.now() + expiresIn * 1000)
//     } else {
//       // Create new user
//       user = new User({
//         twitterId: twitterUser.data.id,
//         username: twitterUser.data.username,
//         name: twitterUser.data.name,
//         profileImageUrl: twitterUser.data.profile_image_url,
//         description: twitterUser.data.description,
//         location: twitterUser.data.location,
//         accessToken,
//         refreshToken,
//         tokenExpiry: new Date(Date.now() + expiresIn * 1000),
//       })
//     }

//     await user.save()

//     // Create JWT token
//     const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" })

//     // Set cookie
//     res.cookie("auth_token", token, {
//       httpOnly: true,
//       secure: process.env.NODE_ENV === "production",
//       maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
//       sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
//     })

//     // Redirect to frontend
//     res.redirect(`${process.env.FRONTEND_URL}/dashboard`)
//   } catch (error) {
//     console.error("Error in Twitter callback:", error)
//     res.redirect(`${process.env.FRONTEND_URL}/login?error=auth_failed`)
//   }
// })

// Check if user is logged in


router.get("/callback/twitter", async (req, res) => {
  try {
    const { code, state } = req.query

    if (!code || !state) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=missing_params`)
    }

    const storedAuth = authStore.get(state)
    if (!storedAuth) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=invalid_state`)
    }

    const { codeVerifier } = storedAuth
    const { 
      accessToken, 
      refreshToken, 
      expiresIn 
    } = await twitterClient.loginWithOAuth2({
      code,
      codeVerifier,
      redirectUri: process.env.TWITTER_CALLBACK_URL,
    })

    authStore.delete(state)

    // Create authenticated client
    const userClient = new TwitterApi(accessToken)
    const { data: twitterUser } = await userClient.v2.me({
      "user.fields": ["profile_image_url", "description", "location"],
    })

    // Find or create user
    let user = await User.findOne({ twitterId: twitterUser.id })

    const userData = {
      accessToken,
      refreshToken,
      tokenExpiry: new Date(Date.now() + expiresIn * 1000),
      username: twitterUser.username,
      name: twitterUser.name,
      profileImageUrl: twitterUser.profile_image_url,
      description: twitterUser.description,
      location: twitterUser.location,
    }

    if (user) {
      user = await User.findByIdAndUpdate(
        user._id,
        { $set: userData },
        { new: true }
      )
    } else {
      user = new User({
        twitterId: twitterUser.id,
        ...userData
      })
      await user.save()
    }

    // Create JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { 
      expiresIn: "7d" 
    })

    // Set cookie
    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    })

    res.redirect(`${process.env.FRONTEND_URL}/dashboard`)
  } catch (error) {
    console.error("Error in Twitter callback:", error)
    res.redirect(`${process.env.FRONTEND_URL}/login?error=auth_failed`)
  }
})







router.get("/check", isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.userId)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Check if token is expired and refresh if needed
    if (user.tokenExpiry && user.tokenExpiry < new Date() && user.refreshToken) {
      try {
        const {
          accessToken,
          refreshToken: newRefreshToken,
          expiresIn,
        } = await twitterClient.refreshOAuth2Token(user.refreshToken)

        user.accessToken = accessToken
        user.refreshToken = newRefreshToken || user.refreshToken
        user.tokenExpiry = new Date(Date.now() + expiresIn * 1000)
        await user.save()
      } catch (refreshError) {
        console.error("Error refreshing token:", refreshError)
        // Continue with the expired token for now
      }
    }

    // Return user data without sensitive information
    res.json({
      _id: user._id,
      twitterId: user.twitterId,
      username: user.username,
      name: user.name,
      email: user.email,
      profileImageUrl: user.profileImageUrl,
      description: user.description,
      location: user.location,
      createdAt: user.createdAt,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error" })
  }
})

// Logout
router.post("/logout", (req, res) => {
  res.clearCookie("auth_token")
  res.json({ message: "Logged out successfully" })
})

// Refresh user profile data from Twitter
router.post("/refresh-profile", isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.userId)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Get updated user info from Twitter
    const userClient = twitterClient.readWrite(user.accessToken)
    const twitterUser = await userClient.v2.me({
      "user.fields": ["profile_image_url", "description", "location"],
    })

    // Update user data
    user.username = twitterUser.data.username
    user.name = twitterUser.data.name
    user.profileImageUrl = twitterUser.data.profile_image_url
    user.description = twitterUser.data.description
    user.location = twitterUser.data.location

    await user.save()

    res.json({
      message: "Profile refreshed successfully",
      user: {
        username: user.username,
        name: user.name,
        profileImageUrl: user.profileImageUrl,
        description: user.description,
        location: user.location,
      },
    })
  } catch (error) {
    console.error("Error refreshing profile:", error)
    res.status(500).json({ message: "Failed to refresh profile" })
  }
})

export default router

