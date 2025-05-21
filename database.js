const sqlite3 = require('sqlite3').verbose();
const DB_PATH = './weather_history.db'; // Relative to project root, where server.js runs

let db;

// Initializes the database connection and creates the table if it doesn't exist.
const initDb = () => {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
                return reject(err);
            }
            console.log('Connected to the SQLite database.');
            // SQL statement to create the search_history table
            // id: Primary key, auto-incrementing
            // city: Name of the city searched (TEXT, NOT NULL)
            // date: Searched date (TEXT, can be NULL if not specified)
            // time: Searched time (TEXT, can be NULL if not specified)
            // search_timestamp: Timestamp of when the search was made (DATETIME, defaults to current time)
            db.run(`CREATE TABLE IF NOT EXISTS search_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                city TEXT NOT NULL,
                date TEXT,
                time TEXT,
                search_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) {
                    console.error('Error creating table:', err.message);
                    return reject(err);
                }
                console.log('Search history table created or already exists.');
                resolve(); // Signal successful initialization
            });
        });
    });
};

// Adds a search record to the history table.
// city: The name of the city.
// date: The specific date searched (YYYY-MM-DD), or null.
// time: The specific time searched (HH:MM), or null.
const addSearchToHistory = (city, date, time) => {
    return new Promise((resolve, reject) => {
        if (!db) {
            // This case should ideally not be hit if initDb is called first by server.js
            return reject(new Error("Database not initialized. Call initDb first."));
        }
        const sql = `INSERT INTO search_history (city, date, time) VALUES (?, ?, ?)`;
        // Store empty strings as NULL for date/time if not provided
        db.run(sql, [city, date || null, time || null], function(err) { 
            if (err) {
                console.error('Error adding search to history:', err.message);
                return reject(err);
            }
            // Log success and return the ID of the newly inserted row
            console.log(`A search for ${city} has been inserted with rowid ${this.lastID}`);
            resolve({ id: this.lastID });
        });
    });
};

// Retrieves the last 10 search history records, ordered by most recent.
const getSearchHistory = () => {
    return new Promise((resolve, reject) => {
        if (!db) {
            return reject(new Error("Database not initialized. Call initDb first."));
        }
        // SQL query to select recent history, limited to 10 entries
        const sql = `SELECT id, city, date, time, search_timestamp FROM search_history ORDER BY search_timestamp DESC LIMIT 10`;
        db.all(sql, [], (err, rows) => {
            if (err) {
                console.error('Error fetching search history:', err.message);
                return reject(err);
            }
            // Return the fetched rows
            resolve(rows);
        });
    });
};

// Export the functions for use in server.js
module.exports = {
    initDb,
    addSearchToHistory,
    getSearchHistory
};
