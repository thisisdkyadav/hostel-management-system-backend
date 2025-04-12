# Database Connection (`/config/db.js`)

This file provides a function to establish a connection to the MongoDB database using Mongoose.

## Dependencies

- `mongoose`: Object Data Modeling (ODM) library for MongoDB.
- [`./environment.js`](environment.md): Imports the `MONGO_URI` constant.

## Functionality

- **Exports `connectDB` function:** An asynchronous function that attempts to connect to MongoDB.
  - Uses the `MONGO_URI` imported from [`environment.js`](environment.md).
  - Includes Mongoose connection options (`useNewUrlParser: true`, `useUnifiedTopology: true`). Note: These options are deprecated in newer Mongoose versions and might not be necessary.
  - Logs a success message to the console upon successful connection.
  - Logs an error message to the console and exits the Node.js process (`process.exit(1)`) if the connection fails.

## Usage

This function is typically called once when the application starts, usually in the main server file ([`server.js`](../server.md)), to establish the database connection before starting the server.

```javascript
// Example usage in server.js
import express from "express"
import connectDB from "./config/db.js"
// ... other imports

// Connect to database
connectDB()

const app = express()

// ... middleware and routes

app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
```
