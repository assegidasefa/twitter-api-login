import jwt from "jsonwebtoken"

export const isAuthenticated = (req, res, next) => {
  try {
    const token = req.cookies.auth_token

    if (!token) {
      return res.status(401).json({ message: "Authentication required" })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.userId = decoded.id

    next()
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token" })
  }
}

