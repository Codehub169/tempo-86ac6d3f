#!/bin/bash

# Navigate to the directory where the script is located (optional, but good practice)
# cd "$(dirname "$0")"

# Install Node.js dependencies
echo "Installing dependencies..."
npm install

# Check if installation was successful
if [ $? -ne 0 ]; then
  echo "Failed to install dependencies. Exiting."
  exit 1
fi

# Create the database file if it doesn't exist (though it's part of the initial file set)
if [ ! -f ./weather_history.db ]; then
  echo "Creating database file..."
  touch ./weather_history.db
fi

# Set the port for the application
export PORT=9000

# Run the Node.js server
echo "Starting server on port $PORT..."
node server.js