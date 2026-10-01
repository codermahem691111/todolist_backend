require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/taskflow";

app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json());

const todoSchema = new mongoose.Schema({
  text: {
    type: String,
    required: [true, "Todo text is required"],
    trim: true,
    maxlength: [500, "Todo text cannot exceed 500 characters"],
  },
  completed: {
    type: Boolean,
    default: false,
  },
  priority: {
    type: String,
    enum: {
      values: ["low", "medium", "high"],
      message: "Priority must be low, medium, or high",
    },
    default: "medium",
  },
  createdAt: {
    type: Number,
    default: () => Date.now(),
  },
});

todoSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
});

const Todo = mongoose.model("Todo", todoSchema);

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "TaskFlow API is running",
    timestamp: Date.now(),
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

app.get("/api/todos", async (req, res, next) => {
  try {
    const todos = await Todo.find().sort({ createdAt: -1 });
    res.json(todos);
  } catch (err) {
    next(err);
  }
});

app.post("/api/todos", async (req, res, next) => {
  try {
    const { text, priority } = req.body || {};

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Todo text is required and cannot be empty" });
    }

    const todo = new Todo({
      text: text.trim(),
      priority: priority || "medium",
      completed: false,
      createdAt: Date.now(),
    });

    const saved = await todo.save();
    res.status(201).json(saved);
  } catch (err) {
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }
    next(err);
  }
});

app.patch("/api/todos/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { text, completed, priority } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: "Todo not found" });
    }

    const updates = {};

    if (text !== undefined) {
      if (typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "Todo text cannot be empty" });
      }
      updates.text = text.trim();
    }

    if (completed !== undefined) {
      if (typeof completed !== "boolean") {
        return res.status(400).json({ error: "Completed must be a boolean" });
      }
      updates.completed = completed;
    }

    if (priority !== undefined) {
      if (!["low", "medium", "high"].includes(priority)) {
        return res.status(400).json({ error: "Priority must be low, medium, or high" });
      }
      updates.priority = priority;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const updated = await Todo.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Todo not found" });
    }

    res.json(updated);
  } catch (err) {
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }
    next(err);
  }
});

app.delete("/api/todos/completed", async (req, res, next) => {
  try {
    const result = await Todo.deleteMany({ completed: true });
    res.json({
      message: `Deleted ${result.deletedCount} completed todo(s)`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/todos/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: "Todo not found" });
    }

    const deleted = await Todo.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ error: "Todo not found" });
    }

    res.json({ message: "Todo deleted successfully", id });
  } catch (err) {
    next(err);
  }
});

app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

app.use((err, req, res, next) => {
  console.error("[SERVER ERROR]", err);
  res.status(500).json({
    error: process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message || "Something went wrong",
  });
});

const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log(`✅ MongoDB connected: ${mongoose.connection.host}`);
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    throw err;
  }
};

const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log("");
      console.log("========================================");
      console.log("   TaskFlow Backend API Server");
      console.log("========================================");
      console.log(`🚀 Server running on:  http://localhost:${PORT}`);
      console.log(`📡 Health check:       http://localhost:${PORT}/api/health`);
      console.log(`📋 Todos endpoint:     http://localhost:${PORT}/api/todos`);
      console.log(`🍃 MongoDB:            ${MONGODB_URI}`);
      console.log("========================================");
      console.log("");
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err.message);
    process.exit(1);
  }
};

startServer();

process.on("SIGINT", async () => {
  console.log("\n📤 Gracefully shutting down...");
  await mongoose.connection.close();
  console.log("✅ MongoDB connection closed");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n📤 Gracefully shutting down...");
  await mongoose.connection.close();
  console.log("✅ MongoDB connection closed");
  process.exit(0);
});
