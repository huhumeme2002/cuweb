const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let client;
  try {
    client = await pool.connect();
    
    // Simple test query
    const result = await client.query("SELECT COUNT(*) as user_count FROM users");
    
    res.json({
      success: true,
      message: "Database connection successful",
      user_count: result.rows[0].user_count,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Database test error:", error);
    res.status(500).json({ 
      error: "Database connection failed",
      details: error.message,
      timestamp: new Date().toISOString()
    });
  } finally {
    if (client) client.release();
  }
};
