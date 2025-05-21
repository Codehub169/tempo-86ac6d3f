// Wait for the DOM to be fully loaded before running the script
document.addEventListener('DOMContentLoaded', () => {
    // Selecting DOM elements for interaction
    const weatherForm = document.getElementById('weather-form');
    const cityInput = document.getElementById('city');
    const dateInput = document.getElementById('date');
    const timeInput = document.getElementById('time');
    const weatherResultsDiv = document.getElementById('weather-results');
    const weatherDisplaySection = document.getElementById('weather-display-section');
    const errorMessageDiv = document.getElementById('error-message');
    const searchHistoryList = document.getElementById('search-history-list');

    // Base URL for API calls (assuming server runs on same host/port)
    const API_BASE_URL = '/api';

    // Function to fetch weather data from the backend API
    const fetchWeather = async (city, date, time) => {
        let queryParams = `city=${encodeURIComponent(city)}`;
        if (date) {
            queryParams += `&date=${date}`;
            if (time) {
                // Ensure time is in HH or HH:MM format (input type=time provides HH:MM)
                queryParams += `&time=${time}`;
            }
        }

        try {
            // Make the API call to the backend weather endpoint
            const response = await fetch(`${API_BASE_URL}/weather?${queryParams}`);
            if (!response.ok) {
                // Try to parse error message from server, or use status text
                const errorData = await response.json().catch(() => ({ message: response.statusText }));
                throw new Error(errorData.message || `Failed to fetch weather data. Server responded with status: ${response.status}`);
            }
            const data = await response.json(); // Parse successful JSON response
            displayWeather(data, city, date, time); // Display the fetched weather data
            fetchSearchHistory(); // Refresh search history after a successful search
        } catch (error) {
            console.error('Error fetching weather:', error);
            displayError(error.message); // Display error message to the user
        }
    };

    // Function to display weather data on the page
    const displayWeather = (data, city, searchDate, searchTime) => {
        weatherResultsDiv.innerHTML = ''; // Clear previous results
        errorMessageDiv.style.display = 'none'; // Hide any existing error messages
        weatherDisplaySection.style.display = 'block'; // Show the weather display card

        if (!data || Object.keys(data).length === 0 || (data.error && !data.current_weather && !data.hourly && !data.daily) ) {
            displayError(data.error || `No weather data found for ${city}.`);
            return;
        }
        
        if(data.error && (data.current_weather || data.hourly || data.daily)){
            // If there's an error message but also some data, display the error as a note.
            // This handles cases where geocoding might partially succeed or API returns warnings.
            const noteDiv = document.createElement('p');
            noteDiv.className = 'info-note'; // Style this class if needed
            noteDiv.textContent = `Note: ${data.error}`;
            weatherResultsDiv.appendChild(noteDiv);
        }

        let content = `<div class="weather-info">`;
        content += `<p><span class="material-icons">location_on</span><strong>City:</strong> ${data.city || city}</p>`;

        if (searchDate) {
            content += `<p><span class="material-icons">event</span><strong>Date:</strong> ${searchDate}</p>`;
            if (searchTime) {
                content += `<p><span class="material-icons">schedule</span><strong>Time:</strong> ${searchTime}</p>`;
            }
        }
        
        // Display current weather if available
        if (data.current_weather) {
            content += `<h3>Current Weather</h3>`;
            content += `<p><span class="material-icons">thermostat</span> <strong>Temperature:</strong> ${data.current_weather.temperature}°C</p>`;
            if (data.current_weather.apparent_temperature !== undefined) {
                 content += `<p><span class="material-icons">accessibility_new</span> <strong>Feels Like:</strong> ${data.current_weather.apparent_temperature}°C</p>`;
            }
            content += `<p><span class="material-icons">air</span> <strong>Wind Speed:</strong> ${data.current_weather.windspeed} km/h</p>`;
            if (data.current_weather.weathercode !== undefined) {
                content += `<p><span class="material-icons">filter_drama</span> <strong>Condition:</strong> ${getWeatherDescription(data.current_weather.weathercode)}</p>`;
            }
        } 
        // Display hourly/historical data if available
        else if (data.hourly && data.hourly.time && data.hourly.time.length > 0) {
            const hourly = data.hourly;
            // Server.js might send back data for a specific hour or the first available hour for the date.
            // We'll display the first entry from the hourly data arrays, assuming server did the filtering.
            const idx = 0; // Assuming server sends the relevant hour's data, or first hour of the day.

            content += `<h3>Weather Details</h3>`; // General title for historical/forecasted hourly
            if (hourly.temperature_2m && hourly.temperature_2m[idx] !== undefined) {
                 content += `<p><span class="material-icons">thermostat</span> <strong>Temperature:</strong> ${hourly.temperature_2m[idx]}°C</p>`;
            }
            if (hourly.apparent_temperature && hourly.apparent_temperature[idx] !== undefined) {
                content += `<p><span class="material-icons">accessibility_new</span> <strong>Feels Like:</strong> ${hourly.apparent_temperature[idx]}°C</p>`;
            }
            if (hourly.relativehumidity_2m && hourly.relativehumidity_2m[idx] !== undefined) {
                content += `<p><span class="material-icons">opacity</span> <strong>Humidity:</strong> ${hourly.relativehumidity_2m[idx]}%</p>`;
            }
            if (hourly.windspeed_10m && hourly.windspeed_10m[idx] !== undefined) {
                content += `<p><span class="material-icons">air</span> <strong>Wind Speed:</strong> ${hourly.windspeed_10m[idx]} km/h</p>`;
            }
            if (hourly.weathercode && hourly.weathercode[idx] !== undefined) {
                content += `<p><span class="material-icons">filter_drama</span> <strong>Condition:</strong> ${getWeatherDescription(hourly.weathercode[idx])}</p>`;
            }
        } 
        // Display daily summary if available (e.g., for historical date without specific time)
        else if (data.daily && data.daily.time && data.daily.time.length > 0) {
            content += `<h3>Daily Summary for ${searchDate}</h3>`;
            const daily = data.daily;
            const idx = 0; // Assuming server sends data for the specific day
            if (daily.temperature_2m_max && daily.temperature_2m_max[idx] !== undefined) {
                content += `<p><span class="material-icons">arrow_upward</span> <strong>Max Temperature:</strong> ${daily.temperature_2m_max[idx]}°C</p>`;
            }
            if (daily.temperature_2m_min && daily.temperature_2m_min[idx] !== undefined) {
                content += `<p><span class="material-icons">arrow_downward</span> <strong>Min Temperature:</strong> ${daily.temperature_2m_min[idx]}°C</p>`;
            }
            if (daily.weathercode && daily.weathercode[idx] !== undefined) {
                content += `<p><span class="material-icons">wb_cloudy</span> <strong>Predominant Condition:</strong> ${getWeatherDescription(daily.weathercode[idx])}</p>`;
            }
        } else if (data.message && !data.error) { // If server sends a non-error message (e.g. city not found from geocoding, but not a fatal error)
             content += `<p>${data.message}</p>`;
        } else {
            // Fallback if data structure is not recognized
            content += `<p>Weather data received, but format is not recognized or data is incomplete.</p>`;
        }
        content += `</div>`;
        weatherResultsDiv.innerHTML = content;
    };
    
    // Helper function to get weather description from WMO code (Open-Meteo standard)
    const getWeatherDescription = (code) => {
        const wmoCodes = {
            0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
            45: 'Fog', 48: 'Depositing rime fog',
            51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
            56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
            61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
            66: 'Light freezing rain', 67: 'Heavy freezing rain',
            71: 'Slight snow fall', 73: 'Moderate snow fall', 75: 'Heavy snow fall',
            77: 'Snow grains',
            80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
            85: 'Slight snow showers', 86: 'Heavy snow showers',
            95: 'Thunderstorm: Slight or moderate',
            96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail'
        };
        return wmoCodes[code] || `Unknown condition (Code: ${code})`;
    };

    // Function to display error messages in the UI
    const displayError = (message) => {
        weatherResultsDiv.innerHTML = ''; // Clear any previous results
        errorMessageDiv.textContent = message;
        errorMessageDiv.style.display = 'block'; // Show the error message container
        weatherDisplaySection.style.display = 'block'; // Ensure the card is visible to show the error
    };

    // Function to fetch and display search history
    const fetchSearchHistory = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/history`);
            if (!response.ok) {
                throw new Error(`Failed to fetch history. Server responded with status: ${response.status}`);
            }
            const history = await response.json();
            displaySearchHistory(history);
        } catch (error) {
            console.error('Error fetching search history:', error);
            searchHistoryList.innerHTML = '<li class="history-placeholder">Could not load search history.</li>';
        }
    };

    // Function to display search history on the page
    const displaySearchHistory = (history) => {
        searchHistoryList.innerHTML = ''; // Clear previous history items
        if (history.length === 0) {
            searchHistoryList.innerHTML = '<li class="history-placeholder">No searches yet. Your recent searches will appear here.</li>';
            return;
        }
        history.forEach(item => {
            const li = document.createElement('li');
            
            let details = `<span class="history-item-details"><strong>${item.city}</strong>`;
            if (item.date) {
                // Format date as YYYY-MM-DD. API might send it as ISO string with time.
                const displayDate = item.date.split('T')[0];
                details += ` - ${new Date(displayDate + 'T00:00:00').toLocaleDateString()}`; // Ensure correct local date parsing
            }
            if (item.time) {
                details += ` at ${item.time}`;
            }
            details += `</span>`;

            // Format timestamp for display
            const timestamp = `<span class="history-item-timestamp">${new Date(item.search_timestamp).toLocaleString()}</span>`;
            
            li.innerHTML = details + timestamp;
            // Add click event to re-run search from history
            li.addEventListener('click', () => {
                cityInput.value = item.city;
                dateInput.value = item.date ? item.date.split('T')[0] : ''; // Ensure YYYY-MM-DD format for input
                timeInput.value = item.time || '';
                // Trigger form submission
                weatherForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            });
            li.style.cursor = 'pointer'; // Indicate clickable item
            searchHistoryList.appendChild(li);
        });
    };

    // Event listener for weather search form submission
    weatherForm.addEventListener('submit', (event) => {
        event.preventDefault(); // Prevent default page reload
        const city = cityInput.value.trim();
        const date = dateInput.value; // YYYY-MM-DD format from input type=date
        const time = timeInput.value; // HH:MM format from input type=time

        if (!city) {
            displayError('City name is required. Please enter a city.');
            return;
        }
        
        // Clear previous results and errors before new search
        weatherResultsDiv.innerHTML = '';
        errorMessageDiv.style.display = 'none';
        weatherDisplaySection.style.display = 'none'; // Hide until new data is ready or error occurs

        fetchWeather(city, date, time); // Initiate weather data fetching
    });

    // Initial fetch of search history when the page loads
    fetchSearchHistory();
});
