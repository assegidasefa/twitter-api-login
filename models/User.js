import mongoose from "mongoose"

const userSchema = new mongoose.Schema(
  {
    twitterId: {
      type: String,
      required: true,
      unique: true,
    },
    username: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    email: String,
    profileImageUrl: String,
    description: String,
    location: String,
    accessToken: {
      type: String,
      required: true,
    },
    refreshToken: String,
    tokenExpiry: Date,
  },
  {
    timestamps: true,
  },
)

export default mongoose.model("User", userSchema)

