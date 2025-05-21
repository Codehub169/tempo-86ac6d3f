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
                throw new Error(errorData.error || errorData.message || `Failed to fetch weather data. Server responded with status: ${response.status}`);
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
    const displayWeather = (data, cityQuery, searchDate, searchTime) => {
        weatherResultsDiv.innerHTML = ''; // Clear previous results
        errorMessageDiv.style.display = 'none'; // Hide any existing error messages
        weatherDisplaySection.style.display = 'block'; // Show the weather display card

        if (!data || Object.keys(data).length === 0) {
            displayError(`No weather data found for ${cityQuery}.`);
            return;
        }
        
        // Handle cases where server returns an error object at the top level (e.g. geocoding failure before API call)
        if (data.error && !data.current && !data.hourly && !data.daily && !data.specific_time_data) {
            displayError(data.error + (data.details ? ` (Details: ${JSON.stringify(data.details)})` : ''));
            return;
        }

        let content = `<div class="weather-info">`;
        const actualCity = data.city_info && data.city_info.found_city ? data.city_info.found_city : cityQuery;
        const country = data.city_info ? data.city_info.country : null;

        content += `<p><span class="material-icons">location_on</span><strong>City:</strong> ${actualCity}</p>`;
        if (country) {
            content += `<p><span class="material-icons">public</span><strong>Country:</strong> ${country}</p>`;
        }
        
        if (searchDate) {
            content += `<p><span class="material-icons">event</span><strong>Date:</strong> ${searchDate}</p>`;
        }
        // searchTime is implicitly handled if specific_time_data is present, or by server warning

        if (data.warning) {
            content += `<p class="info-note" style="color: orange;"><span class="material-icons">warning</span> <em>Note: ${data.warning}</em></p>`;
        }

        // Case 1: Historical data for a specific time (processed by server into specific_time_data)
        if (data.specific_time_data && data.specific_time_data.time) {
            const specific = data.specific_time_data;
            const displayHour = specific.time.substring(11,16);
            content += `<h3>Weather at ${displayHour} on ${searchDate}</h3>`;
            if (specific.temperature_2m !== undefined) { content += `<p><span class="material-icons">thermostat</span> <strong>Temperature:</strong> ${specific.temperature_2m}°C</p>`; }
            if (specific.apparent_temperature !== undefined) { content += `<p><span class="material-icons">accessibility_new</span> <strong>Feels Like:</strong> ${specific.apparent_temperature}°C</p>`; }
            if (specific.relative_humidity_2m !== undefined) { content += `<p><span class="material-icons">opacity</span> <strong>Humidity:</strong> ${specific.relative_humidity_2m}%</p>`; }
            if (specific.precipitation !== undefined) { content += `<p><span class="material-icons">grain</span> <strong>Precipitation:</strong> ${specific.precipitation} mm</p>`; }
            if (specific.wind_speed_10m !== undefined) { content += `<p><span class="material-icons">air</span> <strong>Wind Speed:</strong> ${specific.wind_speed_10m} km/h</p>`; }
            if (specific.weather_code !== undefined) { content += `<p><span class="material-icons">filter_drama</span> <strong>Condition:</strong> ${getWeatherDescription(specific.weather_code)}</p>`; }
        
        // Case 2: Current weather (implies !searchDate from user form)
        } else if (data.current && !searchDate) {
            content += `<h3>Current Weather</h3>`;
            const current = data.current;
            if (current.temperature_2m !== undefined) { content += `<p><span class="material-icons">thermostat</span> <strong>Temperature:</strong> ${current.temperature_2m}°C</p>`; }
            if (current.apparent_temperature !== undefined) { content += `<p><span class="material-icons">accessibility_new</span> <strong>Feels Like:</strong> ${current.apparent_temperature}°C</p>`; }
            if (current.relative_humidity_2m !== undefined) { content += `<p><span class="material-icons">opacity</span> <strong>Humidity:</strong> ${current.relative_humidity_2m}%</p>`; }
            if (current.precipitation !== undefined) { content += `<p><span class="material-icons">grain</span> <strong>Precipitation:</strong> ${current.precipitation} mm</p>`; }
            if (current.wind_speed_10m !== undefined) { content += `<p><span class="material-icons">air</span> <strong>Wind Speed:</strong> ${current.wind_speed_10m} km/h</p>`; }
            if (current.weather_code !== undefined) { content += `<p><span class="material-icons">filter_drama</span> <strong>Condition:</strong> ${getWeatherDescription(current.weather_code)}</p>`; }
            
            // Display hourly forecast snippet if available (for current weather requests)
            if (data.hourly && data.hourly.time && data.hourly.time.length > 0) {
                content += `<h4>Next Few Hours:</h4>`;
                const hourly = data.hourly;
                let displayedFutureHours = 0;
                // Display first 3 available hourly forecasts, for example
                for (let i = 0; i < hourly.time.length && displayedFutureHours < 3; i++) {
                    if (new Date(hourly.time[i]) > new Date(current.time)) { // Ensure forecast is after current time
                        content += `<p style="font-size:0.9em;"><strong>${hourly.time[i].substring(11,16)}:</strong> Temp: ${hourly.temperature_2m[i]}°C, ${getWeatherDescription(hourly.weather_code[i])}, Precip: ${hourly.precipitation_probability ? hourly.precipitation_probability[i] + '%' : hourly.precipitation[i] + 'mm'}</p>`;
                        displayedFutureHours++;
                    }
                }
            }

        // Case 3: Historical data for a full day (no specific time requested, or specific time not found by server)
        // Or, if it's a forecast request that somehow didn't populate data.current (less likely)
        } else if (data.hourly && data.hourly.time && data.hourly.time.length > 0) {
            const hourly = data.hourly;
            const idx = 0; // Show the first hour of the day for historical, or first hour of forecast
            const timeForTitle = hourly.time[idx].substring(11,16);

            if (searchDate) {
                 content += `<h3>Weather Overview for ${searchDate} (showing data for ${timeForTitle})</h3>`;
            } else {
                content += `<h3>Hourly Data (starting ${timeForTitle})</h3>`; // Fallback title if not specifically current or historical day
            }
            if (hourly.temperature_2m && hourly.temperature_2m[idx] !== undefined) { content += `<p><span class="material-icons">thermostat</span> <strong>Temperature:</strong> ${hourly.temperature_2m[idx]}°C</p>`; }
            if (hourly.apparent_temperature && hourly.apparent_temperature[idx] !== undefined) { content += `<p><span class="material-icons">accessibility_new</span> <strong>Feels Like:</strong> ${hourly.apparent_temperature[idx]}°C</p>`; }
            if (hourly.relative_humidity_2m && hourly.relative_humidity_2m[idx] !== undefined) { content += `<p><span class="material-icons">opacity</span> <strong>Humidity:</strong> ${hourly.relative_humidity_2m[idx]}%</p>`; }
            if (hourly.precipitation && hourly.precipitation[idx] !== undefined) { content += `<p><span class="material-icons">grain</span> <strong>Precipitation:</strong> ${hourly.precipitation[idx]} mm</p>`; }
            if (hourly.wind_speed_10m && hourly.wind_speed_10m[idx] !== undefined) { content += `<p><span class="material-icons">air</span> <strong>Wind Speed:</strong> ${hourly.wind_speed_10m[idx]} km/h</p>`; }
            if (hourly.weather_code && hourly.weather_code[idx] !== undefined) { content += `<p><span class="material-icons">filter_drama</span> <strong>Condition:</strong> ${getWeatherDescription(hourly.weather_code[idx])}</p>`; }
        }

        // Case 4: Daily data (primarily for forecasts, but server might send it for historical too)
        // This is an 'if', not 'else if', so it can be displayed in addition to current/hourly data.
        if (data.daily && data.daily.time && data.daily.time.length > 0) {
            content += `<h3>Daily Summary / Forecast</h3>`;
            const daily = data.daily;
            // Display first day's summary or forecast
            const idx = 0; 
            content += `<p><strong>${new Date(daily.time[idx] + 'T00:00:00').toLocaleDateString()}:</strong></p>`; // Ensure date is parsed correctly for local display
            if (daily.temperature_2m_max && daily.temperature_2m_max[idx] !== undefined) { content += `<p><span class="material-icons">arrow_upward</span> Max Temp: ${daily.temperature_2m_max[idx]}°C</p>`; }
            if (daily.temperature_2m_min && daily.temperature_2m_min[idx] !== undefined) { content += `<p><span class="material-icons">arrow_downward</span> Min Temp: ${daily.temperature_2m_min[idx]}°C</p>`; }
            if (daily.weather_code && daily.weather_code[idx] !== undefined) { content += `<p><span class="material-icons">wb_cloudy</span> Condition: ${getWeatherDescription(daily.weather_code[idx])}</p>`; }
            if (daily.sunrise && daily.sunrise[idx]) { content += `<p><span class="material-icons">wb_sunny</span> Sunrise: ${new Date(daily.sunrise[idx]).toLocaleTimeString()}</p>`;}
            if (daily.sunset && daily.sunset[idx]) { content += `<p><span class="material-icons">brightness_3</span> Sunset: ${new Date(daily.sunset[idx]).toLocaleTimeString()}</p>`;}
        }
        
        // Fallback if no specific data sections were populated but no major error was thrown earlier
        if (content === `<div class="weather-info">`) { // Check if only the initial part of content exists
             if (data.error && data.reason) { // Display Open-Meteo API specific error if present and not caught above
                content += `<p>Error from weather service: ${data.error} - ${data.reason}</p>`;
            } else if (data.error) {
                content += `<p>Error: ${data.error}</p>`;
            } else {
                content += `<p>Weather data received, but the specific format was not recognized or no detailed data was available for your query.</p>`;
            }
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
        errorMessageDiv.textContent = message; // Use textContent to prevent XSS from error messages
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
            
            // Sanitize item.city and item.time before inserting into HTML to prevent XSS
            // Though city names from geocoding and time inputs are generally safe, it's a good practice.
            const safeCity = item.city.replace(/[<>"'&]/g, match => {
                return {
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#39;',
                    '&': '&amp;'
                }[match];
            });
            const safeTime = item.time ? item.time.replace(/[<>"'&]/g, match => {
                 return {
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#39;',
                    '&': '&amp;'
                }[match];
            }) : '';

            let details = `<span class="history-item-details"><strong>${safeCity}</strong>`;
            if (item.date) {
                // Format date as YYYY-MM-DD. API might send it as ISO string with time.
                const displayDate = item.date.split('T')[0];
                details += ` - ${new Date(displayDate + 'T00:00:00').toLocaleDateString()}`;
            }
            if (item.time) {
                details += ` at ${safeTime}`;
            }
            details += `</span>`;

            // Format timestamp for display
            const timestamp = `<span class="history-item-timestamp">${new Date(item.search_timestamp).toLocaleString()}</span>`;
            
            li.innerHTML = details + timestamp;
            // Add click event to re-run search from history
            li.addEventListener('click', () => {
                cityInput.value = item.city; // Use original item.city for input value
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
