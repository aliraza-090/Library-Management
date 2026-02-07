const jwt = require("jsonwebtoken");

// ✅ 1. Protect Route (Check if user is logged in)
exports.protect = (req, res, next) => {
    const token = req.header("x-auth-token");

    if (!token) {
        return res.status(401).json({ msg: "No token, authorization denied" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Adds { id, role } to the request
        next();
    } catch (err) {
        res.status(401).json({ msg: "Token is not valid" });
    }
};

// ✅ 2. Admin Only (Check if user is an admin)
exports.admin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ msg: "Access denied. Admins only!" });
    }
};