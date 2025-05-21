const express = require('express');
const path = require('path');
const fetch = require('node-fetch'); // Using node-fetch v2 for CommonJS compatibility
const db = require('./database.js'); // Database interaction module

const app = express();
const PORT = process.env.PORT || 9000;

// Middleware
app.use(express.json()); // Parses incoming JSON requests
app.use(express.static(path.join(__dirname, 'public'))); // Serves static files from the 'public' directory

// --- API Endpoints ---

// Geocoding function using Open-Meteo's Geocoding API
async function getCoordinates(city) {
    const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
    try {
        const response = await fetch(geocodeUrl);
        if (!response.ok) {
            let errorMessage = `Geocoding API request failed with status ${response.status}`;
            try {
                const errorData = await response.json();
                if (errorData && errorData.reason) {
                    errorMessage = `Geocoding API error: ${errorData.reason}`;
                }
            } catch (e) {
                // If error response is not JSON or parsing fails, use the status code message
            }
            console.error(errorMessage);
            return null; 
        }
        const data = await response.json();
        if (data.results && data.results.length > 0) {
            return {
                latitude: data.results[0].latitude,
                longitude: data.results[0].longitude,
                name: data.results[0].name, // Actual name found
                country: data.results[0].country
            };
        }
        return null; // No results found
    } catch (error) { // Catches network errors or other unexpected errors during fetch/JSON parsing
        console.error('Error in getCoordinates function:', error.message);
        return null;
    }
}

// GET /api/weather - Fetch current or historical weather
app.get('/api/weather', async (req, res) => {
    const { city, date, time } = req.query;

    if (!city) {
        return res.status(400).json({ error: 'City parameter is required' });
    }

    let coordinates;
    try {
        coordinates = await getCoordinates(city);
    } catch (error) { 
        console.error(`Critical error during geocoding process for city ${city}:`, error.message);
        return res.status(500).json({ error: 'Failed to process geocoding information due to an internal error.' });
    }

    if (!coordinates) {
        return res.status(404).json({ error: `Could not find coordinates for city: ${city}` });
    }

    const { latitude, longitude, name: actualCityName, country } = coordinates;
    let weatherApiUrl;
    let isHistorical = false;

    if (date) { // Historical weather
        isHistorical = true;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
        }
        weatherApiUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${date}&end_date=${date}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto`;
    } else { // Current/Forecast weather
        weatherApiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto`;
    }

    try {
        const weatherResponse = await fetch(weatherApiUrl);
        if (!weatherResponse.ok) {
            let errorDetails = { message: `Open-Meteo API request failed with status ${weatherResponse.status}` }; 
            try {
                const errorData = await weatherResponse.json();
                errorDetails = (errorData && errorData.reason) ? { ...errorData } : errorData;
            } catch (e) {
                const rawText = await weatherResponse.text().catch(() => "Could not read error response text.");
                console.warn(`Failed to parse error response from Open-Meteo as JSON. Status: ${weatherResponse.status}. Response text snippet: ${rawText.substring(0, 200)}`);
                errorDetails.rawResponse = rawText;
            }
            console.error('Open-Meteo API Error:', errorDetails);
            return res.status(weatherResponse.status).json({ error: 'Failed to fetch weather data from Open-Meteo.', details: errorDetails });
        }
        const weatherData = await weatherResponse.json();

        let finalWeatherData = weatherData;
        if (isHistorical && time && weatherData.hourly && weatherData.hourly.time && Array.isArray(weatherData.hourly.time)) {
            const timeParts = time.split(':');
            const hour = parseInt(timeParts[0], 10);
            // Validate hour part; minutes are ignored for hourly data but format should be reasonable.
            if (isNaN(hour) || hour < 0 || hour > 23 || (timeParts.length > 1 && (isNaN(parseInt(timeParts[1],10)) || parseInt(timeParts[1],10) < 0 || parseInt(timeParts[1],10) > 59))) {
                return res.status(400).json({ error: 'Invalid time format. Use HH or HH:MM (24-hour format).' });
            }
            
            const targetDateTime = `${date}T${hour.toString().padStart(2, '0')}:00`;
            const hourlyIndex = weatherData.hourly.time.findIndex(t => t.startsWith(targetDateTime));

            if (hourlyIndex !== -1) {
                const specificHourData = {};
                for (const key in weatherData.hourly) {
                    if (Array.isArray(weatherData.hourly[key]) && weatherData.hourly[key].length > hourlyIndex) {
                        specificHourData[key] = weatherData.hourly[key][hourlyIndex];
                    }
                }
                // The client-side script currently uses weatherData.hourly with index 0.
                // This 'specific_time_data' is supplemental unless client logic is updated.
                finalWeatherData = { ...weatherData, specific_time_data: specificHourData, requested_time_data_for: targetDateTime };
            } else {
                finalWeatherData = { ...weatherData, warning: `No data for specified hour ${time} on ${date}. Returning daily historical data.`, requested_time_data_for: targetDateTime };
            }
        }
        
        finalWeatherData.city_info = { requested_city: city, found_city: actualCityName, country };

        db.addSearchToHistory(actualCityName, date || null, time || null)
            .then(searchResult => {
                if (searchResult && searchResult.id) {
                    console.log(`Search history added with ID: ${searchResult.id}`);
                }
            })
            .catch(err => console.error('Error saving search to history:', err.message));

        res.json(finalWeatherData);

    } catch (error) {
        console.error('Server error processing weather request:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/history - Fetch search history
app.get('/api/history', async (req, res) => {
    try {
        const history = await db.getSearchHistory();
        res.json(history);
    } catch (error) {
        console.error('Error fetching search history from API:', error.message);
        res.status(500).json({ error: 'Failed to fetch search history' });
    }
});

// Serve index.html for the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize database and then start the server
async function startServer() {
    try {
        await db.initDb();
        console.log('Database initialized successfully.');
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('Failed to initialize database:', err.message);
        console.error('Server will not start.');
        process.exit(1); // Exit if DB initialization fails
    }
}

startServer();
