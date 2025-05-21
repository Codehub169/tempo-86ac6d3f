const express = require('express');
const path = require('path');
const fetch = require('node-fetch'); // Using node-fetch v2 for CommonJS compatibility
const db = require('./database.js'); // Database interaction module (to be created)

const app = express();
const PORT = process.env.PORT || 9000;

// Middleware
app.use(express.json()); // Parses incoming JSON requests
app.use(express.static(path.join(__dirname, 'public'))); // Serves static files from the 'public' directory

// Initialize database (function will be in database.js)
db.initializeDB().then(() => {
    console.log('Database initialized.');
}).catch(err => {
    console.error('Failed to initialize database:', err);
});

// --- API Endpoints ---

// Geocoding function using Open-Meteo's Geocoding API
async function getCoordinates(city) {
    const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
    try {
        const response = await fetch(geocodeUrl);
        const data = await response.json();
        if (data.results && data.results.length > 0) {
            return {
                latitude: data.results[0].latitude,
                longitude: data.results[0].longitude,
                name: data.results[0].name, // Actual name found
                country: data.results[0].country
            };
        }
        return null;
    } catch (error) {
        console.error('Geocoding error:', error);
        return null;
    }
}

// GET /api/weather - Fetch current or historical weather
app.get('/api/weather', async (req, res) => {
    const { city, date, time } = req.query;

    if (!city) {
        return res.status(400).json({ error: 'City parameter is required' });
    }

    const coordinates = await getCoordinates(city);
    if (!coordinates) {
        return res.status(404).json({ error: `Could not find coordinates for city: ${city}` });
    }

    const { latitude, longitude, name: actualCityName, country } = coordinates;
    let weatherApiUrl;
    let isHistorical = false;

    if (date) { // Historical weather
        isHistorical = true;
        // Validate date format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
        }
        // For historical, Open-Meteo requires start_date and end_date. We use the same date for both.
        weatherApiUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${date}&end_date=${date}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto`;
    } else { // Current/Forecast weather
        weatherApiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto`;
    }

    try {
        const weatherResponse = await fetch(weatherApiUrl);
        if (!weatherResponse.ok) {
            const errorData = await weatherResponse.json();
            console.error('Open-Meteo API Error:', errorData);
            return res.status(weatherResponse.status).json({ error: 'Failed to fetch weather data from Open-Meteo', details: errorData });
        }
        const weatherData = await weatherResponse.json();

        // If a specific time is requested for historical data, try to find it.
        let finalWeatherData = weatherData;
        if (isHistorical && time && weatherData.hourly) {
            // Validate time format (HH:MM or HH)
            const timeParts = time.split(':');
            const hour = parseInt(timeParts[0], 10);
            if (isNaN(hour) || hour < 0 || hour > 23) {
                return res.status(400).json({ error: 'Invalid time format. Use HH or HH:MM (24-hour format).' });
            }
            
            const targetDateTime = `${date}T${hour.toString().padStart(2, '0')}:00`;
            const hourlyIndex = weatherData.hourly.time.findIndex(t => t.startsWith(targetDateTime));

            if (hourlyIndex !== -1) {
                const specificHourData = {};
                for (const key in weatherData.hourly) {
                    if (Array.isArray(weatherData.hourly[key])) {
                        specificHourData[key] = weatherData.hourly[key][hourlyIndex];
                    }
                }
                finalWeatherData = { ...weatherData, specific_time_data: specificHourData, requested_time: targetDateTime };
            } else {
                finalWeatherData = { ...weatherData, warning: `No data for specified hour ${time} on ${date}. Returning daily historical data.`, requested_time: targetDateTime };
            }
        }
        
        // Add city name information to response
        finalWeatherData.city_info = { requested_city: city, found_city: actualCityName, country };

        // Save search to history (async, don't wait for it to respond to user)
        db.addSearchToHistory(actualCityName, date || null, time || null)
            .catch(err => console.error('Error saving search to history:', err));

        res.json(finalWeatherData);

    } catch (error) {
        console.error('Server error fetching weather:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/history - Fetch search history
app.get('/api/history', async (req, res) => {
    try {
        const history = await db.getSearchHistory();
        res.json(history);
    } catch (error) {
        console.error('Error fetching search history:', error);
        res.status(500).json({ error: 'Failed to fetch search history' });
    }
});

// Serve index.html for the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
