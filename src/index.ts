import app from "./app";
import { prisma } from "./config/database";
import { env } from "./config/env";

const PORT = env.PORT;

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log("Database connected successfully.");

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to connect to the database", error);
    process.exit(1);
  } finally {
    // Graceful shutdown
    process.on("SIGINT", async () => {
      await prisma.$disconnect();
      console.log("Database disconnected. Server exiting.");
      process.exit(0);
    });
  }
}

startServer();
